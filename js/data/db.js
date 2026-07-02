/**
 * NourishSnap AI — IndexedDB Wrapper
 * Local database for meal logs, user preferences, and offline queuing.
 * Designed for smooth future migration to Supabase:
 *   - Table names match the PRD PostgreSQL schema exactly
 *   - Column names are identical
 *   - UUIDs used as primary keys
 *   - All writes return the same shape as Supabase would
 */

const DB_NAME = 'NourishSnapDB';
const DB_VERSION = 1;

// Store names match PRD PostgreSQL table names for migration parity
const STORES = {
  USERS: 'users',
  MEAL_LOGS: 'meal_logs',
  MEAL_LOG_ITEMS: 'meal_log_items',
  FOOD_REFERENCE: 'food_reference_dictionary',
  REVISION_MEMORY: 'user_smart_revision_memory',
};

let dbInstance = null;

/**
 * Open / initialize the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Users store
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const usersStore = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        usersStore.createIndex('email', 'email', { unique: true });
      }

      // Meal logs store
      if (!db.objectStoreNames.contains(STORES.MEAL_LOGS)) {
        const logsStore = db.createObjectStore(STORES.MEAL_LOGS, { keyPath: 'id' });
        logsStore.createIndex('user_id', 'user_id', { unique: false });
        logsStore.createIndex('logged_at', 'logged_at', { unique: false });
        logsStore.createIndex('user_date', ['user_id', 'logged_at'], { unique: false });
      }

      // Meal log items store
      if (!db.objectStoreNames.contains(STORES.MEAL_LOG_ITEMS)) {
        const itemsStore = db.createObjectStore(STORES.MEAL_LOG_ITEMS, { keyPath: 'id' });
        itemsStore.createIndex('meal_log_id', 'meal_log_id', { unique: false });
      }

      // Food reference dictionary (for cached/custom entries)
      if (!db.objectStoreNames.contains(STORES.FOOD_REFERENCE)) {
        const foodStore = db.createObjectStore(STORES.FOOD_REFERENCE, { keyPath: 'id' });
        foodStore.createIndex('standard_name', 'standard_name', { unique: true });
      }

      // Smart revision memory
      if (!db.objectStoreNames.contains(STORES.REVISION_MEMORY)) {
        const memoryStore = db.createObjectStore(STORES.REVISION_MEMORY, { keyPath: 'id' });
        memoryStore.createIndex('user_trigger', ['user_id', 'detected_ai_trigger_phrase'], { unique: true });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Generate a UUID v4 (matches PostgreSQL gen_random_uuid()).
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Get the current local user (anonymous mode).
 * Creates one if none exists.
 */
export async function getOrCreateLocalUser() {
  const db = await openDB();
  const tx = db.transaction(STORES.USERS, 'readonly');
  const store = tx.objectStore(STORES.USERS);

  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const users = request.result;
      if (users.length > 0) {
        resolve(users[0]);
      } else {
        const newUser = {
          id: generateUUID(),
          email: 'local@nourishsnap.app',
          created_at: new Date().toISOString(),
          daily_calorie_target: 2000,
          protein_target_g: 120,
          carbs_target_g: 200,
          fats_target_g: 60,
        };
        await addRecord(STORES.USERS, newUser);
        resolve(newUser);
      }
    };
  });
}

/**
 * Update user targets.
 */
export async function updateUserTargets(userId, targets) {
  const db = await openDB();
  const tx = db.transaction(STORES.USERS, 'readwrite');
  const store = tx.objectStore(STORES.USERS);

  return new Promise((resolve, reject) => {
    const getReq = store.get(userId);
    getReq.onsuccess = () => {
      const user = { ...getReq.result, ...targets };
      const putReq = store.put(user);
      putReq.onsuccess = () => resolve(user);
      putReq.onerror = () => reject(putReq.error);
    };
  });
}

/**
 * Log a meal (header + items).
 * Returns the same shape a Supabase insert would.
 * @param {object} mealData - { user_id, image_url, total_calories, total_protein, total_carbs, total_fats, context, latitude, longitude }
 * @param {Array} items - Array of meal log items
 * @returns {Promise<{ meal_log: object, items: Array }>}
 */
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
    // Sync flag for future Supabase migration
    _synced: false,
  };

  await addRecord(STORES.MEAL_LOGS, mealLog);

  const savedItems = [];
  for (const item of items) {
    const logItem = {
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
    };
    await addRecord(STORES.MEAL_LOG_ITEMS, logItem);
    savedItems.push(logItem);
  }

  return { meal_log: mealLog, items: savedItems };
}

/**
 * Get today's meal logs for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getTodayMeals(userId) {
  const db = await openDB();
  const tx = db.transaction([STORES.MEAL_LOGS, STORES.MEAL_LOG_ITEMS], 'readonly');
  const logsStore = tx.objectStore(STORES.MEAL_LOGS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  return new Promise((resolve) => {
    const request = logsStore.index('user_id').getAll(userId);
    request.onsuccess = async () => {
      const allLogs = request.result;
      const todayLogs = allLogs.filter((log) => log.logged_at >= todayStr);

      // Sort by time descending
      todayLogs.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

      // Attach items to each log
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

/**
 * Get today's total macros for a user.
 */
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

// ── Internal helpers ──

async function addRecord(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.add(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export { STORES, generateUUID };
