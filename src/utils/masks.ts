export const formatCPF = (text: string) => {
  let cleaned = text.replace(/\D/g, '');
  cleaned = cleaned.slice(0, 11); // Limit to 11 digits

  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})$/);
  
  if (!match) return cleaned;
  
  let formatted = match[1];
  if (match[2]) formatted += `.${match[2]}`;
  if (match[3]) formatted += `.${match[3]}`;
  if (match[4]) formatted += `-${match[4]}`;
  
  return formatted;
};

export const formatDate = (text: string) => {
  let cleaned = text.replace(/\D/g, '');
  cleaned = cleaned.slice(0, 8); // Limit to 8 digits
  
  const match = cleaned.match(/^(\d{0,2})(\d{0,2})(\d{0,4})$/);
  
  if (!match) return cleaned;
  
  let formatted = match[1];
  if (match[2]) formatted += `/${match[2]}`;
  if (match[3]) formatted += `/${match[3]}`;
  
  return formatted;
};

export const formatPhone = (text?: string) => {
  if (!text) return '';
  let cleaned = text.replace(/\D/g, '');
  if (!cleaned) return '';
  
  // Se o usuário colou ou digitou os 11 dígitos do Brasil sem o DDI 55
  if (cleaned.length === 11 && !cleaned.startsWith('55') && cleaned[2] === '9') {
    cleaned = '55' + cleaned;
  }
  
  cleaned = cleaned.slice(0, 13); // Limite de 13 dígitos (+55 + DDD + 9 + 8 dígitos)

  let formatted = `+${cleaned.slice(0, 2)}`;
  if (cleaned.length > 2) {
    formatted += ` (${cleaned.slice(2, 4)}`;
  }
  if (cleaned.length > 4) {
    formatted += `) ${cleaned.slice(4, 9)}`;
  }
  if (cleaned.length > 9) {
    formatted += `-${cleaned.slice(9, 13)}`;
  }
  return formatted;
};

