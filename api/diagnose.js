export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { answers, photos } = req.body;

  if (!answers || !photos || photos.length < 3) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const userContent = [
    { type: 'image', source: { type: 'base64', media_type: getMediaType(photos[0]), data: stripBase64Prefix(photos[0]) } },
    { type: 'image', source: { type: 'base64', media_type: getMediaType(photos[1]), data: stripBase64Prefix(photos[1]) } },
    { type: 'image', source: { type: 'base64', media_type: getMediaType(photos[2]), data: stripBase64Prefix(photos[2]) } },
    { type: 'text', text: buildPrompt(answers) }
  ];

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
        system: `You are Hebra's AI hair diagnostician. Analyse hair photographs with clinical precision. Your tone is expert, warm, honest. Always return valid JSON only, no markdown fences.`,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude API error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const diagnosis = JSON.parse(jsonMatch[0]);
    return res.status(200).json(diagnosis);

  } catch (err) {
    console.error('Diagnosis error:', err);
    return res.status(500).json({ error: 'Diagnosis generation failed' });
  }
}

function stripBase64Prefix(dataUrl) {
  return dataUrl.replace(/^data:[^;]+;base64,/, '');
}

function getMediaType(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

function buildPrompt(a) {
  return `Analyse these three hair photos and the profile below. Return ONLY valid JSON.

Profile:
- Texture: ${a.hair_type || 'unknown'}
- Density: ${a.density || 'unknown'}
- Scalp: ${a.scalp || 'unknown'}
- Chemical treatments: ${a.damage || 'none'}
- Heat styling: ${a.heat || 'occasional'}
- Wash frequency: ${a.wash_freq || 'weekly'}
- Primary concern: ${a.concern || 'general health'}
- Diet: ${a.diet || 'average'}
- Goal: ${a.goal || 'strength'}

Return this exact JSON structure:
{
  "overall": <0-100>,
  "scores": {
    "scalp_health": <0-100>,
    "strand_strength": <0-100>,
    "moisture_balance": <0-100>,
    "structural_integrity": <0-100>,
    "vitality_index": <0-100>
  },
  "hair_type_label": "<e.g. Wavy Type 2B>",
  "summary": "<2-3 sentences holistic assessment>",
  "key_finding": "<1-2 sentences most important finding>",
  "findings": [
    {"category": "<Scalp|Texture|Porosity|Damage>", "title": "<title>", "desc": "<2-3 sentences>"},
    {"category": "...", "title": "...", "desc": "..."},
    {"category": "...", "title": "...", "desc": "..."},
    {"category": "...", "title": "...", "desc": "..."}
  ],
  "routine": [
    {"step": "01", "title": "<name>", "desc": "<instruction>"},
    {"step": "02", "title": "<name>", "desc": "<instruction>"},
    {"step": "03", "title": "<name>", "desc": "<instruction>"}
  ],
  "products": [
    {"rank": "01", "name": "<product>", "brand": "<brand>", "reason": "<why>", "link": "https://www.amazon.com/s?k=<product+name>&tag=hebrahair-20"},
    {"rank": "02", "name": "...", "brand": "...", "reason": "...", "link": "..."},
    {"rank": "03", "name": "...", "brand": "...", "reason": "...", "link": "..."}
  ]
}`;
}
