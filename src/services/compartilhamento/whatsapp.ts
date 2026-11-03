/**
 * src/services/compartilhamento/whatsapp.ts
 *
 * Módulo de envio de relatórios via compartilhamento do sistema com foco em WhatsApp.
 *
 * ESCOLHA DE IMPLEMENTAÇÃO: `Share.share` do React Native vs `Linking.openURL`
 * ---------------------------------------------------------------------------
 * Optou-se por utilizar o `Share.share` nativo do React Native pelos seguintes motivos:
 * 1. Limite de URL: A abordagem via deep link (`https://wa.me/?text=...` com `encodeURIComponent`)
 *    está sujeita aos limites de comprimento de URI impostos pelo sistema operacional e navegadores,
 *    o que pode truncar ou quebrar textos longos.
 * 2. Formatação e Quebras de Linha: `Share.share` transmite o texto em memória sem depender de codificação
 *    em query string, preservando caracteres especiais e quebras de linha com total fidelidade.
 * 3. Flexibilidade: Permite ao usuário escolher o WhatsApp regular, WhatsApp Business, grupos ou conversas
 *    recentes diretamente na folha nativa de compartilhamento.
 * 4. Cancelamento limpo: Permite identificar o cancelamento sem abrir abas residuais no navegador.
 */

import { Share, Platform } from 'react-native';
import { ConteudoCompartilhamento } from './types';

export interface ResultadoCompartilhamento {
  sucesso: boolean;
  cancelado: boolean;
  erro?: string;
}

/**
 * Abre a folha de compartilhamento do sistema com o conteúdo formatado do caso.
 *
 * @param conteudo Objeto contendo o texto estruturado e metadados.
 * @returns Resultado informando se foi concluído, cancelado ou se houve erro.
 */
export async function compartilharPorWhatsApp(
  conteudo: ConteudoCompartilhamento,
): Promise<ResultadoCompartilhamento> {
  // =========================================================================
  // TODO (Plano B - Evolução Futura: PDF + Anexo):
  // -------------------------------------------------------------------------
  // Quando evoluirmos para o envio de arquivo em vez de texto puro:
  // 1. Gerar documento PDF a partir do relatório + comentário usando `expo-print`:
  //    const { uri: pdfUri } = await Print.printToFileAsync({ html: gerarHtml(conteudo) });
  // 2. Compartilhar o arquivo PDF e o anexo original (se presente em `conteudo.anexo`):
  //    - No Expo SDK 58, `expo-sharing` (`Sharing.shareAsync(uri)`) compartilha um arquivo por vez.
  //    - Se necessário enviar ambos, avaliar concatenar os anexos no próprio PDF gerado
  //      ou compartilhar o PDF principal contendo o laudo anexado incorporado.
  // =========================================================================

  try {
    const shareContent = {
      message: conteudo.texto,
      title: conteudo.titulo,
    };

    const result = await Share.share(shareContent, {
      dialogTitle: 'Compartilhar relatório do paciente',
      subject: conteudo.titulo,
    });

    if (result.action === Share.sharedAction) {
      // Compartilhado com sucesso (ou entregue ao app escolhido)
      return { sucesso: true, cancelado: false };
    } else if (result.action === Share.dismissedAction) {
      // Usuário cancelou ou fechou a folha (comum no iOS)
      return { sucesso: false, cancelado: true };
    }

    return { sucesso: true, cancelado: false };
  } catch (err: any) {
    // Trata cancelamento como situação normal caso a plataforma retorne como erro de cancelamento
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('dismissed') || msg.includes('cancel')) {
      return { sucesso: false, cancelado: true };
    }

    return {
      sucesso: false,
      cancelado: false,
      erro: err?.message || 'Não foi possível abrir o compartilhamento do sistema.',
    };
  }
}
