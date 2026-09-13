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
