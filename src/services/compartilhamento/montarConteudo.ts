/**
 * src/services/compartilhamento/montarConteudo.ts
 *
 * Função pura responsável por estruturar o conteúdo do caso para compartilhamento.
 * Não conhece detalhes de transporte (WhatsApp, E-mail, etc.).
 */

import {
  ConteudoCompartilhamento,
  DadosCasoCompartilhamento,
} from './types';

/**
 * Limite de caracteres para disparo de aviso de legibilidade na interface.
 * Definido como convenção de usabilidade para evitar mensagens excessivamente
 * longas em uma única mensagem de texto.
 */
export const LIMITE_AVISO_TEXTO = 4000;

/**
 * Formata a identificação do paciente para o compartilhamento.
 * Exibe apenas o número de prontuário, sem nome, para preservar a privacidade do paciente.
 */
export function formatarIdentificacaoPaciente(
  prontuario?: string,
): string {
  if (prontuario && prontuario.trim()) {
    return `Prontuário: ${prontuario.trim()}`;
  }
  return 'Paciente não identificado';
}

/**
 * Verifica se a quantidade de caracteres ultrapassa o limiar de legibilidade.
 */
export function isTextoExtenso(texto: string, limite = LIMITE_AVISO_TEXTO): boolean {
  return texto.length > limite;
}

/**
 * Monta o objeto de conteúdo formatado para compartilhamento via WhatsApp.
 *
 * Utiliza marcação simples compatível com WhatsApp (*negrito*) de forma moderada,
 * garantindo blocos legíveis e organizados com linhas em branco.
 * A identificação do paciente usa exclusivamente o prontuário, sem nome, por privacidade.
 */
export function montarConteudoCompartilhamento(
  caso: DadosCasoCompartilhamento,
): ConteudoCompartilhamento {
  const numero = caso.numeroRelatorio ? ` ${caso.numeroRelatorio}` : '';
  const titulo = `Relatório de Evolução${numero}`;
  const identificacao = formatarIdentificacaoPaciente(caso.prontuario);

  const blocos: string[] = [];

  // Cabeçalho do caso
  blocos.push(`*${titulo}*`);
  blocos.push(`*Paciente:* ${identificacao}`);

  // Seção de Relatório (transcrição)
  const relatorioTexto = caso.transcricao?.trim() || 'Sem conteúdo de relatório.';
  blocos.push(`*Relatório:*\n${relatorioTexto}`);

  // Seção de Comentários (omitida se vazia)
  const comentarioTexto = caso.comentario?.trim();
  if (comentarioTexto) {
    blocos.push(`*Comentários:*\n${comentarioTexto}`);
  }

  const textoFinal = blocos.join('\n\n');

  return {
    titulo,
    texto: textoFinal,
    anexo: caso.anexo,
  };
}

/**
 * Monta o objeto de conteúdo formatado para compartilhamento por e-mail.
 *
 * Características específicas do canal de e-mail:
 * - Corpo em texto simples (isHtml: false), sem formatação de asteriscos.
 * - Assunto: `Relatório de Evolução {n} - {identificação}`.
 * - Identificação: utiliza exclusivamente `formatarIdentificacaoPaciente(caso.prontuario)`
 *   (apenas número do caso/prontuário, sem nome do paciente).
 * - Corpo: relatório (transcrição) e comentário (omitido se vazio).
 */
export function montarConteudoEmail(
  caso: DadosCasoCompartilhamento,
): ConteudoCompartilhamento {
  const numero = caso.numeroRelatorio ? ` ${caso.numeroRelatorio}` : '';
  const identificacao = formatarIdentificacaoPaciente(caso.prontuario);
  const titulo = `Relatório de Evolução${numero} - ${identificacao}`;

  const blocos: string[] = [];

  // Seção de Relatório (transcrição)
  const relatorioTexto = caso.transcricao?.trim() || 'Sem conteúdo de relatório.';
  blocos.push(`Relatório:\n${relatorioTexto}`);

  // Seção de Comentários (omitida se vazia)
  const comentarioTexto = caso.comentario?.trim();
  if (comentarioTexto) {
    blocos.push(`Comentários:\n${comentarioTexto}`);
  }

  const textoFinal = blocos.join('\n\n');

  return {
    titulo,
    texto: textoFinal,
    anexo: caso.anexo,
  };
}

