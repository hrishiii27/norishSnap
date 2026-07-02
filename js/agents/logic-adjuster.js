/**
 * NourishSnap AI — Agent C: Logic Adjuster
 * Handles user corrections, recalculates macros, and manages Smart Revision Memory.
 * Per FR-3.3: remembers user preference overrides for future sessions.
 */

import { recalculateItem } from './database-retriever.js';

const REVISION_MEMORY_KEY = 'nourishsnap_revision_memory';

/**
 * Get the Smart Revision Memory from localStorage.
 * @returns {Object} Map of { trigger_phrase: { replacement_name, correction_count, last_corrected_at } }
 */
function getRevisionMemory() {
  try {
    const raw = localStorage.getItem(REVISION_MEMORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save Smart Revision Memory to localStorage.
 */
function saveRevisionMemory(memory) {
  localStorage.setItem(REVISION_MEMORY_KEY, JSON.stringify(memory));
}

/**
 * Apply Smart Revision Memory to AI-parsed items.
 * If a user has previously corrected "Dal" → "Yellow Moong Dal Tadka" multiple times,
 * automatically apply that preference.
 * @param {Array} items - Raw parsed items from Agent A
 * @returns {Array} Items with revisions applied
 */
export function applyRevisionMemory(items) {
  const memory = getRevisionMemory();

  return items.map((item) => {
    const trigger = item.food_name_raw.toLowerCase().trim();
    const revision = memory[trigger];

    if (revision && revision.correction_count >= 2) {
      return {
        ...item,
        food_name_raw: revision.replacement_name,
        _original_ai_name: item.food_name_raw,
        _auto_revised: true,
      };
    }

    return item;
  });
}

/**
 * Record a user correction in Smart Revision Memory.
 * @param {string} originalAiName - The AI's original prediction
 * @param {string} userCorrectedName - What the user changed it to
 */
export function recordCorrection(originalAiName, userCorrectedName) {
  if (!originalAiName || !userCorrectedName) return;
  if (originalAiName.toLowerCase() === userCorrectedName.toLowerCase()) return;

  const memory = getRevisionMemory();
  const trigger = originalAiName.toLowerCase().trim();

  if (memory[trigger]) {
    memory[trigger].correction_count += 1;
    memory[trigger].replacement_name = userCorrectedName;
    memory[trigger].last_corrected_at = new Date().toISOString();
  } else {
    memory[trigger] = {
      replacement_name: userCorrectedName,
      correction_count: 1,
      last_corrected_at: new Date().toISOString(),
    };
  }

  saveRevisionMemory(memory);
}

/**
 * Handle a food name change by the user.
 * Recalculates macros and records the correction.
 * @param {object} item - Current food item
 * @param {string} newName - New name from user
 * @returns {Promise<object>} Updated item
 */
export async function handleNameChange(item, newName) {
  const originalName = item._original_ai_name || item.food_name_raw;
  recordCorrection(originalName, newName);

  const updated = await recalculateItem(newName, item.weight_grams, item);
  updated._original_ai_name = originalName;
  return updated;
}

/**
 * Handle a weight change by the user.
 * Recalculates macros proportionally.
 * @param {object} item - Current food item
 * @param {number} newWeight - New weight in grams
 * @returns {Promise<object>} Updated item
 */
export async function handleWeightChange(item, newWeight) {
  return recalculateItem(item.food_name_raw, newWeight, item);
}

/**
 * Toggle display unit between grams and household units.
 * @param {object} item - Current food item
 * @returns {object} Item with toggled display unit
 */
export function toggleDisplayUnit(item) {
  const newUnit = item.display_unit === 'grams' ? 'household' : 'grams';

  let displayWeight;
  if (newUnit === 'household' && item.household_unit_weight_g) {
    displayWeight = `${(item.weight_grams / item.household_unit_weight_g).toFixed(1)} ${item.household_unit}`;
  } else {
    displayWeight = `${item.weight_grams}g`;
  }

  return {
    ...item,
    display_unit: newUnit,
    display_weight_text: displayWeight,
  };
}

/**
 * Handle shadow fat adjustment.
 * @param {Array} items - All food items
 * @param {number} newFatGrams - New total hidden fat in grams
 * @param {string} cookingMedium - Type of fat (Ghee, Oil, etc.)
 * @returns {Array} Updated items with adjusted fat
 */
export function adjustShadowFat(items, newFatGrams, cookingMedium) {
  // Distribute fat proportionally across items that had fat detected
  const fatItems = items.filter((i) => i.hidden_fat_detected);
  if (fatItems.length === 0) return items;

  const perItemFat = newFatGrams / fatItems.length;

  return items.map((item) => {
    if (!item.hidden_fat_detected) return item;

    // Remove old fat overhead, apply new
    const oldFatOverhead = item.fat_overhead_grams || 0;
    const fatDiff = perItemFat - oldFatOverhead;

    return {
      ...item,
      fat_overhead_grams: perItemFat,
      assumed_cooking_medium: cookingMedium || item.assumed_cooking_medium,
      fats: +(item.fats + fatDiff).toFixed(1),
      calories: Math.round(item.calories + fatDiff * 9),
    };
  });
}
