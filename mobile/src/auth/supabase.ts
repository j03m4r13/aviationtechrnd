import 'react-native-url-polyfill/auto';

import {
  createClient,
  processLock
} from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureAuthStorage } from './secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage:
        Platform.OS === 'web'
          ? undefined
          : secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock
    }
  }
);

if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
