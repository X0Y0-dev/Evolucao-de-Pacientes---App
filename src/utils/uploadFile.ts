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
  contentType: string,
  upsert: boolean = false
): Promise<UploadResult> {
  // Copia o arquivo pra um path totalmente controlado pelo app antes de ler,
  // contorna casos de arquivos vindos de outros apps (WhatsApp, Drive, etc.)
  // cuja URI original pode ficar inacessível pro FileSystem.
  const safeUri = `${FileSystem.cacheDirectory}upload-${Date.now()}-${fileName}`;
  await FileSystem.copyAsync({ from: localUri, to: safeUri });

  const base64 = await FileSystem.readAsStringAsync(safeUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, decode(base64), {
      contentType,
      upsert,
    });

  await FileSystem.deleteAsync(safeUri, { idempotent: true });

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

/**
 * Converte o path da foto do paciente em uma URL pública do Supabase Storage.
 */
export function getPatientPhotoUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  const { data } = supabase.storage.from('pacientes_fotos').getPublicUrl(path);
  return data.publicUrl;
}

