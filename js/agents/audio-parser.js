/**
 * NourishSnap AI — Agent C: Audio Parser (Voice-to-Text)
 * Sends voice transcript to Gemini with the Indian cuisine system prompt.
 * Returns structured JSON with food items, portions, containers, and fat detection.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are the Culinary Audio Specialist Agent for NourishSnap AI, fine-tuned specifically for Indian Gastronomy and regional sub-continental dishes.

Your task is to analyze the provided voice transcript of a user describing their meal, identify all distinct food components mentioned, estimate their volumetric specifications or parse explicit weights/portions mentioned by the user, and return a clean, strictly formatted JSON array.

CRITICAL INSTRUCTIONS FOR PORTIONS & SIZES:
1. If the user mentions explicit counts (e.g. "two rotis", "3 idlis"), map that to standard weights.
2. If the user mentions containers (e.g. "one small katori", "one large bowl"), deduce the estimated volume/weight.
3. If no size is specified, assume standard Indian household portion sizes (e.g., 1 katori = ~150g, 1 standard roti = ~40g).

CRITICAL INSTRUCTIONS FOR INDIAN CUISINE:
1. Deduce hidden cooking fats based on the dish type unless the user explicitly says "no oil" or "boiled". For example, Dal Makhani implies butter/cream. Butter Chicken implies butter.
2. Separate composite dishes into individual entries where possible (e.g., a Thali description should be broken down).
3. Provide confidence scores (confidence_score) from 0.00 to 1.00 based on how clear and unambiguous the user's description was.

CONTEXTUAL HINTS:
{contextHints}

The output MUST conform EXACTLY to the following JSON blueprint:
[
  {
    "food_name_raw": "String (e.g., 'Chana Masala')",
    "estimated_weight_grams": Integer,
    "confidence_score": Float (0.00 to 1.00),
    "hidden_fat_detected": Boolean,
    "fat_overhead_grams": Number (grams of hidden cooking fat, 0 if none),
    "assumed_cooking_medium": "String (e.g., 'Mustard Oil' | 'Ghee' | 'Refined Sunflower Oil' | 'None')",
    "container_profile": "String (e.g., 'Standard Katori (150ml)' | 'Flat Plate' | 'Large Serving Handi' | 'Explicit Count')",
    "estimated_fill_percentage": Integer (0-100),
    "components": [
      { "name": "String", "percentage": Integer }
    ]
  }
]

Do not return any conversational text, markdown wrappings outside the JSON array, or speculative formatting.`;

/**
 * Analyze a voice transcript using Gemini.
 * @param {string} transcript - The spoken text from the user.
 * @param {{ timeOfDay: string, mealContext: string, region: string }} context - Ambient context
 * @returns {Promise<Array>} Parsed food items array
 */
export async function analyzeTranscript(transcript, context = {}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env');
  }

  // Build context hints
  const contextHints = buildContextHints(context);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: SYSTEM_PROMPT.replace('{contextHints}', contextHints),
          },
          {
            text: `USER TRANSCRIPT: "${transcript}"`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Extract the text response from Gemini
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Empty response from Gemini API');
  }

  // Parse the JSON array from response
  return parseGeminiResponse(textContent);
}

/**
 * Build contextual hints string for the system prompt.
 */
function buildContextHints(context) {
  const hints = [];

  if (context.timeOfDay) {
    hints.push(`Current time of day: ${context.timeOfDay}`);
  }
  if (context.mealContext) {
    hints.push(`Likely meal type: ${context.mealContext}`);
  }
  if (context.region) {
    hints.push(`User region (approximate): ${context.region}`);
  }

  return hints.length > 0
    ? hints.join('\n')
    : 'No additional context available.';
}

/**
 * Parse and validate the JSON response from Gemini.
 */
function parseGeminiResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [parsed];
    return parsed;
  } catch (err) {
    console.error('Failed to parse Gemini response:', err, '\nRaw text:', text);
    throw new Error('Failed to parse voice transcript results. Please try again.');
  }
}
