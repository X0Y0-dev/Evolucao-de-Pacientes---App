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

  if (!detail) {
    if (status === 413) {
      detail = 'O arquivo excede o limite de tamanho permitido pelo servidor de OCR.';
    } else if (status === 415) {
      detail = 'Tipo de arquivo não suportado pelo servidor de OCR. Envie PDF, PNG ou JPG/JPEG.';
    } else if (status === 422) {
      detail =
        'O arquivo não pôde ser processado pelo servidor de OCR (pode estar corrompido, protegido por senha ou exceder o limite de páginas).';
    } else if (status >= 500) {
      detail = 'Erro interno no servidor de OCR. Tente novamente em alguns instantes.';
    } else {
      detail = `Erro HTTP ${status} do servidor de OCR.`;
    }
  }

  const error: OcrError = {
    message: detail,
    retryable: status >= 500,
    isHttpError: true,
  };
  throw error;
}

/**
 * Classifica exceções em mensagens de erro claras e distintas.
 */
function classifyError(err: any, primaryError?: unknown): OcrError {
  if (err && typeof err === 'object' && 'retryable' in err && 'message' in err) {
    return err as OcrError;
  }

  const errMsg = String(err?.message || err || '').toLowerCase();
  const primaryMsg = String((primaryError as any)?.message || primaryError || '').toLowerCase();

  // 1. Timeout
  if (
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError' ||
    errMsg.includes('timeout') ||
    errMsg.includes('timed out')
  ) {
    return {
      message: 'O servidor demorou demais para responder.',
      retryable: true,
    };
  }

  // 2. Erro de preparação do arquivo
  if (
    errMsg.includes('unsupported formdatapart') ||
    errMsg.includes('filenotfound') ||
    errMsg.includes('no such file') ||
    errMsg.includes('does not exist') ||
    errMsg.includes('cannot open file') ||
    errMsg.includes('invalid file uri') ||
    (primaryMsg.includes('unsupported formdatapart') && !errMsg.includes('connect'))
  ) {
    return {
      message: 'Não foi possível preparar o arquivo para envio.',
      retryable: false,
    };
  }

  // 3. Erro de rede (falha ao alcançar o servidor)
  if (
    errMsg.includes('network request failed') ||
    errMsg.includes('failed to connect') ||
    errMsg.includes('econnrefused') ||
    errMsg.includes('enotfound') ||
    errMsg.includes('networkerror') ||
    errMsg.includes('connection refused') ||
    errMsg.includes('could not connect') ||
    errMsg.includes('sockettimeout') ||
    errMsg.includes('software caused connection abort') ||
    errMsg.includes('connectexception')
  ) {
    return {
      message: 'Não foi possível alcançar o servidor de OCR.',
      retryable: true,
    };
  }

  // Fallback padrão
  return {
    message: 'Não foi possível alcançar o servidor de OCR.',
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
  const url = getOcrEndpointUrl();
  const safeFileName = getSafeFileName(fileName, mimeType);
  const safeMimeType = inferMimeType(safeFileName, mimeType);

  // 1. Validar tipo antes do envio
  if (!ALLOWED_MIME_TYPES.has(safeMimeType)) {
    throw {
      message: 'Tipo de arquivo não suportado. Envie PDF, PNG ou JPG/JPEG.',
      retryable: false,
    } satisfies OcrError;
  }

  // 2. Validar existência e tamanho local do arquivo antes do upload
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
  try {
    if (__DEV__) {
      console.log('[OCR] Tentando envio via Caminho Principal (new File + FormData + fetch)...');
    }

    const expoFile = new ExpoFile(fileUri);
    const formData = new FormData();
    formData.append('file', expoFile as unknown as Blob, safeFileName);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      // Não definir Content-Type manualmente (o fetch gera o boundary)
    });

    clearTimeout(timeoutId);

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
    // Se o backend respondeu com erro HTTP (ex: 413, 415, 422), não retenta Plano B
    if (err && err.isHttpError) {
      throw err;
    }

    primaryError = err;

    if (__DEV__) {
      console.log(
        '[OCR] Caminho Principal não concluiu o envio. Erro:',
        err?.message || err
      );
      console.log('[OCR] Acionando Plano B (FileSystem.uploadAsync nativo)...');
    }
  }

  // -------------------------------------------------------------------------
  // Plano B: `FileSystem.uploadAsync` com `FileSystemUploadType.MULTIPART`
  // -------------------------------------------------------------------------
  try {
    const uploadPromise = FileSystem.uploadAsync(url, fileUri, {
      fieldName: 'file',
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.MULTIPART,
      mimeType: safeMimeType,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
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
  }
}
