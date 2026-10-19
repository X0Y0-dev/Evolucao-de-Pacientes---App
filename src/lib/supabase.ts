import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase URL e Chave Pública obtidas das variáveis de ambiente
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://nrrprjfnsutsmrdzivka.supabase.co';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ||
  process.env.SUPABASE_KEY ||
  'sb_publishable_B3LjncqWyIM9pjmB9g7Cig_6MBQBLk_';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
