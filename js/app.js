/**
 * NourishSnap AI — Main Application Orchestrator
 * Wires together Camera, AI Agents, UI Components, and Database.
 */

import { Camera } from './camera.js';
import { compressImage } from './utils/image-compress.js';
import { getAmbientContext } from './utils/context-guesser.js';
import { formatWeight } from './utils/unit-converter.js';
import { analyzeImage } from './agents/vision-parser.js';
import { analyzeTranscript } from './agents/audio-parser.js';
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
  getAllMeals,
  getTodayTotals,
  updateMealEnergy,
  subtractLeftovers,
} from './data/db.js';
import { getSession, signInWithGoogle, signInWithApple, onAuthStateChange, signOut, signInWithEmail, signUpWithEmail } from './auth/auth.js';

// ── App State ──
const state = {
  user: null,
  context: null,
  currentItems: [],          // Food items from current analysis
  capturedImageUrl: null,    // Data URL of captured image
  isProcessing: false,
  leftoverTargetMealId: null, // If set, next photo is treated as a leftover subtraction
  shareFraction: 1.0         // Household Meal Share (Thali Mode) multiplier
};

// ── DOM References ──
const dom = {
  // Routing
  landingView:      document.getElementById('landing-view'),
  appView:          document.getElementById('app-view'),
  btnGoogle:        document.getElementById('btn-login-google'),
  btnApple:         document.getElementById('btn-login-apple'),
  
  // Email Auth
  authEmail:        document.getElementById('auth-email'),
  authPassword:     document.getElementById('auth-password'),
  btnLoginEmail:    document.getElementById('btn-login-email'),
  btnSignupEmail:   document.getElementById('btn-signup-email'),
  
  // Camera & Placeholder
  cameraPlaceholder: document.getElementById('camera-placeholder'),
  btnStartCamera:    document.getElementById('btn-start-camera'),
  btnAudioSnap:      document.getElementById('btn-audio-snap'),
  galleryInput:      document.getElementById('gallery-upload-input'),
  cameraStream:      document.getElementById('camera-stream'),

  listeningOverlay: document.getElementById('listening-overlay'),
  listeningText:    document.getElementById('listening-text'),

  shutterBtn:       document.getElementById('shutter-btn'),
  controlsBar:      document.getElementById('controls-bar'),
  retakeBar:        document.getElementById('retake-bar'),
  retakeBtn:        document.getElementById('retake-btn'),
  processingOverlay:document.getElementById('processing-overlay'),
  analyticsPanel:   document.getElementById('analytics-panel'),
  backdrop:         document.getElementById('backdrop'),
  foodItemsList:    document.getElementById('food-items-list'),
  addItemBtn:       document.getElementById('add-item-btn'),
  macroSummary:     document.getElementById('macro-summary'),
  logMealBtn:       document.getElementById('log-meal-btn'),

  // Thali Share Mode
  thaliShareBtns:   document.querySelectorAll('.thali-share-btn'),

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
  
  if (dom.btnLoginEmail) dom.btnLoginEmail.addEventListener('click', async (e) => {
    e.preventDefault();
    if (dom.authEmail.value && dom.authPassword.value) {
      const { error } = await signInWithEmail(dom.authEmail.value, dom.authPassword.value);
      if (error) alert(error.message);
    }
  });

  if (dom.btnSignupEmail) dom.btnSignupEmail.addEventListener('click', async (e) => {
    e.preventDefault();
    if (dom.authEmail.value && dom.authPassword.value) {
      const { error } = await signUpWithEmail(dom.authEmail.value, dom.authPassword.value);
      if (error) alert(error.message);
      else alert('Check your email for the confirmation link!');
    }
  });

  // Camera Toggle
  if (dom.btnStartCamera) {
    dom.btnStartCamera.addEventListener('click', async () => {
      dom.cameraPlaceholder.classList.add('hidden');
      dom.cameraStream.classList.remove('hidden');
      await camera.start();
    });
  }

  // Audio Snap
  if (dom.btnAudioSnap) {
    dom.btnAudioSnap.addEventListener('click', handleAudioSnap);
  }

  // Add custom item manually
  if (dom.addItemBtn) {
    dom.addItemBtn.addEventListener('click', () => {
      const newItem = {
        food_name_raw: 'Custom Food',
        weight_grams: 100,
        calories: 150,
        protein: 4.0,
        carbs: 20.0,
        fats: 5.0,
        confidence_score: 1.0,
        was_ai_predicted: false,
        display_unit: 'grams',
        household_unit: 'serving',
        household_unit_weight_g: 100
      };
      state.currentItems.push(newItem);
      renderFoodItems(state.currentItems);
      updateMacroTotals();
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

  // Thali Share Mode
  dom.thaliShareBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active from all
      dom.thaliShareBtns.forEach(b => b.classList.remove('active'));
      // Add active to clicked
      const target = e.target;
      target.classList.add('active');
      // Update state and recalculate
      state.shareFraction = parseFloat(target.dataset.fraction) || 1.0;
      updateMacroTotals();
    });
  });

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

    // Leftover Math Mode
    if (state.leftoverTargetMealId) {
      await subtractLeftovers(state.leftoverTargetMealId, rawItems);
      showToast('Leftovers calculated and subtracted! 📉');
      state.leftoverTargetMealId = null;
      state.capturedImageUrl = null;
      handleRetake();
      showHistory();
      return; // Stop normal flow
    }

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

// ═══════════════════════════════════════════════════════════
// AUDIO SNAP FLOW
// ═══════════════════════════════════════════════════════════

function handleAudioSnap() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    showToast("Voice recognition not supported in your browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-IN'; // Indian English for better accuracy with Indian food terms
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    dom.listeningText.textContent = "Listening...";
    dom.listeningOverlay.classList.remove('hidden');
  };

  recognition.onspeechstart = () => {
    dom.listeningText.textContent = "Keep speaking...";
  };

  recognition.onspeechend = () => {
    recognition.stop();
    dom.listeningText.textContent = "Processing voice...";
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    dom.listeningOverlay.classList.add('hidden');
    
    // Process the transcript
    await processAudioTranscript(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    dom.listeningOverlay.classList.add('hidden');
    showToast("Failed to hear you. Please try again.");
  };

  recognition.start();
}

async function processAudioTranscript(transcript) {
  state.isProcessing = true;
  dom.processingOverlay.classList.remove('hidden');

  try {
    // Agent C - Audio Parser (Gemini)
    const rawItems = await analyzeTranscript(transcript, state.context);
    
    // Step 3: Apply Smart Revision Memory
    const revisedItems = applyRevisionMemory(rawItems);

    // Step 4: Agent B — Database Retriever (nutrition enrichment)
    const enrichedItems = await enrichWithNutrition(revisedItems);

    // Store in state
    state.currentItems = enrichedItems;
    state.capturedImageUrl = null; // No image for audio logs

    // Step 5: Render results
    renderFoodItems(enrichedItems);
    updateMacroTotals();
    checkShadowFat(enrichedItems);
    
    dom.cameraPlaceholder.classList.add('hidden'); // hide placeholder to show retake bar below
    dom.controlsBar.classList.add('hidden');
    dom.retakeBar.classList.remove('hidden');
    showAnalyticsPanel();
    
  } catch (err) {
    console.error('Audio analysis error:', err);
    showToast(err.message || 'Failed to analyze voice log. Please try again.');
  } finally {
    state.isProcessing = false;
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
      <div class="food-card-macros">
        <span class="food-card-calories">${item.calories}</span>
        <span class="food-card-cal-label">kcal</span>
      </div>
      <button class="delete-item-btn" data-index="${index}" aria-label="Delete item">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
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

  // Event: delete item
  const deleteBtn = card.querySelector('.delete-item-btn');
  deleteBtn.addEventListener('click', () => {
    state.currentItems.splice(index, 1);
    renderFoodItems(state.currentItems);
    updateMacroTotals();
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

  const frac = state.shareFraction || 1.0;

  animateNumber(dom.totalCalories, parseInt(dom.totalCalories.textContent) || 0, Math.round(totals.calories * frac));
  animateNumber(dom.totalProtein, parseFloat(dom.totalProtein.textContent) || 0, totals.protein * frac, 'g');
  animateNumber(dom.totalCarbs, parseFloat(dom.totalCarbs.textContent) || 0, totals.carbs * frac, 'g');
  animateNumber(dom.totalFats, parseFloat(dom.totalFats.textContent) || 0, totals.fats * frac, 'g');
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
    const frac = state.shareFraction || 1.0;
    
    // Scale the items based on share fraction
    const scaledItems = state.currentItems.map(item => ({
      ...item,
      calories: item.calories * frac,
      protein: item.protein * frac,
      carbs: item.carbs * frac,
      fats: item.fats * frac,
      weight_grams: item.weight_grams * frac,
      household_unit_weight_g: item.household_unit_weight_g * frac
    }));

    await logMeal(
      {
        user_id: state.user.id,
        image_url: state.capturedImageUrl?.substring(0, 200) || null, // Truncate for storage
        total_calories: Math.round(totals.calories * frac),
        total_protein: +(totals.protein * frac).toFixed(1),
        total_carbs: +(totals.carbs * frac).toFixed(1),
        total_fats: +(totals.fats * frac).toFixed(1),
        context: state.context?.mealContext || null,
      },
      scaledItems
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
  const allMeals = await getAllMeals(state.user.id);
  const totals = await getTodayTotals(state.user.id);

  // Update progress ring
  dom.caloriesConsumed.textContent = totals.calories;
  dom.caloriesTarget.textContent = state.user.daily_calorie_target;

  const circumference = 2 * Math.PI * 52; // r=52
  const progress = Math.min(totals.calories / state.user.daily_calorie_target, 1);
  dom.progressRingFill.style.strokeDashoffset = circumference * (1 - progress);

  // Render meal history
  dom.historyList.innerHTML = '';

  if (allMeals.length === 0) {
    dom.historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📸</div>
        <p class="empty-state-text">No meals logged today.<br>Snap a photo to get started!</p>
      </div>
    `;
  } else {
    let lastDateStr = null;
    allMeals.forEach((meal) => {
      const mealDate = new Date(meal.logged_at);
      const dateStr = mealDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
      
      if (dateStr !== lastDateStr) {
        const dateHeader = document.createElement('h3');
        dateHeader.className = 'history-date-header';
        dateHeader.textContent = dateStr;
        dateHeader.style.marginTop = '16px';
        dateHeader.style.marginBottom = '8px';
        dateHeader.style.color = 'var(--text-secondary)';
        dom.historyList.appendChild(dateHeader);
        lastDateStr = dateStr;
      }

      const time = mealDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const itemNames = meal.items?.map((i) => i.food_name_logged).join(', ') || 'Meal';

      const card = document.createElement('div');
      card.className = 'history-meal-card';
      
      let energyHtml = '';
      if (meal.energy_rating) {
        energyHtml = `<div class="energy-badge">⚡ Energy: ${meal.energy_rating}/10</div>`;
      } else {
        // Show slider for tagging
        energyHtml = `
          <div class="energy-tagger" id="energy-tagger-${meal.id}">
            <label class="energy-label">How do you feel now? (Energy Level)</label>
            <div class="energy-controls">
              <input type="range" min="1" max="10" value="5" class="energy-slider" id="slider-${meal.id}">
              <span class="energy-value" id="val-${meal.id}">5</span>
              <button class="energy-save-btn" data-meal="${meal.id}">Save</button>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="history-meal-info">
          <span class="history-meal-context">${meal.time_of_day_context || 'Meal'}</span>
          <span class="history-meal-items">${escapeHtml(itemNames)}</span>
          <span class="history-meal-time">${time}</span>
        </div>
        <div class="history-meal-right">
          <span class="history-meal-cals">${meal.total_calculated_calories} kcal</span>
          ${!meal.has_leftover_subtracted ? `<button class="scan-leftover-btn" data-meal="${meal.id}">📉 Leftover?</button>` : ''}
        </div>
        ${energyHtml}
      `;
      dom.historyList.appendChild(card);

      if (!meal.has_leftover_subtracted) {
        const leftoverBtn = card.querySelector('.scan-leftover-btn');
        if (leftoverBtn) {
          leftoverBtn.addEventListener('click', async () => {
            state.leftoverTargetMealId = meal.id;
            hideHistory();
            dom.cameraPlaceholder.classList.add('hidden');
            dom.cameraStream.classList.remove('hidden');
            await camera.start();
            showToast('Scan your leftover plate 📸');
          });
        }
      }

      if (!meal.energy_rating) {
        const slider = card.querySelector(`#slider-${meal.id}`);
        const valDisp = card.querySelector(`#val-${meal.id}`);
        const saveBtn = card.querySelector('.energy-save-btn');

        slider.addEventListener('input', (e) => {
          valDisp.textContent = e.target.value;
        });

        saveBtn.addEventListener('click', async () => {
          saveBtn.textContent = '...';
          await updateMealEnergy(meal.id, parseInt(slider.value));
          const tagger = card.querySelector(`#energy-tagger-${meal.id}`);
          tagger.innerHTML = `<div class="energy-badge">⚡ Energy: ${slider.value}/10</div>`;
        });
      }
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
