/**
 * NourishSnap AI — Contextual Ambient Guessing
 * Uses time of day and coarse geolocation to infer likely meal type
 * and regional cuisine preferences, per PRD Section 2.
 */

/**
 * Get the current ambient context.
 * @returns {Promise<{ timeOfDay: string, mealContext: string, region: string, icon: string }>}
 */
export async function getAmbientContext() {
  const timeContext = getTimeContext();
  const region = await getRegionHint();

  return {
    ...timeContext,
    region,
  };
}

/**
 * Determine meal context from current time of day.
 */
function getTimeContext() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) {
    return {
      timeOfDay: `${hour}:00 AM (Early Morning)`,
      mealContext: 'Breakfast',
      icon: '☀️',
    };
  } else if (hour >= 10 && hour < 12) {
    return {
      timeOfDay: `${hour}:00 AM (Late Morning)`,
      mealContext: 'Brunch / Late Breakfast',
      icon: '🌤️',
    };
  } else if (hour >= 12 && hour < 15) {
    return {
      timeOfDay: `${hour - 12 || 12}:00 PM (Afternoon)`,
      mealContext: 'Lunch',
      icon: '🌞',
    };
  } else if (hour >= 15 && hour < 18) {
    return {
      timeOfDay: `${hour - 12}:00 PM (Evening Snack Time)`,
      mealContext: 'Evening Snack',
      icon: '🌅',
    };
  } else if (hour >= 18 && hour < 22) {
    return {
      timeOfDay: `${hour - 12}:00 PM (Evening)`,
      mealContext: 'Dinner',
      icon: '🌙',
    };
  } else {
    return {
      timeOfDay: `${hour > 12 ? hour - 12 : hour}:00 (Late Night)`,
      mealContext: 'Late Night Snack',
      icon: '🌑',
    };
  }
}

/**
 * Get a coarse regional hint from geolocation.
 * Maps to broad Indian regions for cuisine context.
 * Falls back gracefully if permission denied.
 */
async function getRegionHint() {
  try {
    const pos = await Promise.race([
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 3000,
          maximumAge: 300000, // 5 min cache
        });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Geolocation timeout')), 3000))
    ]);

    const { latitude, longitude } = pos.coords;
    return mapToRegion(latitude, longitude);
  } catch {
    return 'India (region unknown)';
  }
}

/**
 * Map latitude/longitude to a broad Indian culinary region.
 * Approximate boundaries for contextual cuisine classification.
 */
function mapToRegion(lat, lon) {
  // South India (below ~15°N)
  if (lat < 15) {
    if (lon < 76) return 'Kerala / Coastal Karnataka';
    if (lon < 78) return 'Karnataka / Bengaluru';
    if (lon < 80) return 'Tamil Nadu / Chennai';
    return 'Andhra Pradesh / Telangana';
  }

  // Central India (15-22°N)
  if (lat < 22) {
    if (lon < 74) return 'Maharashtra / Mumbai';
    if (lon < 78) return 'Maharashtra / Central India';
    if (lon < 82) return 'Chhattisgarh / Madhya Pradesh';
    return 'Odisha / Eastern India';
  }

  // North India (22-28°N)
  if (lat < 28) {
    if (lon < 72) return 'Gujarat / Rajasthan';
    if (lon < 78) return 'Rajasthan / Uttar Pradesh';
    if (lon < 84) return 'Uttar Pradesh / Bihar';
    return 'West Bengal / Kolkata';
  }

  // Far North (>28°N)
  if (lon < 76) return 'Punjab / Haryana';
  if (lon < 78) return 'Delhi NCR';
  return 'Uttarakhand / Himachal / Kashmir';
}
