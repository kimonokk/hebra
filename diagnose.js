// /api/diagnose.js — Vercel Serverless Function
// Calls Claude API to generate a hair diagnosis from photos + questionnaire answers

export default async function handler(req, res) {
  // Only allow POST
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

  // Build the message content with photos + context
  const userContent = [
    // Photo 1 — Crown
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(photos[0]),
        data: stripBase64Prefix(photos[0])
      }
    },
    // Photo 2 — Side/mid-lengths
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(photos[1]),
        data: stripBase64Prefix(photos[1])
      }
    },
    // Photo 3 — Ends
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: getMediaType(photos[2]),
        data: stripBase64Prefix(photos[2])
      }
    },
    {
      type: 'text',
      text: buildPrompt(answers)
    }
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
        system: SYSTEM_PROMPT,
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

    // Parse JSON from Claude's response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const diagnosis = JSON.parse(jsonMatch[0]);

    return res.status(200).json(diagnosis);

  } catch (err) {
    console.error('Diagnosis error:', err);
    return res.status(500).json({ error: 'Diagnosis generation failed' });
  }
}

/* ── HELPERS ── */

function stripBase64Prefix(dataUrl) {
  return dataUrl.replace(/^data:[^;]+;base64,/, '');
}

function getMediaType(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/jpeg';
}

function buildPrompt(a) {
  return `You are analysing three hair photographs for the Hebra hair diagnosis platform.

The user's self-reported profile:
- Hair state: ${a.hair_state || 'unknown'}
- Scalp condition: ${a.scalp || 'unknown'}
- Wash frequency: ${a.wash_freq || 'unknown'}
- Chemical treatments: ${(a.treatments || []).join(', ') || 'none'}
- Climate: ${a.climate || 'unknown'}
- Water type: ${a.water || 'unknown'}
- Heat styling frequency: ${a.heat || 'unknown'}
- Products currently used: ${(a.products || []).join(', ') || 'none'}
- Main concerns: ${(a.concerns || []).join(', ') || 'none'}
- Routine time available: ${a.time || 'unknown'}

Based on the three photos (crown, side profile, ends) and the questionnaire above, provide a complete hair diagnosis in the exact JSON format below. Be specific, observational, and use professional but accessible language.

Return ONLY valid JSON, no markdown, no preamble:

{
  "overall": <integer 0-100>,
  "scores": {
    "scalp_health": <integer 0-100>,
    "strand_strength": <integer 0-100>,
    "moisture_balance": <integer 0-100>,
    "structural_integrity": <integer 0-100>,
    "vitality_index": <integer 0-100>
  },
  "hair_type_label": "<descriptive label, e.g. 'Wavy Type 2B'>",
  "summary": "<2-3 sentences. Holistic assessment of the hair profile based on photos and answers.>",
  "key_finding": "<1-2 sentences. The single most important finding from photo analysis.>",
  "findings": [
    {
      "category": "<Scalp|Texture|Porosity|Damage>",
      "title": "<short title>",
      "desc": "<2-3 sentences specific observation from photos and answers>"
    },
    { "category": "...", "title": "...", "desc": "..." },
    { "category": "...", "title": "...", "desc": "..." },
    { "category": "...", "title": "...", "desc": "..." }
  ],
  "routine": [
    { "step": "01", "title": "<routine step name>", "desc": "<specific instruction, 2-3 sentences>" },
    { "step": "02", "title": "<routine step name>", "desc": "<specific instruction>" },
    { "step": "03", "title": "<routine step name>", "desc": "<specific instruction>" }
  ],
  "products": [
    {
      "rank": "01",
      "name": "<real product name>",
      "brand": "<brand name>",
      "reason": "<why this product for this specific diagnosis, 1-2 sentences>",
      "link": "https://www.amazon.com/s?k=<url-encoded-product-name>&tag=hebrahair-20"
    },
    { "rank": "02", "name": "...", "brand": "...", "reason": "...", "link": "..." },
    { "rank": "03", "name": "...", "brand": "...", "reason": "...", "link": "..." }
  ]
}`;
}

const SYSTEM_PROMPT = `You are Hebra's AI hair diagnostician. You analyse hair photographs with clinical precision and provide personalised, science-backed hair diagnoses.

Your analysis examines:
- Scalp visibility, sebum distribution, and condition
- Cuticle layer smoothness or roughness (visible through light reflection)
- Porosity indicators (frizz, dullness, gel cast, water absorption patterns)
- Strand strength and elasticity (via texture, breakage patterns, density)
- Moisture retention and balance
- Chemical and heat damage signatures

Your tone is: expert, warm, honest, precise. Like a premium trichologist, not a generic chatbot.

Always return valid JSON only. Never include markdown fences. Never explain yourself outside the JSON.`;
