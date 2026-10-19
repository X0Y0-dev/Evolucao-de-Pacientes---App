// utils/storage.ts
import { supabase } from '../lib/supabase';

export async function urlAssinada(bucket: string, path: string | null, segundos = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
  if (error) {
    console.warn('Erro ao assinar URL:', error.message);
    return null;
  }
  return data.signedUrl;
}
