import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { Patient, Report } from '../types';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { uploadFileToBucket, getContentType } from '../utils/uploadFile';

interface AppContextData {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  patients: Patient[];
  addPatient: (patient: Omit<Patient, 'id' | 'reports'>) => Promise<boolean>;
  addReport: (report: Omit<Report, 'id'>) => Promise<boolean>;
  fetchPatients: () => Promise<void>;
  isLoading: boolean;
}

const AppContext = createContext<AppContextData>({} as AppContextData);

// Monta uma mensagem de erro detalhada a partir de respostas do Supabase
const buildErrorMessage = (error: any): string => {
  if (!error) return 'Erro desconhecido.';

  const parts: string[] = [];

  if (error.message) parts.push(`Mensagem: ${error.message}`);
  if (error.code)    parts.push(`Código: ${error.code}`);
  if (error.details) parts.push(`Detalhes: ${error.details}`);
  if (error.hint)    parts.push(`Dica: ${error.hint}`);
  if (error.status)  parts.push(`HTTP Status: ${error.status}`);

  return parts.length > 0 ? parts.join('\n') : JSON.stringify(error);
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const { data: pacientesData, error: pacientesError } = await supabase
        .from('pacientes')
        .select('*');

      if (pacientesError) {
        const msg = buildErrorMessage(pacientesError);
        console.error('[fetchPatients] Erro ao buscar pacientes:\n', msg);
        Alert.alert('Erro ao carregar pacientes', msg);
        return;
      }

      const { data: relatoriosData, error: relatoriosError } = await supabase
        .from('relatorios')
        .select('*');

      if (relatoriosError) {
        const msg = buildErrorMessage(relatoriosError);
        console.error('[fetchPatients] Erro ao buscar relatórios:\n', msg);
        Alert.alert('Erro ao carregar relatórios', msg);
        return;
      }

      const pacientesFormatados: Patient[] = (pacientesData || []).map(p => ({
        ...p,
        reports: (relatoriosData || []).filter(r => r.paciente_id === p.id),
      }));

      setPatients(pacientesFormatados);
    } catch (error: any) {
      const msg = buildErrorMessage(error);
      console.error('[fetchPatients] Exceção inesperada:\n', msg);
      Alert.alert('Erro inesperado ao carregar dados', msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const addPatient = async (patient: Omit<Patient, 'id' | 'reports'>): Promise<boolean> => {
    try {
      // Converte data DD/MM/AAAA → YYYY-MM-DD para o Supabase
      let formattedNascimento = patient.nascimento;
      if (formattedNascimento.includes('/')) {
        const [day, month, year] = formattedNascimento.split('/');
        if (day && month && year) {
          formattedNascimento = `${year}-${month}-${day}`;
        }
      }

      let finalPhotoPath: string | undefined = patient.foto_perfil_path;

      // Upload da foto usando expo-file-system + base64-arraybuffer
      if (finalPhotoPath && (finalPhotoPath.startsWith('file://') || finalPhotoPath.startsWith('content://'))) {
        try {
          const extension = finalPhotoPath.split('.').pop()?.toLowerCase() ?? 'jpg';
          const contentType = getContentType(finalPhotoPath);
          const fileName = `${patient.prontuario}.${extension}`;

          console.log('[addPatient] Iniciando upload da foto:', fileName);

          const { path: fotoPath, publicUrl } = await uploadFileToBucket(
            finalPhotoPath,
            'pacientes_fotos',
            fileName,
            contentType
          );

          console.log('[addPatient] Upload de foto bem-sucedido. Path:', fotoPath);
          finalPhotoPath = fotoPath; // salva o path do storage, não a URL pública
        } catch (uploadErr: any) {
          const msg = buildErrorMessage(uploadErr);
          console.error('[addPatient] Erro no upload da foto:\n', msg);
          // Não bloqueia o cadastro — continua sem foto
          finalPhotoPath = undefined;
        }
      }

      const payload = {
        ...patient,
        nascimento: formattedNascimento,
        foto_perfil_path: finalPhotoPath,
      };

      console.log('[addPatient] Payload enviado ao Supabase:', JSON.stringify(payload, null, 2));

      const { data, error } = await supabase
        .from('pacientes')
        .insert(payload)
        .select()
        .single();

      if (error) {
        const msg = buildErrorMessage(error);
        console.error('[addPatient] Erro ao inserir paciente:\n', msg);
        Alert.alert('Erro ao salvar paciente', msg);
        return false;
      }

      if (data) {
        setPatients((prev) => [...prev, { ...data, reports: [] }]);
        return true;
      }

      Alert.alert('Atenção', 'Nenhum dado retornado pelo Supabase após a inserção do paciente.');
      return false;
    } catch (error: any) {
      const msg = buildErrorMessage(error);
      console.error('[addPatient] Exceção inesperada:\n', msg);
      Alert.alert('Erro inesperado ao salvar paciente', msg);
      return false;
    }
  };

  const addReport = async (report: Omit<Report, 'id'>): Promise<boolean> => {
    try {
      let finalFilePath: string | undefined = report.arquivo_path;

      // Upload do arquivo usando expo-file-system + base64-arraybuffer
      if (finalFilePath && (finalFilePath.startsWith('file://') || finalFilePath.startsWith('content://'))) {
        try {
          const extension = finalFilePath.split('.').pop()?.toLowerCase() ?? 'pdf';
          const contentType = getContentType(finalFilePath);
          const fileName = `${Date.now()}-${report.arquivo_nome ?? `arquivo.${extension}`}`;

          console.log('[addReport] Iniciando upload do arquivo:', fileName);

          const { path: arquivoPath } = await uploadFileToBucket(
            finalFilePath,
            'relatorios_arquivos',
            fileName,
            contentType
          );

          console.log('[addReport] Upload de arquivo bem-sucedido. Path:', arquivoPath);
          finalFilePath = arquivoPath;
        } catch (uploadErr: any) {
          const msg = buildErrorMessage(uploadErr);
          console.error('[addReport] Erro no upload do arquivo:\n', msg);
          Alert.alert('Erro ao enviar arquivo', msg);
          return false; // não insere sem arquivo, já que a coluna é obrigatória
        }
      }

      const payload = {
        ...report,
        arquivo_path: finalFilePath,
      };

      console.log('[addReport] Payload enviado ao Supabase:', JSON.stringify(payload, null, 2));

      const { data, error } = await supabase
        .from('relatorios')
        .insert(payload)
        .select()
        .single();

      if (error) {
        const msg = buildErrorMessage(error);
        console.error('[addReport] Erro ao inserir relatório:\n', msg);
        Alert.alert('Erro ao salvar relatório', msg);
        return false;
      }

      if (data) {
        setPatients((prev) =>
          prev.map((p) =>
            p.id === report.paciente_id ? { ...p, reports: [...p.reports, data] } : p
          )
        );
        return true;
      }

      Alert.alert('Atenção', 'Nenhum dado retornado pelo Supabase após a inserção do relatório.');
      return false;
    } catch (error: any) {
      const msg = buildErrorMessage(error);
      console.error('[addReport] Exceção inesperada:\n', msg);
      Alert.alert('Erro inesperado ao salvar relatório', msg);
      return false;
    }
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, patients, addPatient, addReport, fetchPatients, isLoading }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
