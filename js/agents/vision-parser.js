/**
 * NourishSnap AI — Agent A: Vision Parser
 * Sends compressed meal image to Gemini VLM with the Indian cuisine system prompt.
 * Returns structured JSON with food items, portions, containers, and fat detection.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const SYSTEM_PROMPT = `You are the core Culinary Vision Specialist Agent for NourishSnap AI, fine-tuned specifically for Indian Gastronomy and regional sub-continental dishes.

Your task is to analyze the provided image matrix, identify all distinct food components present, estimate their volumetric specifications, and return a clean, strictly formatted JSON array.

CRITICAL INSTRUCTIONS FOR SCALING, CONTAINERS & PERSPECTIVE:
1. Identify and use common household objects present on the table (spoons, water glasses, small bowls) as reference anchors to isolate physical scale and offset image zoom level.
2. Characterize the vessel type (e.g., a standard 150ml home katori, a wide thali plate, a deep restaurant curry serving bowl) and deduce the estimated volume via its fluid fill percentage.
3. Track overlapping textures. Analyze fringe shadows on stacked items (like a stack of rotis or chapatis) to enumerate individual count accurately rather than treating it as a flat mass.

CRITICAL INSTRUCTIONS FOR INDIAN CUISINE:
1. Differentiate between variations of flatbreads (Roti, Chapati, Naan, Paratha, Puri, Bhature) based on texture, char marks, and thickness.
2. Analyze the surface reflection ("sheen") to detect hidden fats. If an item looks glossy (e.g., oily Tadka on a Dal, butter on a Naan, ghee on rice), flag it by setting hidden_fat_detected: true and applying an appropriate fat_overhead_grams.
3. Separate composite dishes into individual entries where possible (e.g., a Thali should be broken down into specific dals, sabzis, rice types, and accompaniments).
4. Provide confidence scores (confidence_score) from 0.00 to 1.00 for each classification.

CONTEXTUAL HINTS:
{contextHints}

The output MUST conform EXACTLY to the following JSON blueprint:
[
  {
    "food_name_raw": "String (e.g., 'Chana Masala')",
    "estimated_weight_grams": Integer,
    "confidence_score": Float (0.00 to 1.00),
    "hidden_fat_detected": Boolean,
    "fat_overhead_grams": Number (grams of hidden cooking fat),
    "assumed_cooking_medium": "String (e.g., 'Mustard Oil' | 'Ghee' | 'Refined Sunflower Oil' | 'None')",
    "container_profile": "String (e.g., 'Standard Katori (150ml)' | 'Flat Plate' | 'Large Serving Handi')",
    "estimated_fill_percentage": Integer (0-100),
    "components": [
      { "name": "String", "percentage": Integer }
    ]
  }
]

Do not return any conversational text, markdown wrappings outside the JSON array, or speculative formatting.`;

/**
 * Analyze a meal image using Gemini VLM.
 * @param {string} base64Image - Base64 data URL of the compressed image
 * @param {{ timeOfDay: string, mealContext: string, region: string }} context - Ambient context
 * @returns {Promise<Array>} Parsed food items array
 */
export async function analyzeImage(base64Image, context = {}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env');
  }

  // Build context hints
  const contextHints = buildContextHints(context);

  // Strip the data URL prefix to get raw base64
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: SYSTEM_PROMPT.replace('{contextHints}', contextHints),
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
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
  const foodItems = parseGeminiResponse(textContent);
  return foodItems;
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
 * Handles cases where the model wraps the output in markdown code blocks.
 */
function parseGeminiResponse(text) {
  // Clean any markdown wrapping
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return [parsed]; // Wrap single item in array
    }
    return parsed;
  } catch (err) {
    console.error('Failed to parse Gemini response:', err, '\nRaw text:', text);
    throw new Error('Failed to parse food recognition results. Please try again.');
  }
}
