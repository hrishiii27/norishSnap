/**
 * NourishSnap AI — Agent B: Database Retriever
 * Cross-references parsed food names from Agent A against the local food dictionary.
 * Fuzzy-matches regional aliases and calculates per-serving macros.
 */

let foodDictionary = null;

/**
 * Load the food dictionary JSON.
 */
async function ensureDictionary() {
  if (foodDictionary) return;
  try {
    const res = await fetch('/js/data/food-dictionary.json');
    foodDictionary = await res.json();
  } catch (err) {
    console.error('Failed to load food dictionary:', err);
    foodDictionary = [];
  }
}

/**
 * Look up nutritional data for a list of AI-parsed food items.
 * @param {Array} parsedItems - Output from Agent A (vision-parser)
 * @returns {Array} Enriched food items with nutritional breakdown
 */
export async function enrichWithNutrition(parsedItems) {
  await ensureDictionary();

  return parsedItems.map((item) => {
    const match = findBestMatch(item.food_name_raw);

    const weight = item.estimated_weight_grams || 100;
    const multiplier = weight / 100;

    // Calculate macros from reference data
    let calories, protein, carbs, fats, fiber;

    if (match) {
      calories = Math.round(match.calories_per_100g * multiplier);
      protein = +(match.protein_per_100g * multiplier).toFixed(1);
      carbs = +(match.carbs_per_100g * multiplier).toFixed(1);
      fats = +(match.fats_per_100g * multiplier).toFixed(1);
      fiber = +((match.fiber_per_100g || 0) * multiplier).toFixed(1);

      // Add hidden fat overhead if detected
      if (item.hidden_fat_detected && item.fat_overhead_grams) {
        const fatCals = Math.round(item.fat_overhead_grams * 9);
        calories += fatCals;
        fats += item.fat_overhead_grams;
      }
    } else {
      // Fallback: rough estimate when no dictionary match
      calories = Math.round(weight * 1.5); // ~150 cal per 100g default
      protein = +(weight * 0.04).toFixed(1); // Reduced from 0.08 to 0.04 to prevent ~5g overestimation
      carbs = +(weight * 0.2).toFixed(1);
      fats = +(weight * 0.05).toFixed(1);
      fiber = 0;
    }

    return {
      ...item,
      reference_match: match?.standard_name || match?.name || null,
      reference_id: match?.id || null,
      weight_grams: weight,
      calories,
      protein,
      carbs,
      fats,
      fiber,
      household_unit: match?.household_unit_label || 'serving',
      household_unit_weight_g: match?.household_unit_weight_g || weight,
      display_unit: 'grams', // Default; user can toggle
      was_ai_predicted: true,
      was_user_corrected: false,
    };
  });
}

/**
 * Find the best matching food entry in the dictionary.
 * Uses exact match first, then fuzzy regional alias matching.
 * @param {string} foodName - Raw food name from AI
 * @returns {object|null} Matched dictionary entry
 */
function findBestMatch(foodName) {
  if (!foodDictionary || !foodName) return null;

  const normalized = foodName.toLowerCase().trim();

  // 1. Exact standard_name match
  let match = foodDictionary.find(
    (entry) => (entry.standard_name || entry.name).toLowerCase() === normalized
  );
  if (match) return match;

  // 2. Regional alias match
  match = foodDictionary.find((entry) =>
    entry.regional_aliases?.some(
      (alias) => alias.toLowerCase() === normalized
    )
  );
  if (match) return match;

  // 3. Partial / fuzzy match (contains)
  match = foodDictionary.find(
    (entry) =>
      normalized.includes((entry.standard_name || entry.name).toLowerCase()) ||
      (entry.standard_name || entry.name).toLowerCase().includes(normalized)
  );
  if (match) return match;

  // 4. Token overlap scoring
  const nameTokens = normalized.split(/\s+/);
  let bestScore = 0;
  let bestEntry = null;

  for (const entry of foodDictionary) {
    const entryTokens = (entry.standard_name || entry.name).toLowerCase().split(/\s+/);
    const allTokens = [
      ...entryTokens,
      ...(entry.regional_aliases || []).flatMap((a) =>
        a.toLowerCase().split(/\s+/)
      ),
    ];

    const overlap = nameTokens.filter((t) =>
      allTokens.some((et) => et.includes(t) || t.includes(et))
    ).length;

    const score = overlap / Math.max(nameTokens.length, 1);
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

/**
 * Recalculate macros for a single item when weight or food changes.
 * Called by Agent C (Logic Adjuster).
 * @param {string} foodName - New food name
 * @param {number} newWeight - New weight in grams
 * @param {object} existingItem - Current item data
 * @returns {object} Updated item with recalculated macros
 */
export async function recalculateItem(foodName, newWeight, existingItem) {
  await ensureDictionary();

  const match = findBestMatch(foodName);
  const multiplier = newWeight / 100;

  if (match) {
    return {
      ...existingItem,
      food_name_raw: foodName,
      reference_match: match.standard_name || match.name,
      reference_id: match.id,
      weight_grams: newWeight,
      calories: Math.round(match.calories_per_100g * multiplier),
      protein: +(match.protein_per_100g * multiplier).toFixed(1),
      carbs: +(match.carbs_per_100g * multiplier).toFixed(1),
      fats: +(match.fats_per_100g * multiplier).toFixed(1),
      fiber: +((match.fiber_per_100g || 0) * multiplier).toFixed(1),
      household_unit: match.household_unit_label,
      household_unit_weight_g: match.household_unit_weight_g,
      was_user_corrected: true,
    };
  }

  // Keep existing ratios if no match
  const oldWeight = existingItem.weight_grams || 100;
  const ratio = newWeight / oldWeight;

  return {
    ...existingItem,
    food_name_raw: foodName,
    weight_grams: newWeight,
    calories: Math.round(existingItem.calories * ratio),
    protein: +(existingItem.protein * ratio).toFixed(1),
    carbs: +(existingItem.carbs * ratio).toFixed(1),
    fats: +(existingItem.fats * ratio).toFixed(1),
    was_user_corrected: true,
  };
}
