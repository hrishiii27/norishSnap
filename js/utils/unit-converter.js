/**
 * NourishSnap AI — Unit Converter
 * Converts between raw grams and household Indian units.
 * Per FR-3.2: Tactile Household Unit Toggle.
 */

/**
 * Format weight for display based on current unit mode.
 * @param {number} weightGrams - Weight in grams
 * @param {string} householdUnit - Unit label (e.g., 'katori', 'piece', 'ladle')
 * @param {number} householdUnitWeight - Weight of one household unit in grams
 * @param {string} displayUnit - 'grams' or 'household'
 * @returns {string} Formatted display string
 */
export function formatWeight(weightGrams, householdUnit, householdUnitWeight, displayUnit) {
  if (displayUnit === 'household' && householdUnit && householdUnitWeight) {
    const count = weightGrams / householdUnitWeight;

    if (count === 1) {
      return `1 ${capitalize(householdUnit)}`;
    } else if (count < 1) {
      return `½ ${capitalize(householdUnit)}`;
    } else if (Math.abs(count - Math.round(count)) < 0.15) {
      return `${Math.round(count)} ${capitalize(pluralize(householdUnit, Math.round(count)))}`;
    } else {
      return `${count.toFixed(1)} ${capitalize(pluralize(householdUnit, count))}`;
    }
  }

  return `${Math.round(weightGrams)}g`;
}

/**
 * Convert household units to grams.
 * @param {number} count - Number of household units
 * @param {number} unitWeight - Weight per unit in grams
 * @returns {number} Weight in grams
 */
export function householdToGrams(count, unitWeight) {
  return Math.round(count * unitWeight);
}

/**
 * Standard Indian household units reference.
 */
export const HOUSEHOLD_UNITS = {
  katori: { label: 'Katori', weight_g: 150, description: 'Standard small bowl (~150ml)' },
  piece: { label: 'Piece', weight_g: null, description: 'Individual item (roti, samosa, etc.)' },
  ladle: { label: 'Ladle', weight_g: 120, description: 'Standard serving ladle (~120ml)' },
  cup: { label: 'Cup', weight_g: 200, description: 'Standard cup (~200ml)' },
  tablespoon: { label: 'Tablespoon', weight_g: 15, description: 'Tablespoon (~15g)' },
  teaspoon: { label: 'Teaspoon', weight_g: 5, description: 'Teaspoon (~5g)' },
  plate: { label: 'Plate', weight_g: 300, description: 'Standard dinner plate serving' },
  glass: { label: 'Glass', weight_g: 250, description: 'Standard glass (~250ml)' },
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pluralize(unit, count) {
  if (count <= 1) return unit;
  if (unit.endsWith('y')) return unit.slice(0, -1) + 'ies';
  return unit + 's';
}
