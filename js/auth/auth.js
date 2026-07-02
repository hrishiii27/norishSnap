import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function signInWithGoogle() {
  if (!supabase) return alert("Supabase not configured");
  return supabase.auth.signInWithOAuth({ provider: 'google' });
}

export async function signInWithApple() {
  if (!supabase) return alert("Supabase not configured");
  return supabase.auth.signInWithOAuth({ provider: 'apple' });
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  return data?.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange(callback);
}
