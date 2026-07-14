// PDF Export Module
// Generates a clean PDF nutrition report using jsPDF

import { jsPDF } from 'jspdf';
import { getMealsByDateRange, getStreak } from './data/db.js';

/**
 * Export a user's nutrition report as a PDF
 * @param {string} userName - User's display name or email
 * @param {Object} userGoals - { daily_calorie_target, protein_target_g, carbs_target_g, fats_target_g }
 * @param {number} days - Number of days to include (7 or 30)
 */
export async function exportPdfReport(userName, userGoals, userId, days = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const meals = await getMealsByDateRange(startDate, endDate);
  const streak = await getStreak(userId);

  // Group by date
  const dayMap = {};
  meals.forEach(meal => {
    const day = new Date(meal.logged_at).toLocaleDateString('en-IN', { 
      weekday: 'short', month: 'short', day: 'numeric' 
    });
    const dayKey = new Date(meal.logged_at).toISOString().split('T')[0];
    if (!dayMap[dayKey]) dayMap[dayKey] = { label: day, meals: [] };
    dayMap[dayKey].meals.push(meal);
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header ──
  doc.setFillColor(74, 107, 82); // botanical sage
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('NourishSnap', margin, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Nutrition Report', margin, 22);
  doc.text(`${startDate.toLocaleDateString('en-IN')} — ${endDate.toLocaleDateString('en-IN')}`, pageWidth - margin, 14, { align: 'right' });
  doc.text(userName, pageWidth - margin, 22, { align: 'right' });

  y = 40;

  // ── Summary Stats ──
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Summary', margin, y);
  y += 8;

  // Compute totals
  const totalMeals = meals.length;
  const daysLogged = Object.keys(dayMap).length;
  
  const dailyTotals = Object.values(dayMap).map(d => {
    return d.meals.reduce((acc, m) => ({
      calories: acc.calories + (m.total_calculated_calories || 0),
      protein: acc.protein + parseFloat(m.total_protein_g || 0),
      carbs: acc.carbs + parseFloat(m.total_carbs_g || 0),
      fats: acc.fats + parseFloat(m.total_fats_g || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  });

  const avgCalories = daysLogged > 0 ? Math.round(dailyTotals.reduce((s, d) => s + d.calories, 0) / daysLogged) : 0;
  const avgProtein = daysLogged > 0 ? (dailyTotals.reduce((s, d) => s + d.protein, 0) / daysLogged).toFixed(1) : '0';
  const avgCarbs = daysLogged > 0 ? (dailyTotals.reduce((s, d) => s + d.carbs, 0) / daysLogged).toFixed(1) : '0';
  const avgFats = daysLogged > 0 ? (dailyTotals.reduce((s, d) => s + d.fats, 0) / daysLogged).toFixed(1) : '0';

  // Stat boxes
  const statBoxWidth = contentWidth / 4 - 3;
  const stats = [
    { label: 'Meals Logged', value: `${totalMeals}` },
    { label: 'Days Active', value: `${daysLogged}/${days}` },
    { label: 'Avg Cal/Day', value: `${avgCalories}` },
    { label: 'Streak', value: `🔥 ${streak.current_streak}` },
  ];

  stats.forEach((stat, i) => {
    const x = margin + i * (statBoxWidth + 4);
    doc.setFillColor(245, 245, 240);
    doc.roundedRect(x, y, statBoxWidth, 18, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(74, 107, 82);
    doc.text(stat.value, x + statBoxWidth / 2, y + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(stat.label, x + statBoxWidth / 2, y + 15, { align: 'center' });
  });

  y += 26;

  // ── Macro Averages ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text('Daily Averages', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const macros = [
    { label: 'Calories', value: `${avgCalories} kcal`, target: `Target: ${userGoals.daily_calorie_target || 2000} kcal` },
    { label: 'Protein', value: `${avgProtein}g`, target: `Target: ${userGoals.protein_target_g || 120}g` },
    { label: 'Carbs', value: `${avgCarbs}g`, target: '' },
    { label: 'Fats', value: `${avgFats}g`, target: '' },
  ];

  macros.forEach(m => {
    doc.setTextColor(60, 60, 60);
    doc.text(`${m.label}: `, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, margin + 25, y);
    if (m.target) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(m.target, margin + 55, y);
    }
    doc.setFont('helvetica', 'normal');
    y += 6;
  });

  y += 6;

  // ── Daily Breakdown Table ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text('Daily Breakdown', margin, y);
  y += 8;

  // Table header
  doc.setFillColor(74, 107, 82);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const cols = [margin + 2, margin + 40, margin + 65, margin + 88, margin + 111, margin + 134];
  doc.text('Date', cols[0], y + 5.5);
  doc.text('Meals', cols[1], y + 5.5);
  doc.text('Calories', cols[2], y + 5.5);
  doc.text('Protein', cols[3], y + 5.5);
  doc.text('Carbs', cols[4], y + 5.5);
  doc.text('Fats', cols[5], y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);

  Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).forEach(([dayKey, dayData], i) => {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }

    const totals = dayData.meals.reduce((acc, m) => ({
      calories: acc.calories + (m.total_calculated_calories || 0),
      protein: acc.protein + parseFloat(m.total_protein_g || 0),
      carbs: acc.carbs + parseFloat(m.total_carbs_g || 0),
      fats: acc.fats + parseFloat(m.total_fats_g || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 245);
      doc.rect(margin, y - 1, contentWidth, 7, 'F');
    }

    doc.text(dayData.label, cols[0], y + 4);
    doc.text(`${dayData.meals.length}`, cols[1], y + 4);
    doc.text(`${totals.calories}`, cols[2], y + 4);
    doc.text(`${totals.protein.toFixed(1)}g`, cols[3], y + 4);
    doc.text(`${totals.carbs.toFixed(1)}g`, cols[4], y + 4);
    doc.text(`${totals.fats.toFixed(1)}g`, cols[5], y + 4);

    y += 7;
  });

  // ── Footer ──
  y = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text('Generated by NourishSnap AI · Powered by Gemini & ICMR data', pageWidth / 2, y, { align: 'center' });

  // Save
  const filename = `NourishSnap_Report_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  return filename;
}
