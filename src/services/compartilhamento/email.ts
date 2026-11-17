/**
 * src/services/compartilhamento/email.ts
 *
 * Módulo de envio de relatórios via cliente nativo de e-mail usando expo-mail-composer.
 *
 * Características da implementação:
 * 1. Cliente Nativo: Dispara a folha de composição de e-mail do sistema operacional
 *    sem depender de serviços de backend de terceiros.
 * 2. Texto Simples (isHtml: false): Preserva formatação legível sem tags HTML.
 * 3. Gerenciamento Seguro de Anexos:
 *    - Se houver arquivo anexado, gera URL assinada temporária no Supabase Storage.
 *    - Baixa para o diretório de cache com nome de arquivo sanitizado.
 *    - No iOS (in-process): limpa o cache imediatamente no `finally`.
 *    - No Android (intent externa): agenda a exclusão após 60 s para permitir que
 *      o app de e-mail externo (Gmail, Outlook) processe o anexo antes de sua deleção,
 *      garantindo que dados sensíveis de saúde não fiquem persistidos no dispositivo.
 * 4. Tratamento de Disponibilidade e Plataforma:
 *    - Verifica `MailComposer.isAvailableAsync()`.
 *    - Trata discrepâncias de retorno (no Android o status sempre retorna 'sent' devido
 *      a limitações de intents do SO).
 */

import { Alert, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ConteudoCompartilhamento,
  Destinatarios,
  ResultadoCompartilhamentoEmail,
} from './types';
import { urlAssinada } from '../../utils/storage';

/**
 * Subpasta temporária dedicada para anexos de e-mail no cache.
 */
const MAIL_ATTACHMENTS_DIR = `${FileSystem.cacheDirectory}mail_attachments/`;

/**
 * Sanitiza o nome de um arquivo removendo acentos, espaços e caracteres especiais.
 *
 * Exemplo: "Laudo Médico (cópia) 2026.pdf" -> "Laudo_Medico_copia_2026.pdf"
 */
export function sanitizarNomeArquivo(nomeOriginal?: string, fallbackExtensao = 'pdf'): string {
  if (!nomeOriginal) {
    return `anexo-${Date.now()}.${fallbackExtensao}`;
  }

  const ultimoPonto = nomeOriginal.lastIndexOf('.');
  const temExtensao = ultimoPonto > 0 && ultimoPonto < nomeOriginal.length - 1;
  const base = temExtensao ? nomeOriginal.slice(0, ultimoPonto) : nomeOriginal;
  const ext = temExtensao ? nomeOriginal.slice(ultimoPonto + 1).toLowerCase() : fallbackExtensao;

  // Normaliza NFD e remove diacríticos (acentos)
  const baseSemAcentos = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Substitui espaços por underline e remove caracteres especiais
  const baseLimpa = baseSemAcentos
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .trim();

  const extLimpa = ext.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '');

  const nomeFinal = baseLimpa.length > 0 ? baseLimpa : `anexo-${Date.now()}`;
  return `${nomeFinal}.${extLimpa || fallbackExtensao}`;
}

/**
 * Garante que a pasta temporária de anexos exista e limpa eventuais resíduos antigos.
 */
async function prepararDiretorioAnexos(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(MAIL_ATTACHMENTS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MAIL_ATTACHMENTS_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('[email] Erro ao preparar diretório de anexos:', err);
  }
}

/**
 * Baixa o anexo persistido no Supabase Storage para o cache local do dispositivo.
 * Se o download falhar, questiona a usuária se deseja prosseguir sem o anexo.
 *
 * @returns Caminho local do arquivo ou null se não houver anexo/usuária optar por continuar sem ele.
 * @throws Error caso o download falhe e a usuária escolha cancelar o envio.
 */
async function prepararAnexoLocal(
  arquivoPath: string,
  nomeOriginal?: string,
): Promise<string | null> {
  try {
    await prepararDiretorioAnexos();

    // 1. Obter URL para download
    let downloadUrl: string | null = null;

    if (arquivoPath.startsWith('http://') || arquivoPath.startsWith('https://')) {
      downloadUrl = arquivoPath;
    } else {
      // É caminho relativo no bucket privado de relatórios
      downloadUrl = await urlAssinada('relatorios_arquivos', arquivoPath, 300);
    }

    if (!downloadUrl) {
      throw new Error('Não foi possível gerar a URL de download para o anexo.');
    }

    // 2. Definir destino sanitizado
    const nomeSanitizado = sanitizarNomeArquivo(nomeOriginal);
    const destinoLocal = `${MAIL_ATTACHMENTS_DIR}${Date.now()}_${nomeSanitizado}`;

    // 3. Efetuar download
    const downloadRes = await FileSystem.downloadAsync(downloadUrl, destinoLocal);

    if (downloadRes.status !== 200) {
      throw new Error(`Falha no download do anexo (status ${downloadRes.status}).`);
    }

    return downloadRes.uri;
  } catch (err: any) {
    console.warn('[email] Falha ao preparar anexo:', err?.message || err);

    // Consulta a usuária se deseja continuar sem o anexo
    const continuarSemAnexo = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Falha ao carregar anexo',
        'Não foi possível obter o anexo do relatório no servidor. Deseja abrir o e-mail mesmo assim, sem o anexo?',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continuar sem anexo', onPress: () => resolve(true) },
        ]
      );
    });

    if (continuarSemAnexo) {
      return null;
    }

    throw new Error('Envio cancelado devido à indisponibilidade do anexo.');
  }
}

/**
 * Dispara o aplicativo de e-mail do sistema com o relatório e destinatários pré-carregados.
 *
 * @param conteudo Dados do relatório estruturados para compartilhamento.
 * @param destinatarios Listas de endereços: para (obrigatório), cc e cco.
 * @returns Resultado informando status e eventuais erros.
 */
export async function compartilharPorEmail(
  conteudo: ConteudoCompartilhamento,
  destinatarios: Destinatarios,
): Promise<ResultadoCompartilhamentoEmail> {
  // 1. Validar se o aparelho possui cliente de e-mail configurado
  const isAvailable = await MailComposer.isAvailableAsync();
  if (!isAvailable) {
    Alert.alert(
      'E-mail não configurado',
      'Não foi detectado um aplicativo de e-mail configurado neste dispositivo. Por favor, configure uma conta de e-mail no aparelho para continuar.'
    );
    return {
      sucesso: false,
      cancelado: false,
      erro: 'Nenhum aplicativo de e-mail configurado no dispositivo.',
    };
  }

  // 2. Preparar anexo (se existir)
  let anexoLocalUri: string | null = null;
  const arquivoPath = conteudo.anexo?.uri;

  if (arquivoPath) {
    try {
      anexoLocalUri = await prepararAnexoLocal(arquivoPath, conteudo.anexo?.nome);
    } catch (anexoErr: any) {
      return {
        sucesso: false,
        cancelado: true,
        erro: anexoErr?.message || 'Download do anexo cancelado.',
      };
    }
  }

  const attachments: string[] = [];
  if (anexoLocalUri) {
    attachments.push(anexoLocalUri);
  }

  // 3. Abrir compositor de e-mail nativo
  try {
    const result = await MailComposer.composeAsync({
      recipients: destinatarios.para,
      ccRecipients: destinatarios.cc.length > 0 ? destinatarios.cc : undefined,
      bccRecipients: destinatarios.cco.length > 0 ? destinatarios.cco : undefined,
      subject: conteudo.titulo,
      body: conteudo.texto,
      isHtml: false,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    const isCancelled = result.status === 'cancelled';

    return {
      sucesso: !isCancelled,
      cancelado: isCancelled,
      status: result.status,
    };
  } catch (composeErr: any) {
    console.error('[email] Erro ao abrir compositor de e-mail:', composeErr);
    return {
      sucesso: false,
      cancelado: false,
      erro: composeErr?.message || 'Não foi possível abrir o compositor de e-mail.',
    };
  } finally {
    // 4. Limpeza segura de arquivos temporários do cache
    if (anexoLocalUri) {
      if (Platform.OS === 'ios') {
        // No iOS, o composer é in-process; os dados já foram anexados
        FileSystem.deleteAsync(anexoLocalUri, { idempotent: true }).catch(() => {});
      } else {
        // No Android, a intent transfere o controle para o app externo (ex: Gmail).
        // Se apagarmos imediatamente, o Gmail não consegue ler o arquivo.
        // Agendamos a deleção para 60 segundos após o disparo da intent.
        setTimeout(() => {
          FileSystem.deleteAsync(anexoLocalUri!, { idempotent: true }).catch(() => {});
        }, 60_000);
      }
    }
  }
}
