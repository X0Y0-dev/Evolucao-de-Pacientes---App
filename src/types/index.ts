export type Gender = 'Masculino' | 'Feminino' | 'Não-binário' | 'Indefinido' | 'Outros';

export interface Patient {
  id: string; // The generated prontuário (random <= 5 digits)
  nomeCivil: string;
  nomeSocial?: string;
  cpf: string;
  sexo?: Gender;
  nascimento: string;
  telefone: string;
  email: string;
  photoUri?: string;
  reports: Report[];
}

export type ReportStatus = 'Em Andamento' | 'Finalizado';

export interface Report {
  id: string;
  date: string;
  status: ReportStatus;
  fileUri?: string;
  text: string;
  comments?: string;
}

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  PatientForm: undefined;
  ReportForm: { patientId: string };
};
