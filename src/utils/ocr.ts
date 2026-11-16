/**
 * utils/ocr.ts
 * Função isolada para enviar um arquivo ao backend de OCR e receber o texto extraído.
 *
 * Arquitetura de envio (Expo SDK 58):
 * - Caminho Principal: Instancia `File` de `expo-file-system` (implementa Blob) e envia via `FormData` + `fetch`.
 * - Plano B (Fallback): Usa `FileSystem.uploadAsync` com `FileSystemUploadType.MULTIPART` de `expo-file-system/legacy`,
 *   enviando o multipart diretamente pelos módulos nativos do SO (OkHttp no Android / NSURLSession no iOS),
 *   contornando 100% eventuais incompatibilidades de FormData/Fetch no runtime JS do React Native.
 */

import { File as ExpoFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Limite de tamanho local (mesma regra do backend: 10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** MIME types aceitos pelo serviço de OCR. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

/** Timeout da requisição (90 s — OCR de PDFs maiores pode demorar). */
const REQUEST_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface OcrResult {
  texto: string;
}

export interface OcrError {
  message: string;
  /** true se o usuário pode tentar novamente (ex.: timeout, erro temporário de rede). */
  retryable: boolean;
  isHttpError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Obtém a URL do endpoint /ocr garantindo que não aponte para localhost
 * e aceitando tanto a URL base quanto a URL já terminada em /ocr.
 */
function getOcrEndpointUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_OCR_URL?.trim();

  if (!envUrl) {
    throw {
      message:
        'URL do servidor de OCR não configurada. Defina EXPO_PUBLIC_OCR_URL no arquivo .env com o IP do computador na rede local (ex: http://192.168.0.15:8000).',
      retryable: false,
    } satisfies OcrError;
  }

  // Se estiver em desenvolvimento e configurado com localhost num dispositivo físico, avisar nos logs
  if (__DEV__ && envUrl.includes('localhost')) {
    console.warn(
      '[OCR] ATENÇÃO: A URL do OCR contém "localhost". Em aparelhos físicos, localhost aponta para o próprio celular. Substitua pelo IP local do computador (ex: http://192.168.x.x:8000).'
    );
  }

  // Remove barras finais e garante que o path termine em /ocr
  return envUrl.endsWith('/ocr') ? envUrl : `${envUrl.replace(/\/+$/, '')}/ocr`;
}

/**
 * Infere o MIME type a partir da extensão caso não fornecido.
 */
function inferMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType.trim() && mimeType !== 'undefined' && mimeType !== 'null') {
    const lower = mimeType.toLowerCase();
    return lower === 'image/jpg' ? 'image/jpeg' : lower;
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Garante um nome de arquivo válido para o cabeçalho multipart.
 */
function getSafeFileName(fileName?: string, mimeType?: string): string {
  if (fileName && fileName.trim() && fileName !== 'undefined' && fileName !== 'null') {
    return fileName;
  }
  const isPdf = mimeType?.includes('pdf');
  const isPng = mimeType?.includes('png');
  const ext = isPdf ? 'pdf' : isPng ? 'png' : 'jpg';
  return `documento-${Date.now()}.${ext}`;
}

/**
 * Trata respostas de erro HTTP do servidor (413, 415, 422, 500, etc.).
 */
function handleHttpError(status: number, rawBody: string): never {
  let detail = '';
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed.detail === 'string') {
      detail = parsed.detail;
    } else if (Array.isArray(parsed.detail)) {
      detail = parsed.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
    } else if (parsed.message) {
      detail = parsed.message;
    }
  } catch {
    // rawBody não é JSON, usa fallback com base no status
  }

  let retryable = false;

  if (status === 401) {
    detail = 'Sessão expirada, faça login novamente.';
    retryable = false;
  } else if (status === 503) {
    detail = detail || 'O servidor de OCR está ocupado ou temporariamente indisponível. Tente novamente em alguns instantes.';
    retryable = true;
  } else if (status === 413) {
    detail = detail || 'O arquivo excede o limite de tamanho permitido pelo servidor de OCR.';
    retryable = false;
  } else if (status === 415) {
    detail = detail || 'Tipo de arquivo não suportado pelo servidor de OCR. Envie PDF, PNG ou JPG/JPEG.';
    retryable = false;
  } else if (status === 422) {
    detail =
      detail ||
      'O arquivo não pôde ser processado pelo servidor de OCR (pode estar corrompido, protegido por senha ou exceder o limite de páginas).';
    retryable = false;
  } else if (status >= 500) {
    detail = detail || 'Erro interno no servidor de OCR. Tente novamente em alguns instantes.';
    retryable = true;
  } else {
    detail = detail || `Erro HTTP ${status} do servidor de OCR.`;
    retryable = false;
  }

  const error: OcrError = {
    message: detail,
    retryable,
    isHttpError: true,
  };
  throw error;
}

/**
 * Determina se o erro ocorrido no Caminho Principal justifica o acionamento do Plano B.
 *
 * O Plano B (FileSystem.uploadAsync nativo) existe exclusivamente para contornar
 * limitações do runtime JavaScript/Hermes na montagem do FormData/Blob (ex.: "Unsupported FormDataPart").
 *
 * NÃO aciona o Plano B em caso de:
 * - Respostas HTTP do servidor (4xx, 5xx) — já recebidas e tratadas.
 * - Timeout ou cancelamento manual (AbortError, TimeoutError).
 * - Queda de conexão, socket fechado ou falhas de rede ("network request failed", "connection reset", etc.).
 * Reenviar o arquivo nesses casos duplicaria a carga de um servidor que pode estar ocupado, reiniciando ou sobrecarregado.
 */
function deveAcionarPlanoB(err: any): boolean {
  if (!err) return false;
  if (err.isHttpError) return false;

  const name = String(err.name || '').toLowerCase();
  if (name === 'aborterror' || name === 'timeouterror') {
    return false;
  }

  const msg = String(err.message || err || '').toLowerCase();

  // Erros de timeout ou rede: NÃO acionar Plano B
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('network request failed') ||
    msg.includes('failed to connect') ||
    msg.includes('connection refused') ||
    msg.includes('connection reset') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    msg.includes('networkerror')
  ) {
    return false;
  }

  // Erros conhecidos de incompatibilidade de FormData/Blob no React Native/Hermes:
  if (
    msg.includes('unsupported formdatapart') ||
    msg.includes('filenotfound') ||
    msg.includes('invalid file uri') ||
    msg.includes('cannot open file')
  ) {
    return true;
  }

  return false;
}

/**
 * Classifica exceções em mensagens de erro claras e distintas.
 * - Timeout -> "O servidor demorou demais para responder."
 * - Conexão encerrada durante processamento -> Mensagem honesta sem culpar internet
 * - Falha de alcance inicial -> "Não foi possível alcançar o servidor de OCR."
 * - Preparação do arquivo -> "Não foi possível preparar o arquivo para envio."
 */
function classifyError(err: any, primaryError?: unknown): OcrError {
  if (err && typeof err === 'object' && 'retryable' in err && 'message' in err) {
    return err as OcrError;
  }

  const errMsg = String(err?.message || err || '').toLowerCase();
  const primaryMsg = String((primaryError as any)?.message || primaryError || '').toLowerCase();
  const combined = `${errMsg} ${primaryMsg}`;

  // 1. Timeout
  if (
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError' ||
    combined.includes('timeout') ||
    combined.includes('timed out')
  ) {
    return {
      message: 'O servidor demorou demais para responder.',
      retryable: true,
    };
  }

  // 2. Erro de preparação do arquivo
  if (
    combined.includes('unsupported formdatapart') ||
    combined.includes('filenotfound') ||
    combined.includes('no such file') ||
    combined.includes('does not exist') ||
    combined.includes('cannot open file') ||
    combined.includes('invalid file uri')
  ) {
    return {
      message: 'Não foi possível preparar o arquivo para envio.',
      retryable: false,
    };
  }

  // 3. Conexão encerrada durante o processamento (servidor reiniciando, ocupado ou socket abortado)
  if (
    combined.includes('network request failed') ||
    combined.includes('connection reset') ||
    combined.includes('econnreset') ||
    combined.includes('software caused connection abort') ||
    combined.includes('socket closed') ||
    combined.includes('broken pipe')
  ) {
    return {
      message:
        'A conexão com o servidor foi encerrada durante o processamento. O servidor pode estar ocupado, reiniciando ou temporariamente indisponível.',
      retryable: true,
    };
  }

  // 4. Erro de rede ao tentar conectar inicialmente (servidor inacessível / offline)
  if (
    combined.includes('failed to connect') ||
    combined.includes('connection refused') ||
    combined.includes('could not connect') ||
    combined.includes('econnrefused') ||
    combined.includes('enotfound') ||
    combined.includes('networkerror')
  ) {
    return {
      message: 'Não foi possível alcançar o servidor de OCR.',
      retryable: true,
    };
  }

  // Fallback padrão
  return {
    message: 'Ocorreu uma falha na comunicação com o servidor de OCR.',
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Envia um arquivo ao endpoint `/ocr` e devolve o texto extraído.
 *
 * @param fileUri  - URI local do arquivo (file://, content://, cache, etc.)
 * @param fileName - Nome original do arquivo (opcional)
 * @param mimeType - MIME type do arquivo (opcional)
 *
 * @returns `OcrResult` em caso de sucesso.
 * @throws `OcrError` com mensagem amigável e indicador de retry.
 */
export async function extrairTextoDoArquivo(
  fileUri: string,
  fileName?: string,
  mimeType?: string,
): Promise<OcrResult> {
  // 1. Validar autenticação do usuário antes de qualquer operação de rede
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token || sessionError) {
    throw {
      message: 'Sessão expirada, faça login novamente.',
      retryable: false,
    } satisfies OcrError;
  }

  const url = getOcrEndpointUrl();
  const safeFileName = getSafeFileName(fileName, mimeType);
  const safeMimeType = inferMimeType(safeFileName, mimeType);

  // 2. Validar tipo antes do envio
  if (!ALLOWED_MIME_TYPES.has(safeMimeType)) {
    throw {
      message: 'Tipo de arquivo não suportado. Envie PDF, PNG ou JPG/JPEG.',
      retryable: false,
    } satisfies OcrError;
  }

  // 3. Validar existência e tamanho local do arquivo antes do upload
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      throw {
        message: 'Não foi possível preparar o arquivo para envio. O arquivo selecionado não foi encontrado.',
        retryable: false,
      } satisfies OcrError;
    }
    if ('size' in info && typeof info.size === 'number' && info.size > MAX_FILE_SIZE) {
      throw {
        message: `O arquivo excede o limite de ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
        retryable: false,
      } satisfies OcrError;
    }
  } catch (err) {
    if ((err as OcrError).retryable !== undefined) throw err;
    if (__DEV__) {
      console.log('[OCR] Aviso ao checar tamanho local do arquivo:', err);
    }
  }

  if (__DEV__) {
    console.log('[OCR] Endpoint:', url);
    console.log('[OCR] Arquivo:', safeFileName, '| MIME:', safeMimeType);
  }

  let primaryError: unknown = null;

  // -------------------------------------------------------------------------
  // Caminho Principal: `File` do expo-file-system + `FormData` + `fetch`
  // -------------------------------------------------------------------------
  let primaryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();

  try {
    if (__DEV__) {
      console.log('[OCR] Tentando envio via Caminho Principal (new File + FormData + fetch)...');
    }

    const expoFile = new ExpoFile(fileUri);
    const formData = new FormData();
    formData.append('file', expoFile as unknown as Blob, safeFileName);

    primaryTimeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      // Não definir Content-Type manualmente (o fetch gera o boundary)
    });

    if (__DEV__) {
      console.log('[OCR] Resposta Caminho Principal status:', response.status);
    }

    if (!response.ok) {
      const rawBody = await response.text();
      handleHttpError(response.status, rawBody);
    }

    const data: OcrResult = await response.json();
    if (data.texto === undefined || data.texto === null) {
      throw {
        message: 'Resposta inesperada do servidor de OCR.',
        retryable: false,
      } satisfies OcrError;
    }

    return data;
  } catch (err: any) {
    // Se o backend respondeu com erro HTTP (ex: 401, 413, 415, 422, 503), não retenta Plano B
    if (err && err.isHttpError) {
      throw err;
    }

    // Só aciona o Plano B se o erro for estritamente de preparação do arquivo/FormData
    // Timeout, abort, falhas de rede ou conexão encerrada NÃO acionam o Plano B
    if (!deveAcionarPlanoB(err)) {
      throw classifyError(err);
    }

    primaryError = err;

    if (__DEV__) {
      console.log(
        '[OCR] Caminho Principal apresentou erro de preparação de FormData. Erro:',
        err?.message || err
      );
      console.log('[OCR] Acionando Plano B (FileSystem.uploadAsync nativo)...');
    }
  } finally {
    if (primaryTimeoutId !== null) {
      clearTimeout(primaryTimeoutId);
      primaryTimeoutId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Plano B: `FileSystem.uploadAsync` com `FileSystemUploadType.MULTIPART`
  // -------------------------------------------------------------------------
  let backupTimeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const uploadPromise = FileSystem.uploadAsync(url, fileUri, {
      fieldName: 'file',
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.MULTIPART,
      mimeType: safeMimeType,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      backupTimeoutId = setTimeout(() => {
        const timeoutErr = new Error('O servidor demorou demais para responder.');
        timeoutErr.name = 'TimeoutError';
        reject(timeoutErr);
      }, REQUEST_TIMEOUT_MS);
    });

    const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

    if (__DEV__) {
      console.log('[OCR] Resposta Plano B status:', uploadResult.status);
    }

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      handleHttpError(uploadResult.status, uploadResult.body);
    }

    let data: OcrResult;
    try {
      data = JSON.parse(uploadResult.body);
    } catch {
      throw {
        message: 'Resposta inválida do servidor de OCR (formato não reconhecido).',
        retryable: false,
      } satisfies OcrError;
    }

    if (data.texto === undefined || data.texto === null) {
      throw {
        message: 'Resposta inesperada do servidor de OCR.',
        retryable: false,
      } satisfies OcrError;
    }

    return data;
  } catch (err: any) {
    if (__DEV__) {
      console.log('[OCR] Erro real Plano B:', err);
    }

    if (err && err.isHttpError) {
      throw err;
    }

    throw classifyError(err, primaryError);
  } finally {
    if (backupTimeoutId !== null) {
      clearTimeout(backupTimeoutId);
      backupTimeoutId = null;
    }
  }
}
