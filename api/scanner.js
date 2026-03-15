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

  const PROMPT = `You are a professional hair care ingredient expert with deep knowledge of cosmetic chemistry, trichology, and hair care products worldwide.

You will receive an image. It may show a full ingredient list, only the product name/brand, or both.

Your task:
- If you can READ ingredients directly from the label: analyse those
- If you can only see the PRODUCT NAME/BRAND (e.g. "Dercos Aminexil", "Olaplex No.3", "Kérastase Résistance"): identify the product and list its known ingredients from your training knowledge
- If you recognise the product partially: combine what you see with your knowledge

Return ONLY a raw JSON object, no markdown, no backticks:
{
  "product_name": "Full product name as best identified",
  "source": "label" | "knowledge" | "combined",
  "ingredients": [
    {
      "ingredient": "ingredient name",
      "effect": "beneficial" | "neutral" | "harmful",
      "explanation": "2-3 sentences: what it does, which hair types it helps or harms, and why."
    }
  ]
}

Rules for effect:
- "harmful": sulfates that strip, drying alcohols (SD Alcohol, Alcohol Denat.), formaldehyde donors, heavy silicone build-up
- "beneficial": proteins, oils, ceramides, panthenol, niacinamide, aminexil, active repair agents
- "neutral": texture, preservation, pH function without notable benefit or harm

If you truly cannot identify anything, return your best attempt with whatever is visible.`;

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

