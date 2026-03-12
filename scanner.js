export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const PROMPT = `You are a professional hair care ingredient expert with deep knowledge of cosmetic chemistry and trichology.

Analyze the product label in this image carefully. Read every ingredient you can see.

Return a JSON object with this exact structure:
{
  "product_name": "Name of the product if visible, otherwise null",
  "ingredients": [
    {
      "ingredient": "exact ingredient name as written on label",
      "effect": "beneficial" | "neutral" | "harmful",
      "explanation": "2-3 sentences explaining what this ingredient does, which hair types it helps or harms, and why. Be specific and practical."
    }
  ]
}

Rules:
- effect must be exactly one of: "beneficial", "neutral", "harmful"
- "harmful" means genuinely problematic for most hair types (e.g. sulfates that strip, drying alcohols, formaldehyde donors)
- "beneficial" means actively nourishing, repairing, or protective
- "neutral" means present for texture, preservation, or function without notable benefit or harm
- If you cannot read the label clearly, still list what you can see and note uncertainty in the explanation
- Output ONLY the raw JSON object. No markdown, no backticks, no preamble.`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image
              }
            },
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude API error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text;

    const clean = rawText.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Scanner error:', err);
    return res.status(500).json({ error: 'Scan failed: ' + err.message });
  }
}
