export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  let image, mediaType;
  try {
    ({ image, mediaType } = req.body);
  } catch(e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (!image) return res.status(400).json({ error: 'Missing image data' });

  // Strip base64 prefix if present (data:image/jpeg;base64,...)
  const cleanImage = image.replace(/^data:[^;]+;base64,/, '');
  const cleanMediaType = mediaType || 'image/jpeg';

  const PROMPT = `You are a professional hair care ingredient expert with deep knowledge of cosmetic chemistry.

Analyze the product label in this image. Read every ingredient visible.

Return ONLY a raw JSON object with this exact structure, no markdown, no backticks:
{
  "product_name": "Name of the product if visible, otherwise null",
  "ingredients": [
    {
      "ingredient": "exact ingredient name",
      "effect": "beneficial",
      "explanation": "2-3 sentences on what it does, which hair types it helps or harms."
    }
  ]
}

effect must be exactly one of: "beneficial", "neutral", "harmful"`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: cleanMediaType, data: cleanImage }
            },
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude error:', errText);
      return res.status(502).json({ error: 'AI error: ' + claudeRes.status });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // Extract JSON — strip any markdown fences
    const clean = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');

    const result = JSON.parse(match[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Scanner error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

