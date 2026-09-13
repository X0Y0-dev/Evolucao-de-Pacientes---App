import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase URL provided by the user
const supabaseUrl = 'https://nrrprjfnsutsmrdzivka.supabase.co';
const supabaseAnonKey = 'sb_publishable_B3LjncqWyIM9pjmB9g7Cig_6MBQBLk_';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
