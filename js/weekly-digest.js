// Weekly Digest Module
// Generates in-app weekly summary reports

import { getMealsByDateRange, getStreak } from './data/db.js';

/**
 * Generate a weekly digest for a user
 * @param {string} userId
 * @param {Object} userGoals - { daily_calorie_target, protein_target_g }
 * @returns {Object} digest data
 */
export async function generateWeeklyDigest(userId, userGoals) {
  const now = new Date();
  const endDate = new Date(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 7);

  const meals = await getMealsByDateRange(startDate, endDate);
  const streak = await getStreak(userId);

  // Group meals by date
  const dayMap = {};
  meals.forEach(meal => {
    const day = new Date(meal.logged_at).toISOString().split('T')[0];
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(meal);
  });

  const daysLogged = Object.keys(dayMap).length;
  const totalMeals = meals.length;

  // Compute daily totals
  const dailyTotals = Object.entries(dayMap).map(([date, dayMeals]) => {
    const totals = dayMeals.reduce((acc, m) => ({
      calories: acc.calories + (m.total_calculated_calories || 0),
      protein: acc.protein + parseFloat(m.total_protein_g || 0),
      carbs: acc.carbs + parseFloat(m.total_carbs_g || 0),
      fats: acc.fats + parseFloat(m.total_fats_g || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
    return { date, ...totals, mealCount: dayMeals.length };
  });

  // Averages
  const avgCalories = daysLogged > 0 
    ? Math.round(dailyTotals.reduce((s, d) => s + d.calories, 0) / daysLogged) 
    : 0;
  const avgProtein = daysLogged > 0 
    ? +(dailyTotals.reduce((s, d) => s + d.protein, 0) / daysLogged).toFixed(1) 
    : 0;
  const avgCarbs = daysLogged > 0 
    ? +(dailyTotals.reduce((s, d) => s + d.carbs, 0) / daysLogged).toFixed(1) 
    : 0;
  const avgFats = daysLogged > 0 
    ? +(dailyTotals.reduce((s, d) => s + d.fats, 0) / daysLogged).toFixed(1) 
    : 0;

  // Target compliance
  const calTarget = userGoals?.daily_calorie_target || 2000;
  const proteinTarget = userGoals?.protein_target_g || 120;
  const daysOnTarget = dailyTotals.filter(d => 
    d.calories >= calTarget * 0.85 && d.calories <= calTarget * 1.15
  ).length;
  const proteinDaysHit = dailyTotals.filter(d => d.protein >= proteinTarget * 0.9).length;

  // Best & worst day
  const bestDay = dailyTotals.length > 0 
    ? dailyTotals.reduce((best, d) => d.mealCount > best.mealCount ? d : best)
    : null;
  const highestCalDay = dailyTotals.length > 0 
    ? dailyTotals.reduce((h, d) => d.calories > h.calories ? d : h)
    : null;
  const lowestCalDay = dailyTotals.length > 0 
    ? dailyTotals.reduce((l, d) => d.calories < l.calories ? d : l)
    : null;

  return {
    dateRange: {
      start: startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      end: endDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    },
    totalMeals,
    daysLogged,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFats,
    daysOnTarget,
    proteinDaysHit,
    streak: streak.current_streak,
    longestStreak: streak.longest_streak,
    highestCalDay,
    lowestCalDay,
    dailyTotals,
    calTarget,
    proteinTarget,
  };
}

/**
 * Render the digest into an HTML container
 * @param {Object} digest
 * @returns {string} HTML string
 */
export function renderDigestHtml(digest) {
  const compliancePercent = digest.daysLogged > 0 
    ? Math.round((digest.daysOnTarget / digest.daysLogged) * 100) 
    : 0;

  return `
    <div class="digest-stats">
      <div class="digest-stat">
        <span class="digest-stat-value">${digest.totalMeals}</span>
        <span class="digest-stat-label">Meals</span>
      </div>
      <div class="digest-stat">
        <span class="digest-stat-value">${digest.daysLogged}/7</span>
        <span class="digest-stat-label">Days Active</span>
      </div>
      <div class="digest-stat">
        <span class="digest-stat-value">${digest.avgCalories}</span>
        <span class="digest-stat-label">Avg Cal/Day</span>
      </div>
      <div class="digest-stat">
        <span class="digest-stat-value">${compliancePercent}%</span>
        <span class="digest-stat-label">On Target</span>
      </div>
    </div>
    <div class="digest-macros">
      <div class="digest-macro">
        <span class="macro-label">Avg Protein</span>
        <span class="macro-value">${digest.avgProtein}g</span>
        <span class="macro-target">Goal: ${digest.proteinTarget}g</span>
      </div>
      <div class="digest-macro">
        <span class="macro-label">Avg Carbs</span>
        <span class="macro-value">${digest.avgCarbs}g</span>
      </div>
      <div class="digest-macro">
        <span class="macro-label">Avg Fats</span>
        <span class="macro-value">${digest.avgFats}g</span>
      </div>
    </div>
    ${digest.streak > 0 ? `
      <div class="digest-streak">
        🔥 ${digest.streak} day streak (Best: ${digest.longestStreak})
      </div>
    ` : ''}
  `;
}
