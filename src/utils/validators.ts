/**
 * Utilitários de validação compartilhados pela aplicação.
 */

/**
 * Validação de e-mail conforme as regras do aplicativo:
 * - Campo não vazio
 * - Conter o caractere '@'
 * - Terminar em '.com' ou com sigla de país (.br, .fr, .us, etc.)
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail) {
    return {
      isValid: false,
      error: 'O endereço de e-mail não pode estar vazio.',
    };
  }

  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.(com|[a-z]{2})$/;

  if (!cleanEmail.includes('@') || !emailRegex.test(cleanEmail)) {
    return {
      isValid: false,
      error: 'O e-mail deve conter "@" e terminar em ".com" ou com a sigla do país (ex: .br, .fr, .us).',
    };
  }

  return { isValid: true };
}
