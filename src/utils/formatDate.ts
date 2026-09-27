/**
 * Converte uma data no formato DD/MM/AAAA para YYYY-MM-DD (padrão ISO / Supabase).
 * Se a string já estiver no formato ISO (sem '/'), retorna sem alteração.
 */
export function formatDateToISO(date: string): string {
  if (!date.includes('/')) return date;
  const [day, month, year] = date.split('/');
  return day && month && year ? `${year}-${month}-${day}` : date;
}
