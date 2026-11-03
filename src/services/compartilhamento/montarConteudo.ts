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
 * Formata a identificação do paciente/caso de forma anonimizada.
 * Por padrão de privacidade, utiliza estritamente o prontuário e/ou número do caso,
 * sem incluir nomes ou iniciais.
 *
 * Facilmente customizável caso a regra de identificação mude no futuro.
 */
export function formatarIdentificacaoPaciente(
  prontuario?: string,
  numeroRelatorio?: number | string,
): string {
  const partes: string[] = [];

  if (numeroRelatorio !== undefined && numeroRelatorio !== '') {
    partes.push(`Caso / Relatório: #${numeroRelatorio}`);
  }

  if (prontuario && prontuario.trim()) {
    partes.push(`Prontuário: ${prontuario.trim()}`);
  }

  return partes.length > 0 ? partes.join(' | ') : 'Caso não identificado';
}

/**
 * Verifica se a quantidade de caracteres ultrapassa o limiar de legibilidade.
 */
export function isTextoExtenso(texto: string, limite = LIMITE_AVISO_TEXTO): boolean {
  return texto.length > limite;
}

/**
 * Monta o objeto de conteúdo formatado para compartilhamento.
 *
 * Utiliza marcação simples compatível com WhatsApp (*negrito*) de forma moderada,
 * garantindo blocos legíveis e organizados com linhas em branco.
 */
export function montarConteudoCompartilhamento(
  caso: DadosCasoCompartilhamento,
): ConteudoCompartilhamento {
  const numero = caso.numeroRelatorio ? ` ${caso.numeroRelatorio}` : '';
  const titulo = `Relatório de Evolução${numero}`;
  const identificacao = formatarIdentificacaoPaciente(caso.prontuario, caso.numeroRelatorio);

  const blocos: string[] = [];

  // Cabeçalho do caso
  blocos.push(`*${titulo}*`);
  blocos.push(`*Identificação:* ${identificacao}`);

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
