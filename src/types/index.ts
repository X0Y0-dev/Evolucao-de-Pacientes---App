export type Gender = 'Masculino' | 'Feminino' | 'Não-binário' | 'Indefinido' | 'Outros';

export interface Patient {
  id: string; // UUID from Supabase
  nome_civil: string;
  nome_social?: string;
  cpf: string;
  sexo?: Gender;
  nascimento: string;
  telefone: string;
  email: string;
  foto_perfil_path?: string;
  prontuario: string;
  criado_em?: string;
  created_at?: string;
  atualizado_em?: string;
  
  // Local state for UI only
  reports: Report[];
}

export type ReportStatus = 'Em Andamento' | 'Finalizado';

export interface Report {
  id: string; // UUID from Supabase
  paciente_id: string;
  transcricao: string;
  comentario?: string;
  arquivo_path?: string;
  arquivo_nome?: string;
  arquivo_tipo?: string;
  arquivo_tamanho?: number;
  status: ReportStatus;
  criado_em: string;
  atualizado_em?: string;
}

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  PatientForm: { patientId?: string } | undefined;
  ReportForm: { patientId: string; reportId?: string };
};
