// /api/diagnose.js — Vercel Serverless Function
// Calls Claude API to generate a hair diagnosis from photos + questionnaire answers

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { answers, photos, name } = req.body;

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
      text: buildPrompt(answers, name)
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
        max_tokens: 3000,
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

function buildPrompt(a, name) {
  const userName = name ? name.trim() : null;
  return `You are analysing three hair photographs for the Hebra hair diagnosis platform.
${userName ? `\nThe client's name is ${userName}. Address her by name throughout the diagnosis — in the summary, key_finding, and at least two findings. This makes the diagnosis feel personal and specific to her.` : ''}

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

PHOTO ANALYSIS INSTRUCTIONS:
- Photo 1 is the CROWN — analyse root density, scalp condition, new growth, sebum distribution
- Photo 2 is the SIDE PROFILE — analyse mid-length texture, cuticle condition, wave/curl pattern, volume
- Photo 3 is the ENDS — analyse split ends, moisture retention, damage level, porosity

Cross-reference what you see in the photos with the questionnaire answers. If the answers say "damaged" but the photos show relatively healthy ends, note the discrepancy. If the climate is humid and you see frizz, connect them explicitly.

The summary must feel like it was written specifically for this person — mention at least one specific visual observation from the photos.

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

const SYSTEM_PROMPT = `You are Hebra's lead hair diagnostician — a clinical trichologist with 20 years of experience who also happens to communicate like a trusted friend.

Your role is to analyse three photographs of a person's hair (crown, side profile, ends) alongside their self-reported questionnaire data, and produce a diagnosis that feels genuinely personal and specific — not generic.

WHAT MAKES A GREAT DIAGNOSIS:
1. Reference the photos directly and specifically. Say things like "The crown photograph reveals..." or "Looking at the ends in the third image..." — the person needs to feel you actually looked at their hair, not generated a template.
2. Connect causes to symptoms. Don't just say "your hair is dry" — explain WHY: "The combination of hard water mineral buildup and daily heat use is stripping your cuticle layer faster than it can recover."
3. Be precise with environmental context. If they live in a humid climate, explain how that affects their specific hair type. If they use hard water, name the consequences specifically.
4. Surprise them with one observation they didn't expect — something they hadn't connected before. This is the moment they trust Hebra.
5. The routine steps must be concrete and actionable — not "deep condition weekly" but "apply a protein-free mask to mid-lengths and ends only, leave for 20 minutes under a shower cap, rinse with cool water to seal the cuticle."

TONE: Clinical precision meets human warmth. Like a Parisian dermatologist who genuinely cares — direct, specific, never condescending. Zero filler phrases like "it's important to" or "you should consider."

SCORES: Be honest. Not everyone gets 85+. A damaged profile should score 45-60 in the affected areas. Scores that are too high feel fake.

Always return valid JSON only. Never include markdown fences. Never explain yourself outside the JSON.`;
