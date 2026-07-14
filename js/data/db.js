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

// ── Streaks API ──

export async function updateStreak(userId) {
  if (!supabase) return null;
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD local
  
  // Get current user streak data
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('current_streak, longest_streak, last_logged_date')
    .eq('id', userId)
    .maybeSingle();
  if (fetchErr || !user) return null;
  
  const lastDate = user.last_logged_date;
  
  if (lastDate === today) {
    // Already logged today — no change
    return { current_streak: user.current_streak, longest_streak: user.longest_streak };
  }
  
  let newStreak;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  if (lastDate === yesterdayStr) {
    // Consecutive day
    newStreak = (user.current_streak || 0) + 1;
  } else {
    // Streak broken
    newStreak = 1;
  }
  
  const newLongest = Math.max(newStreak, user.longest_streak || 0);
  
  const { error: updateErr } = await supabase
    .from('users')
    .update({ current_streak: newStreak, longest_streak: newLongest, last_logged_date: today })
    .eq('id', userId);
  if (updateErr) console.error('Streak update error:', updateErr);
  
  return { current_streak: newStreak, longest_streak: newLongest };
}

export async function getStreak(userId) {
  if (!supabase) return { current_streak: 0, longest_streak: 0 };
  const { data, error } = await supabase
    .from('users')
    .select('current_streak, longest_streak, last_logged_date')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return { current_streak: 0, longest_streak: 0 };
  
  // Check if streak is still valid (last_logged_date was today or yesterday)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  if (data.last_logged_date !== today && data.last_logged_date !== yesterdayStr) {
    return { current_streak: 0, longest_streak: data.longest_streak || 0 };
  }
  return { current_streak: data.current_streak || 0, longest_streak: data.longest_streak || 0 };
}

// ── Meal Templates API ──

export async function saveTemplate(userId, name, items, totals) {
  if (!supabase) return null;
  const { error } = await supabase
    .from('meal_templates')
    .insert({
      user_id: userId,
      name,
      items: JSON.stringify(items),
      total_calories: totals.calories,
      total_protein: totals.protein,
      total_carbs: totals.carbs,
      total_fats: totals.fats,
    });
  if (error) throw error;
}

export async function getTemplates(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('meal_templates')
    .select('*')
    .eq('user_id', userId)
    .order('use_count', { ascending: false })
    .limit(10);
  if (error) return [];
  return data || [];
}

export async function deleteTemplate(templateId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('meal_templates')
    .delete()
    .eq('id', templateId);
  if (error) throw error;
}

export async function incrementTemplateUseCount(templateId) {
  if (!supabase) return;
  // RPC would be ideal but we can do a read-then-write
  const { data } = await supabase
    .from('meal_templates')
    .select('use_count')
    .eq('id', templateId)
    .maybeSingle();
  await supabase
    .from('meal_templates')
    .update({ use_count: (data?.use_count || 0) + 1 })
    .eq('id', templateId);
}

// ── Rooms Feature API ──

export async function createRoom(hostId, roomName) {
  if (!supabase) throw new Error('Rooms require a cloud connection.');
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  // Insert the room (don't chain .select().single() — it causes 406 with RLS)
  const { error: insertError } = await supabase
    .from('rooms')
    .insert({ host_id: hostId, name: roomName, invite_code: inviteCode });
  if (insertError) throw insertError;
  
  // Now fetch the room we just created (RLS allows host to read their own rooms)
  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('*')
    .eq('host_id', hostId)
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!room) throw new Error('Room created but could not be fetched');
  
  // Add host as a member automatically
  await supabase.from('room_members').insert({ room_id: room.id, user_id: hostId });
  return room;
}

export async function joinRoomByCode(userId, inviteCode) {
  if (!supabase) throw new Error('Rooms require a cloud connection.');
  const { data, error } = await supabase.rpc('join_room_by_code', { p_invite_code: inviteCode.toUpperCase() });
  if (error) throw error;
  // RPC returns the room UUID directly
  return data;
}

export async function inviteUserToRoom(roomId, hostId, email) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('room_invites')
    .upsert(
      { room_id: roomId, email: email.toLowerCase(), invited_by: hostId, status: 'pending' },
      { onConflict: 'room_id,email' }
    );
  if (error) throw error;
  return data;
}

export async function fetchUserRooms(userId) {
  if (!supabase) return [];
  // Get rooms where user is a member or host
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      room_members!inner(user_id)
    `)
    .eq('room_members.user_id', userId);
  if (error) throw error;
  return data;
}

export async function fetchRoomDetails(roomId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      members:room_members(
        user_id,
        joined_at,
        target_calories,
        target_protein_g,
        target_carbs_g,
        target_fats_g,
        users(email)
      )
    `)
    .eq('id', roomId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchRoomFeed(roomId, startDate, endDate) {
  if (!supabase) return [];
  // Fetch logs for all users in the room
  // (Relies on RLS allowing host to see member logs)
  const { data: roomMembers } = await supabase.from('room_members').select('user_id').eq('room_id', roomId);
  if (!roomMembers || roomMembers.length === 0) return [];
  
  const memberIds = roomMembers.map(m => m.user_id);
  
  let query = supabase
    .from('meal_logs')
    .select(`
      *,
      users(email),
      items:meal_log_items(*),
      comments:room_comments(
        id, comment_text, created_at, user_id, users(email)
      )
    `)
    .in('user_id', memberIds)
    .order('logged_at', { ascending: false });
    
  if (startDate) query = query.gte('logged_at', startDate.toISOString());
  if (endDate) query = query.lte('logged_at', endDate.toISOString());
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateMemberTargets(roomId, memberId, targets) {
  if (!supabase) return;
  const { error } = await supabase
    .from('room_members')
    .update(targets)
    .eq('room_id', roomId)
    .eq('user_id', memberId);
  if (error) throw error;
}

export async function addRoomComment(mealLogId, userId, commentText) {
  if (!supabase) return;
  const { error } = await supabase
    .from('room_comments')
    .insert({ meal_log_id: mealLogId, user_id: userId, comment_text: commentText });
  if (error) throw error;
}

export async function uploadRoomSnap(file, roomId) {
  if (!supabase) return null;
  const fileExt = file.name.split('.').pop();
  const fileName = `${generateUUID()}.${fileExt}`;
  const filePath = `${roomId}/${fileName}`;
  
  const { data, error } = await supabase.storage
    .from('room_meal_snaps')
    .upload(filePath, file);
    
  if (error) throw error;
  // Return the public URL or the path
  const { data: publicUrlData } = supabase.storage.from('room_meal_snaps').getPublicUrl(filePath);
  return publicUrlData.publicUrl;
}

export { STORES, generateUUID, supabase };
