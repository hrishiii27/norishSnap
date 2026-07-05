/**
 * NourishSnap AI — Database Wrapper
 * Uses Supabase as primary source of truth, falls back to IndexedDB if offline or unconfigured.
 */

import { createClient } from '@supabase/supabase-js';

const DB_NAME = 'NourishSnapDB';
const DB_VERSION = 1;

const STORES = {
  USERS: 'users',
  MEAL_LOGS: 'meal_logs',
  MEAL_LOG_ITEMS: 'meal_log_items',
  FOOD_REFERENCE: 'food_reference_dictionary',
  REVISION_MEMORY: 'user_smart_revision_memory',
};

// ── Supabase Setup ──
const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_URL = rawUrl.replace(/\/rest\/v1\/?$/, ''); // Clean if user added /rest/v1/
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase client initialized');
}

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const usersStore = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        usersStore.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.MEAL_LOGS)) {
        const logsStore = db.createObjectStore(STORES.MEAL_LOGS, { keyPath: 'id' });
        logsStore.createIndex('user_id', 'user_id', { unique: false });
        logsStore.createIndex('logged_at', 'logged_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MEAL_LOG_ITEMS)) {
        const itemsStore = db.createObjectStore(STORES.MEAL_LOG_ITEMS, { keyPath: 'id' });
        itemsStore.createIndex('meal_log_id', 'meal_log_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.FOOD_REFERENCE)) {
        const foodStore = db.createObjectStore(STORES.FOOD_REFERENCE, { keyPath: 'id' });
        foodStore.createIndex('standard_name', 'standard_name', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.REVISION_MEMORY)) {
        const memoryStore = db.createObjectStore(STORES.REVISION_MEMORY, { keyPath: 'id' });
        memoryStore.createIndex('user_trigger', ['user_id', 'detected_ai_trigger_phrase'], { unique: true });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

function generateUUID() {
  return crypto.randomUUID();
}

/** Get or create a local user (syncs to Supabase if available) */
export async function getOrCreateLocalUser(authUser = null) {
  const email = authUser ? authUser.email : 'local@nourishsnap.app';
  
  if (supabase) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
      
    if (existingUser) return existingUser;

    const newUser = {
      id: authUser ? authUser.id : undefined, // Let supabase generate if undefined, but usually we map auth.uid -> public.users.id
      email: email,
      daily_calorie_target: 2000,
      protein_target_g: 120,
      carbs_target_g: 200,
      fats_target_g: 60,
    };
    
    // Some setups use a trigger for auth.users to public.users, but we can try to insert
    try {
      const { data: insertedUser, error } = await supabase
        .from('users')
        .upsert(newUser)
        .select()
        .single();
        
      if (!error && insertedUser) return insertedUser;
    } catch(e) {}
  }

  // Fallback to IndexedDB
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.USERS, 'readwrite');
    const store = tx.objectStore(STORES.USERS);
    const getReq = store.index('email').get(defaultEmail);
    
    getReq.onsuccess = () => {
      if (getReq.result) {
        resolve(getReq.result);
      } else {
        const newUser = {
          id: generateUUID(),
          email: defaultEmail,
          created_at: new Date().toISOString(),
          daily_calorie_target: 2000,
          protein_target_g: 120,
          carbs_target_g: 200,
          fats_target_g: 60,
        };
        store.add(newUser);
        resolve(newUser);
      }
    };
  });
}

/** Log a meal to Supabase (with IndexedDB fallback) */
export async function logMeal(mealData, items) {
  const mealLog = {
    id: generateUUID(),
    user_id: mealData.user_id,
    logged_at: new Date().toISOString(),
    image_url_storage_ref: mealData.image_url || null,
    total_calculated_calories: mealData.total_calories,
    total_protein_g: mealData.total_protein,
    total_carbs_g: mealData.total_carbs,
    total_fats_g: mealData.total_fats,
    device_latitude: mealData.latitude || null,
    device_longitude: mealData.longitude || null,
    time_of_day_context: mealData.context || null,
  };

  const savedItems = items.map(item => ({
    id: generateUUID(),
    meal_log_id: mealLog.id,
    food_name_logged: item.food_name_raw,
    reference_food_id: item.reference_id || null,
    input_weight_grams: item.weight_grams,
    selected_display_unit: item.display_unit || 'grams',
    was_ai_predicted: item.was_ai_predicted !== false,
    was_user_corrected: item.was_user_corrected || false,
    original_ai_prediction_name: item._original_ai_name || item.food_name_raw,
    shadow_fat_override_applied: item.hidden_fat_detected || false,
    calculated_calories: item.calories,
    calculated_protein: item.protein,
    calculated_carbs: item.carbs,
    calculated_fats: item.fats,
  }));

  if (supabase) {
    try {
      await supabase.from('meal_logs').insert(mealLog);
      await supabase.from('meal_log_items').insert(savedItems);
      // Optional: still save to local for offline caching parity
    } catch (err) {
      console.warn('Supabase log failed, falling back to local:', err);
    }
  }

  // Always save to IndexedDB as local cache
  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readwrite');
  tx.objectStore(STORES.MEAL_LOGS).add({ ...mealLog, _synced: !!supabase });
  const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
  for (const logItem of savedItems) {
    itemsStore.add(logItem);
  }

  return { meal_log: mealLog, items: savedItems };
}

/** Get today's meals from Supabase (fallback to IndexedDB) */
export async function getTodayMeals(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('meal_logs')
        .select(`
          *,
          items:meal_log_items(*)
        `)
        .eq('user_id', userId)
        .gte('logged_at', todayStr)
        .order('logged_at', { ascending: false });

      if (!error && data) return data;
    } catch (err) {
      console.warn('Supabase fetch failed, falling back to local:', err);
    }
  }

  // Local fetch
  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readonly');
  const logsStore = tx.objectStore(STORES.MEAL_LOGS);

  return new Promise((resolve) => {
    const request = logsStore.index('user_id').getAll(userId);
    request.onsuccess = async () => {
      const allLogs = request.result;
      const todayLogs = allLogs.filter((log) => log.logged_at >= todayStr);
      todayLogs.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

      const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
      for (const log of todayLogs) {
        const itemsReq = itemsStore.index('meal_log_id').getAll(log.id);
        await new Promise((res) => {
          itemsReq.onsuccess = () => {
            log.items = itemsReq.result;
            res();
          };
        });
      }
      resolve(todayLogs);
    };
  });
}

/** Get all historical meals */
export async function getAllMeals(userId) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('meal_logs')
        .select(`
          *,
          items:meal_log_items(*)
        `)
        .eq('user_id', userId)
        .order('logged_at', { ascending: false });

      if (!error && data) return data;
    } catch (err) {
      console.warn('Supabase fetch failed, falling back to local:', err);
    }
  }

  // Local fetch
  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readonly');
  const logsStore = tx.objectStore(STORES.MEAL_LOGS);

  return new Promise((resolve) => {
    const request = logsStore.index('user_id').getAll(userId);
    request.onsuccess = async () => {
      const allLogs = request.result;
      allLogs.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

      const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
      for (const log of allLogs) {
        const itemsReq = itemsStore.index('meal_log_id').getAll(log.id);
        await new Promise((res) => {
          itemsReq.onsuccess = () => {
            log.items = itemsReq.result;
            res();
          };
        });
      }
      resolve(allLogs);
    };
  });
}

/** Get today's total macros */
export async function getTodayTotals(userId) {
  const meals = await getTodayMeals(userId);

  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    meal_count: meals.length,
  };

  for (const meal of meals) {
    totals.calories += meal.total_calculated_calories || 0;
    totals.protein += meal.total_protein_g || 0;
    totals.carbs += meal.total_carbs_g || 0;
    totals.fats += meal.total_fats_g || 0;
  }

  return totals;
}

/** Update energy rating for a logged meal */
export async function updateMealEnergy(mealId, energyRating) {
  if (supabase) {
    try {
      await supabase
        .from('meal_logs')
        .update({ energy_rating: energyRating })
        .eq('id', mealId);
    } catch (err) {
      console.warn('Supabase update failed:', err);
    }
  }

  // Update IndexedDB fallback
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.MEAL_LOGS, 'readwrite');
    const store = tx.objectStore(STORES.MEAL_LOGS);
    const getReq = store.get(mealId);
    getReq.onsuccess = () => {
      const meal = getReq.result;
      if (meal) {
        meal.energy_rating = energyRating;
        store.put(meal);
      }
      resolve();
    };
  });
}

/** Subtract leftovers from a meal */
export async function subtractLeftovers(mealId, leftoverItems) {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readwrite');
    const logsStore = tx.objectStore(STORES.MEAL_LOGS);
    const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
    
    // Get all items for this meal
    const itemsReq = itemsStore.index('meal_log_id').getAll(mealId);
    itemsReq.onsuccess = async () => {
      let originalItems = itemsReq.result;
      
      // Match and subtract
      for (const leftover of leftoverItems) {
        // Find best match in original items
        const match = originalItems.find(i => 
          i.food_name_logged.toLowerCase() === leftover.food_name_raw.toLowerCase()
        );
        
        if (match) {
          // Subtract calories and macros, ensuring we don't go below 0
          match.calculated_calories = Math.max(0, match.calculated_calories - (leftover.calories || 0));
          match.calculated_protein = Math.max(0, match.calculated_protein - (leftover.protein || 0));
          match.calculated_carbs = Math.max(0, match.calculated_carbs - (leftover.carbs || 0));
          match.calculated_fats = Math.max(0, match.calculated_fats - (leftover.fats || 0));
          match.input_weight_grams = Math.max(0, match.input_weight_grams - (leftover.weight_grams || 0));
          
          itemsStore.put(match);
        }
      }
      
      // Re-sum totals for the meal
      let newCalories = 0, newProtein = 0, newCarbs = 0, newFats = 0;
      originalItems.forEach(i => {
        newCalories += i.calculated_calories;
        newProtein += i.calculated_protein;
        newCarbs += i.calculated_carbs;
        newFats += i.calculated_fats;
      });
      
      // Update meal log
      const mealReq = logsStore.get(mealId);
      mealReq.onsuccess = async () => {
        const meal = mealReq.result;
        if (meal) {
          meal.total_calculated_calories = Math.round(newCalories);
          meal.total_protein_g = Number(newProtein.toFixed(1));
          meal.total_carbs_g = Number(newCarbs.toFixed(1));
          meal.total_fats_g = Number(newFats.toFixed(1));
          meal.has_leftover_subtracted = true;
          logsStore.put(meal);
          
          // Sync to Supabase if available
          if (supabase) {
            try {
              await supabase.from('meal_logs').update({
                total_calculated_calories: meal.total_calculated_calories,
                total_protein_g: meal.total_protein_g,
                total_carbs_g: meal.total_carbs_g,
                total_fats_g: meal.total_fats_g,
                has_leftover_subtracted: true
              }).eq('id', mealId);
              
              // Upsert items (requires ID match)
              for (const i of originalItems) {
                await supabase.from('meal_log_items').update({
                  calculated_calories: i.calculated_calories,
                  calculated_protein: i.calculated_protein,
                  calculated_carbs: i.calculated_carbs,
                  calculated_fats: i.calculated_fats,
                  input_weight_grams: i.input_weight_grams
                }).eq('id', i.id);
              }
            } catch (err) {
              console.warn('Supabase leftover sync failed:', err);
            }
          }
          
          resolve(meal);
        } else {
          resolve(null);
        }
      };
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteMeal(mealId) {
  if (supabase) {
    try {
      await supabase.from('meal_log_items').delete().eq('meal_log_id', mealId);
      await supabase.from('meal_logs').delete().eq('id', mealId);
    } catch (err) {
      console.warn('Supabase delete failed:', err);
    }
  }

  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readwrite');
  
  tx.objectStore(STORES.MEAL_LOGS).delete(mealId);
  
  return new Promise((resolve) => {
    const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
    const itemsReq = itemsStore.index('meal_log_id').getAll(mealId);
    itemsReq.onsuccess = () => {
      const items = itemsReq.result;
      items.forEach(i => itemsStore.delete(i.id));
      resolve();
    };
  });
}

/** Update user daily goals */
export async function updateUserGoals(userId, goals) {
  if (supabase) {
    try {
      await supabase.from('users').update(goals).eq('id', userId);
    } catch (err) {
      console.warn('Supabase goal update failed:', err);
    }
  }

  const db = await openDB();
  const tx = db.transaction(STORES.USERS, 'readwrite');
  const store = tx.objectStore(STORES.USERS);
  return new Promise((resolve) => {
    const getReq = store.get(userId);
    getReq.onsuccess = () => {
      const user = getReq.result;
      if (user) {
        Object.assign(user, goals);
        store.put(user);
      }
      resolve(user);
    };
  });
}

/** Get meals within a date range */
export async function getMealsByDateRange(userId, startDate, endDate) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('meal_logs')
        .select(`
          *,
          items:meal_log_items(*)
        `)
        .eq('user_id', userId)
        .gte('logged_at', startDate.toISOString())
        .lte('logged_at', endDate.toISOString())
        .order('logged_at', { ascending: true });

      if (!error && data) return data;
    } catch (err) {
      console.warn('Supabase date range fetch failed:', err);
    }
  }

  // Local fetch
  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readonly');
  const logsStore = tx.objectStore(STORES.MEAL_LOGS);

  return new Promise((resolve) => {
    const request = logsStore.index('user_id').getAll(userId);
    request.onsuccess = async () => {
      const allLogs = request.result;
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();
      const filtered = allLogs.filter((log) => log.logged_at >= startStr && log.logged_at <= endStr);
      filtered.sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

      const itemsStore = tx.objectStore(STORES.MEAL_LOG_ITEMS);
      for (const log of filtered) {
        const itemsReq = itemsStore.index('meal_log_id').getAll(log.id);
        await new Promise((res) => {
          itemsReq.onsuccess = () => {
            log.items = itemsReq.result;
            res();
          };
        });
      }
      resolve(filtered);
    };
  });
}

export { STORES, generateUUID };
