import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

type Bucket = 'pacientes_fotos' | 'relatorios_arquivos';

export type UploadResult = {
  path: string;
  publicUrl: string;
};

/**
 * Lê um arquivo local via expo-file-system (base64),
 * decodifica para ArrayBuffer e faz upload ao Supabase Storage.
 * Evita o problema de React Native não suportar fetch().blob().
 */
export async function uploadFileToBucket(
  localUri: string,
  bucket: Bucket,
  fileName: string,
  contentType: string
): Promise<UploadResult> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, decode(base64), {
      contentType,
      upsert: true, // substitui se já existir arquivo com o mesmo nome
    });

  if (error) throw error;

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return { path: data.path, publicUrl: publicData.publicUrl };
}

/** Detecta o contentType correto a partir da extensão do arquivo. */
export function getContentType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  switch (ext) {
    case 'png':  return 'image/png';
    case 'pdf':  return 'application/pdf';
    case 'jpeg':
    case 'jpg':
    default:     return 'image/jpeg';
  }
}
