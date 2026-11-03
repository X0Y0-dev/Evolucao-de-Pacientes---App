/**
 * src/services/compartilhamento/types.ts
 *
 * Tipos do serviço de compartilhamento de casos/relatórios.
 */

export interface AnexoCompartilhamento {
  uri?: string;
  nome?: string;
  mimeType?: string;
}

export interface ConteudoCompartilhamento {
  titulo: string;
  texto: string;
  /**
   * Preparação para evolução futura (envio de arquivo original ou PDF gerado).
   * Não é transmitido na versão atual (texto puro).
   */
  anexo?: AnexoCompartilhamento;
}

export interface DadosCasoCompartilhamento {
  numeroRelatorio?: number | string;
  prontuario?: string;
  transcricao: string;
  comentario?: string;
  anexo?: AnexoCompartilhamento;
}
