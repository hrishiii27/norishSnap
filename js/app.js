/**
 * NourishSnap AI — Main Application Orchestrator
 * Wires together Camera, AI Agents, UI Components, and Database.
 */

import { Camera } from './camera.js';
import { compressImage } from './utils/image-compress.js';
import { getAmbientContext } from './utils/context-guesser.js';
import { formatWeight } from './utils/unit-converter.js';
import { analyzeImage } from './agents/vision-parser.js';
import { enrichWithNutrition } from './agents/database-retriever.js';
import {
  applyRevisionMemory,
  handleNameChange,
  handleWeightChange,
  toggleDisplayUnit,
  adjustShadowFat,
} from './agents/logic-adjuster.js';
import {
  getOrCreateLocalUser,
  logMeal,
  getTodayMeals,
  getTodayTotals,
} from './data/db.js';
import { getSession, signInWithGoogle, signInWithApple, onAuthStateChange, signOut } from './auth/auth.js';

// ── App State ──
const state = {
  user: null,
  context: null,
  currentItems: [],          // Food items from current analysis
  capturedImageUrl: null,    // Data URL of captured image
  isProcessing: false,
};

// ── DOM References ──
const dom = {
  // Routing
  landingView:      document.getElementById('landing-view'),
  appView:          document.getElementById('app-view'),
  btnGoogle:        document.getElementById('btn-login-google'),
  btnApple:         document.getElementById('btn-login-apple'),
  
  // Camera & Placeholder
  cameraPlaceholder: document.getElementById('camera-placeholder'),
  btnStartCamera:    document.getElementById('btn-start-camera'),
  galleryInput:      document.getElementById('gallery-upload-input'),
  cameraStream:      document.getElementById('camera-stream'),

  shutterBtn:       document.getElementById('shutter-btn'),
  controlsBar:      document.getElementById('controls-bar'),
  retakeBar:        document.getElementById('retake-bar'),
  retakeBtn:        document.getElementById('retake-btn'),
  processingOverlay:document.getElementById('processing-overlay'),
  analyticsPanel:   document.getElementById('analytics-panel'),
  backdrop:         document.getElementById('backdrop'),
  foodItemsList:    document.getElementById('food-items-list'),
  logMealBtn:       document.getElementById('log-meal-btn'),
  shadowOilPrompt:  document.getElementById('shadow-oil-prompt'),
  shadowOilText:    document.getElementById('shadow-oil-text'),
  shadowOilEditBtn: document.getElementById('shadow-oil-edit-btn'),

  // Macro badges
  totalCalories:    document.getElementById('total-calories'),
  totalProtein:     document.getElementById('total-protein'),
  totalCarbs:       document.getElementById('total-carbs'),
  totalFats:        document.getElementById('total-fats'),

  // Context
  contextIcon:      document.getElementById('context-icon'),
  contextLabel:     document.getElementById('context-label'),

  // History
  historyBtn:       document.getElementById('history-btn'),
  historyDrawer:    document.getElementById('history-drawer'),
  historyCloseBtn:  document.getElementById('history-close-btn'),
  historyList:      document.getElementById('history-list'),
  caloriesConsumed: document.getElementById('calories-consumed'),
  caloriesTarget:   document.getElementById('calories-target'),
  progressRingFill: document.getElementById('progress-ring-fill'),
};

// ── Initialize ──
const camera = new Camera();

async function init() {
  // Check auth session
  const session = await getSession();
  if (session) {
    await enterApp(session.user);
  } else {
    showLanding();
  }

  // Listen for auth state changes
  onAuthStateChange(async (event, session) => {
    if (session && event === 'SIGNED_IN') {
      await enterApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLanding();
    }
  });

  // Bind events
  bindEvents();

  // Register service worker
  registerSW();
}

function showLanding() {
  dom.landingView.classList.remove('hidden');
  dom.appView.classList.add('hidden');
}

async function enterApp(user) {
  dom.landingView.classList.add('hidden');
  dom.appView.classList.remove('hidden');
  
  // Sync local/Supabase user data
  state.user = await getOrCreateLocalUser(user);

  // Get ambient context
  state.context = await getAmbientContext();
  if (dom.contextIcon && dom.contextLabel) {
    dom.contextIcon.textContent = state.context.icon;
    dom.contextLabel.textContent = state.context.mealContext;
  }
}

function bindEvents() {
  // Auth
  if (dom.btnGoogle) dom.btnGoogle.addEventListener('click', signInWithGoogle);
  if (dom.btnApple) dom.btnApple.addEventListener('click', signInWithApple);

  // Camera Toggle
  if (dom.btnStartCamera) {
    dom.btnStartCamera.addEventListener('click', async () => {
      dom.cameraPlaceholder.classList.add('hidden');
      dom.cameraStream.classList.remove('hidden');
      await camera.start();
    });
  }

  // Gallery Upload
  if (dom.galleryInput) {
    dom.galleryInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        dom.cameraPlaceholder.classList.add('hidden');
        await processImage(file);
      }
    });
  }

  // File fallback in camera (if any exists)
  camera.onFileSelected(async (file) => {
    await processImage(file);
  });

  // Shutter button
  if (dom.shutterBtn) dom.shutterBtn.addEventListener('click', handleShutter);

  // Retake
  if (dom.retakeBtn) dom.retakeBtn.addEventListener('click', handleRetake);

  // Log meal
  if (dom.logMealBtn) dom.logMealBtn.addEventListener('click', handleLogMeal);

  // History
  if (dom.historyBtn) dom.historyBtn.addEventListener('click', () => showHistory());
  if (dom.historyCloseBtn) dom.historyCloseBtn.addEventListener('click', () => hideHistory());

  // Backdrop dismiss
  if (dom.backdrop) {
    dom.backdrop.addEventListener('click', () => {
      hideAnalyticsPanel();
    });
  }

  // Shadow oil edit
  if (dom.shadowOilEditBtn) dom.shadowOilEditBtn.addEventListener('click', handleShadowOilEdit);
}

// ═══════════════════════════════════════════════════════════
// CAPTURE & ANALYSIS FLOW
// ═══════════════════════════════════════════════════════════

async function handleShutter() {
  if (state.isProcessing) return;

  try {
    const { blob, dataUrl } = await camera.capture();
    state.capturedImageUrl = dataUrl;

    // Show retake bar, hide controls
    dom.controlsBar.classList.add('hidden');
    dom.retakeBar.classList.remove('hidden');

    await processImage(blob || dataUrl);
  } catch (err) {
    console.error('Capture error:', err);
    showToast('Failed to capture photo. Please try again.');
    handleRetake();
  }
}

async function processImage(input) {
  state.isProcessing = true;
  dom.shutterBtn.classList.add('processing');
  dom.processingOverlay.classList.remove('hidden');

  try {
    // Step 1: Compress image
    const compressed = await compressImage(input);
    state.capturedImageUrl = compressed.base64;

    // Step 2: Agent A — Vision Parser (Gemini VLM)
    const rawItems = await analyzeImage(compressed.base64, state.context);

    // Step 3: Apply Smart Revision Memory
    const revisedItems = applyRevisionMemory(rawItems);

    // Step 4: Agent B — Database Retriever (nutrition enrichment)
    const enrichedItems = await enrichWithNutrition(revisedItems);

    // Store in state
    state.currentItems = enrichedItems;

    // Step 5: Render results
    renderFoodItems(enrichedItems);
    updateMacroTotals();
    checkShadowFat(enrichedItems);
    showAnalyticsPanel();

  } catch (err) {
    console.error('Analysis error:', err);
    showToast(err.message || 'Failed to analyze image. Please try again.');
    handleRetake();
  } finally {
    state.isProcessing = false;
    dom.shutterBtn.classList.remove('processing');
    dom.processingOverlay.classList.add('hidden');
  }
}

function handleRetake() {
  if (!dom.cameraStream.classList.contains('hidden')) {
    camera.resume();
  } else {
    // If we used gallery, revert to placeholder
    dom.cameraPlaceholder.classList.remove('hidden');
    dom.galleryInput.value = '';
  }
  
  dom.controlsBar.classList.remove('hidden');
  dom.retakeBar.classList.add('hidden');
  hideAnalyticsPanel();
  state.currentItems = [];
  state.capturedImageUrl = null;
}

// ═══════════════════════════════════════════════════════════
// UI RENDERING
// ═══════════════════════════════════════════════════════════

function renderFoodItems(items) {
  dom.foodItemsList.innerHTML = '';

  items.forEach((item, index) => {
    const card = createFoodCard(item, index);
    dom.foodItemsList.appendChild(card);
  });
}

function createFoodCard(item, index) {
  const card = document.createElement('div');
  card.className = 'food-card';
  card.dataset.index = index;

  const confidenceClass = item.confidence_score < 0.6 ? 'low' : '';
  const weightText = formatWeight(
    item.weight_grams,
    item.household_unit,
    item.household_unit_weight_g,
    item.display_unit || 'grams'
  );

  card.innerHTML = `
    <div class="food-card-left">
      <input
        class="food-card-name"
        type="text"
        value="${escapeHtml(item.food_name_raw)}"
        data-index="${index}"
        aria-label="Food name"
      />
      <div class="food-card-meta">
        <span class="food-card-weight" data-index="${index}" title="Tap to toggle units">
          ${weightText}
        </span>
        ${item.confidence_score != null ? `
          <span class="food-card-confidence ${confidenceClass}">
            ${Math.round(item.confidence_score * 100)}%
          </span>
        ` : ''}
      </div>
    </div>
    <div class="food-card-right">
      <span class="food-card-calories">${item.calories}</span>
      <span class="food-card-cal-label">kcal</span>
    </div>
  `;

  // Event: name change
  const nameInput = card.querySelector('.food-card-name');
  let nameTimeout;
  nameInput.addEventListener('input', () => {
    clearTimeout(nameTimeout);
    nameTimeout = setTimeout(async () => {
      const newName = nameInput.value.trim();
      if (newName && newName !== item.food_name_raw) {
        const updated = await handleNameChange(state.currentItems[index], newName);
        state.currentItems[index] = updated;
        updateCardDisplay(card, updated);
        updateMacroTotals();
      }
    }, 600);
  });

  // Event: weight toggle (grams ↔ household)
  const weightSpan = card.querySelector('.food-card-weight');
  weightSpan.addEventListener('click', () => {
    const updated = toggleDisplayUnit(state.currentItems[index]);
    state.currentItems[index] = updated;
    weightSpan.textContent = updated.display_weight_text || formatWeight(
      updated.weight_grams,
      updated.household_unit,
      updated.household_unit_weight_g,
      updated.display_unit
    );
  });

  return card;
}

function updateCardDisplay(card, item) {
  const caloriesEl = card.querySelector('.food-card-calories');
  const weightEl = card.querySelector('.food-card-weight');

  // Animate calorie change
  animateNumber(caloriesEl, parseInt(caloriesEl.textContent), item.calories);

  weightEl.textContent = formatWeight(
    item.weight_grams,
    item.household_unit,
    item.household_unit_weight_g,
    item.display_unit || 'grams'
  );
}

// ── Macro Totals ──

function updateMacroTotals() {
  const totals = state.currentItems.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fats: acc.fats + (item.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  animateNumber(dom.totalCalories, parseInt(dom.totalCalories.textContent) || 0, totals.calories);
  animateNumber(dom.totalProtein, parseFloat(dom.totalProtein.textContent) || 0, totals.protein, 'g');
  animateNumber(dom.totalCarbs, parseFloat(dom.totalCarbs.textContent) || 0, totals.carbs, 'g');
  animateNumber(dom.totalFats, parseFloat(dom.totalFats.textContent) || 0, totals.fats, 'g');
}

// ── Shadow Fat Prompt ──

function checkShadowFat(items) {
  const fatItems = items.filter((i) => i.hidden_fat_detected);
  if (fatItems.length > 0) {
    const totalFat = fatItems.reduce((sum, i) => sum + (i.fat_overhead_grams || 0), 0);
    const medium = fatItems[0].assumed_cooking_medium || 'Oil/Ghee';
    const tbsp = (totalFat / 14).toFixed(1); // ~14g per tbsp

    dom.shadowOilText.textContent = `Assumed ${tbsp} tbsp ${medium} used. Tap to alter.`;
    dom.shadowOilPrompt.classList.remove('hidden');
  } else {
    dom.shadowOilPrompt.classList.add('hidden');
  }
}

function handleShadowOilEdit() {
  const currentItems = state.currentItems.filter((i) => i.hidden_fat_detected);
  const currentFat = currentItems.reduce((s, i) => s + (i.fat_overhead_grams || 0), 0);

  const input = prompt('Estimated cooking fat (grams):', Math.round(currentFat));
  if (input !== null) {
    const newFat = parseFloat(input);
    if (!isNaN(newFat) && newFat >= 0) {
      state.currentItems = adjustShadowFat(state.currentItems, newFat, null);
      renderFoodItems(state.currentItems);
      updateMacroTotals();
      checkShadowFat(state.currentItems);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PANEL ANIMATIONS
// ═══════════════════════════════════════════════════════════

function showAnalyticsPanel() {
  dom.analyticsPanel.classList.remove('hidden');
  dom.backdrop.classList.remove('hidden');

  // Force reflow for transition
  void dom.analyticsPanel.offsetHeight;
  void dom.backdrop.offsetHeight;

  dom.analyticsPanel.classList.add('visible');
  dom.backdrop.classList.add('visible');
}

function hideAnalyticsPanel() {
  dom.analyticsPanel.classList.remove('visible');
  dom.backdrop.classList.remove('visible');

  setTimeout(() => {
    dom.analyticsPanel.classList.add('hidden');
    dom.backdrop.classList.add('hidden');
  }, 300);
}

// ═══════════════════════════════════════════════════════════
// MEAL LOGGING
// ═══════════════════════════════════════════════════════════

async function handleLogMeal() {
  if (state.currentItems.length === 0) return;

  const totals = state.currentItems.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fats: acc.fats + (item.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  try {
    await logMeal(
      {
        user_id: state.user.id,
        image_url: state.capturedImageUrl?.substring(0, 200) || null, // Truncate for storage
        total_calories: Math.round(totals.calories),
        total_protein: +totals.protein.toFixed(1),
        total_carbs: +totals.carbs.toFixed(1),
        total_fats: +totals.fats.toFixed(1),
        context: state.context?.mealContext || null,
      },
      state.currentItems
    );

    // Success animation
    dom.logMealBtn.classList.add('success');
    dom.logMealBtn.innerHTML = '<span class="log-meal-icon">✓</span> Logged!';

    setTimeout(() => {
      dom.logMealBtn.classList.remove('success');
      dom.logMealBtn.innerHTML = '<span class="log-meal-icon">✓</span> Log This Meal';
      handleRetake();
    }, 1200);

  } catch (err) {
    console.error('Failed to log meal:', err);
    showToast('Failed to save meal. Please try again.');
  }
}

// ═══════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════

async function showHistory() {
  const todayMeals = await getTodayMeals(state.user.id);
  const totals = await getTodayTotals(state.user.id);

  // Update progress ring
  dom.caloriesConsumed.textContent = totals.calories;
  dom.caloriesTarget.textContent = state.user.daily_calorie_target;

  const circumference = 2 * Math.PI * 52; // r=52
  const progress = Math.min(totals.calories / state.user.daily_calorie_target, 1);
  dom.progressRingFill.style.strokeDashoffset = circumference * (1 - progress);

  // Render meal history
  dom.historyList.innerHTML = '';

  if (todayMeals.length === 0) {
    dom.historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📸</div>
        <p class="empty-state-text">No meals logged today.<br>Snap a photo to get started!</p>
      </div>
    `;
  } else {
    todayMeals.forEach((meal) => {
      const time = new Date(meal.logged_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const itemNames = meal.items?.map((i) => i.food_name_logged).join(', ') || 'Meal';

      const card = document.createElement('div');
      card.className = 'history-meal-card';
      card.innerHTML = `
        <div class="history-meal-info">
          <span class="history-meal-context">${meal.time_of_day_context || 'Meal'}</span>
          <span class="history-meal-items">${escapeHtml(itemNames)}</span>
          <span class="history-meal-time">${time}</span>
        </div>
        <span class="history-meal-cals">${meal.total_calculated_calories} kcal</span>
      `;
      dom.historyList.appendChild(card);
    });
  }
  
  // Add Logout button in history drawer
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'auth-btn secondary';
  logoutBtn.style.marginTop = '24px';
  logoutBtn.style.color = 'var(--text-secondary)';
  logoutBtn.textContent = 'Log Out';
  logoutBtn.onclick = () => {
    signOut();
    hideHistory();
  };
  dom.historyList.appendChild(logoutBtn);

  dom.historyDrawer.classList.remove('hidden');
  void dom.historyDrawer.offsetHeight;
  dom.historyDrawer.classList.add('visible');
}

function hideHistory() {
  dom.historyDrawer.classList.remove('visible');
  setTimeout(() => {
    dom.historyDrawer.classList.add('hidden');
  }, 300);
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Animate a number transition (macro recalculation telemetry per Design Spec §5).
 */
function animateNumber(element, from, to, suffix = '') {
  const duration = 400;
  const startTime = performance.now();
  const isInteger = Number.isInteger(to);

  element.classList.add('updating');

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

    const current = from + (to - from) * eased;
    element.textContent = (isInteger ? Math.round(current) : current.toFixed(1)) + suffix;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.classList.remove('updating');
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Show a toast notification.
 */
function showToast(message) {
  // Simple toast implementation
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: calc(var(--safe-area-top, 0px) + 16px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--deep-bark);
    color: var(--canvas-base);
    padding: 10px 20px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-caption);
    font-weight: 500;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    animation: toast-in 0.3s var(--ease-panel);
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Register the service worker for PWA offline support.
 */
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  }
}

// ── Boot ──
init().catch(console.error);
