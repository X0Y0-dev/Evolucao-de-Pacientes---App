import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ReportStatus } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { getPatientPhotoUrl } from '../utils/uploadFile';
import { supabase } from '../lib/supabase';
import { validateEmail } from '../utils/validators';

interface RecipientItem {
  id: string;
  mailto: string;
  error?: string;
  status?: 'idle' | 'sending' | 'success' | 'error';
  errorMessage?: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'ReportForm'>;

export default function ReportForm({ route }: Props) {
  const { patientId, reportId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, patients, addReport, updateReport } = useAppContext();
  const isDark = theme === 'dark';

  const patient = patients.find(p => p.id === patientId);
  const existingReport = reportId
    ? patient?.reports.find(r => r.id === reportId)
    : undefined;

  const [reportStatus, setReportStatus] = useState<ReportStatus>(existingReport?.status ?? 'Em Andamento');
  const [fileUri, setFileUri] = useState<string | undefined>(existingReport?.arquivo_path);
  const [fileName, setFileName] = useState<string | undefined>(existingReport?.arquivo_nome);
  const [fileType, setFileType] = useState<string | undefined>(existingReport?.arquivo_tipo);
  const [fileSize, setFileSize] = useState<number | undefined>(existingReport?.arquivo_tamanho);
  const [relatorio, setRelatorio] = useState(existingReport?.transcricao ?? '');
  const [comentarios, setComentarios] = useState(existingReport?.comentario ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  // Estados para o modal de compartilhamento por e-mail
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [recipients, setRecipients] = useState<RecipientItem[]>([{ id: '1', mailto: '' }]);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Se o relatório mudar (ex: navegação de outro relatório), recarrega os dados
  useEffect(() => {
    if (existingReport) {
      setReportStatus(existingReport.status);
      setFileUri(existingReport.arquivo_path);
      setFileName(existingReport.arquivo_nome);
      setFileType(existingReport.arquivo_tipo);
      setFileSize(existingReport.arquivo_tamanho);
      setRelatorio(existingReport.transcricao ?? '');
      setComentarios(existingReport.comentario ?? '');
    }
  }, [reportId]);

  const isFinalizado = reportStatus === 'Finalizado';

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#c9d4db',
    blueBtn: '#1d70b8',
    whatsappBtn: '#25D366',
    saveBtn: '#1d70b8',
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        setFileUri(asset.uri);
        setFileName(asset.fileName ?? `imagem-${Date.now()}.jpg`);
        setFileType(asset.mimeType ?? 'image/jpeg');
        setFileSize(asset.fileSize);
      }
    } catch (err) {
      console.log('Error picking image', err);
    }
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setFileUri(asset.uri);
        setFileName(asset.name);
        setFileType(asset.mimeType);
        setFileSize(asset.size);
      }
    } catch (err) {
      console.log('Error picking document', err);
    }
  };

  const handlePickFile = () => {
    if (isFinalizado) return;
    Alert.alert(
      'Upload de arquivos',
      'Escolha o tipo de arquivo que deseja anexar:',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Foto / Imagem', onPress: pickImage },
        { text: 'Documento (PDF)', onPress: pickPdf },
      ]
    );
  };

  const transcrever = () => {
    if (fileUri) {
      setRelatorio(relatorio + '\n[Transcrição do arquivo simulada...]');
    } else {
      Alert.alert('Aviso', 'Nenhum arquivo anexado para transcrever.');
    }
  };

  const handleSave = async (targetStatus: ReportStatus) => {
    if (!relatorio.trim()) {
      Alert.alert('Erro', 'O campo de relatório é obrigatório.');
      return;
    }

    setIsSaving(true);
    let success = false;

    if (reportId) {
      // Atualiza relatório existente
      success = await updateReport(reportId, {
        transcricao: relatorio,
        comentario: comentarios,
        arquivo_path: fileUri,
        arquivo_nome: fileName,
        arquivo_tipo: fileType,
        arquivo_tamanho: fileSize,
        status: targetStatus,
      });
    } else {
      // Cria novo relatório
      success = await addReport({
        paciente_id: patientId,
        transcricao: relatorio,
        comentario: comentarios,
        arquivo_path: fileUri,
        arquivo_nome: fileName,
        arquivo_tipo: fileType,
        arquivo_tamanho: fileSize,
        status: targetStatus,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });
    }

    setIsSaving(false);

    if (success) {
      navigation.goBack();
    }
  };

  const handleOpenEmailModal = () => {
    if (!reportId) {
      Alert.alert(
        'Salvar relatório',
        'Para compartilhar este relatório por e-mail, é necessário salvá-lo primeiro para que a versão persistida no sistema seja enviada.'
      );
      return;
    }
    setRecipients([{ id: Date.now().toString(), mailto: '' }]);
    setEmailModalVisible(true);
  };

  const handleAddRecipient = () => {
    setRecipients(prev => [...prev, { id: `${Date.now()}-${prev.length}`, mailto: '' }]);
  };

  const handleRemoveRecipient = (id: string) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const handleRecipientChange = (id: string, text: string) => {
    setRecipients(prev =>
      prev.map(r => (r.id === id ? { ...r, mailto: text.toLowerCase(), error: undefined, status: 'idle' } : r))
    );
  };

  const handleSendEmails = async () => {
    if (!reportId) return;

    // 1. Validar todos os campos antes de iniciar o envio
    let hasErrors = false;
    const validatedRecipients = recipients.map((r, index) => {
      const mailto = r.mailto.trim().toLowerCase();
      const validation = validateEmail(mailto);
      if (!validation.isValid) {
        hasErrors = true;
        return {
          ...r,
          mailto,
          error: `Campo ${index + 1}: ${validation.error || 'E-mail inválido'}`,
        };
      }
      return { ...r, mailto, error: undefined };
    });

    setRecipients(validatedRecipients);

    if (hasErrors) {
      Alert.alert(
        'Destinatários inválidos',
        'Por favor, corrija os endereços de e-mail destacados antes de prosseguir com o envio.'
      );
      return;
    }

    // 2. Iniciar envio individual para cada destinatário
    setIsSendingEmail(true);

    const results: Array<{ mailto: string; success: boolean; error?: string }> = [];

    for (let i = 0; i < validatedRecipients.length; i++) {
      const item = validatedRecipients[i];
      const mailto = item.mailto;

      setRecipients(prev =>
        prev.map(r => (r.id === item.id ? { ...r, status: 'sending', error: undefined } : r))
      );

      try {
        const SUPABASE_URL =
          process.env.EXPO_PUBLIC_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          'https://nrrprjfnsutsmrdzivka.supabase.co';

        console.log("Projeto Supabase:", SUPABASE_URL);
        console.log("Tentando chamar resend-email...");

        const { data, error } = await supabase.functions.invoke(
          "resend-email",
          {
            body: {
              to: mailto,
              subject: "Teste de envio",
              html: "<h1>Teste</h1>",
            },
          },
        );

        if (error) {
          console.error("Erro da Edge Function:", error);

          if (error.context instanceof Response) {
            console.error("Status HTTP:", error.context.status);
            console.error(
              "Resposta HTTP:",
              await error.context.clone().text(),
            );
          }

          const errMsg = error.message || 'Falha na comunicação com o servidor de e-mail.';
          results.push({ mailto, success: false, error: errMsg });
          setRecipients(prev =>
            prev.map(r => (r.id === item.id ? { ...r, status: 'error', errorMessage: errMsg } : r))
          );
        } else {
          console.log("Resposta:", data);
          results.push({ mailto, success: true });
          setRecipients(prev =>
            prev.map(r => (r.id === item.id ? { ...r, status: 'success' } : r))
          );
        }
      } catch (invokeErr: any) {
        console.error(`Exceção ao solicitar envio para ${mailto}:`, invokeErr);
        const errMsg = invokeErr?.message || 'Erro inesperado no envio.';
        results.push({ mailto, success: false, error: errMsg });
        setRecipients(prev =>
          prev.map(r => (r.id === item.id ? { ...r, status: 'error', errorMessage: errMsg } : r))
        );
      }
    }

    setIsSendingEmail(false);

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    if (failures.length === 0) {
      Alert.alert(
        'Envio concluído',
        `O relatório foi enviado com sucesso para ${successes.length} ${successes.length === 1 ? 'destinatário' : 'destinatários'}.`,
        [
          {
            text: 'OK',
            onPress: () => setEmailModalVisible(false),
          },
        ]
      );
    } else if (successes.length === 0) {
      Alert.alert(
        'Falha no envio',
        `Não foi possível enviar o e-mail para os destinatários solicitados.\n\nMotivo: ${failures[0]?.error || 'Erro no serviço de e-mail'}`
      );
    } else {
      Alert.alert(
        'Envio com pendências',
        `O relatório foi enviado com sucesso para ${successes.length} destinatário(s), mas falhou para ${failures.length} destinatário(s).\n\nVerifique os campos destacados e tente novamente.`
      );
    }
  };

  const handleReopen = async () => {
    if (!reportId) return;

    setIsSaving(true);
    const success = await updateReport(reportId, {
      status: 'Em Andamento',
    });
    setIsSaving(false);

    if (success) {
      setReportStatus('Em Andamento');
      Alert.alert('Relatório reaberto', 'O status mudou para "Em Andamento" e agora você pode editá-lo.');
    }
  };

  if (!patient) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <Header showBack />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        <View style={styles.patientHeader}>
          {getPatientPhotoUrl(patient.foto_perfil_path) && !photoError ? (
            <Image
              source={{ uri: getPatientPhotoUrl(patient.foto_perfil_path) }}
              style={styles.photo}
              onError={() => {
                setPhotoError(true);
                Alert.alert(
                  'Erro ao carregar foto',
                  `Não foi possível exibir a foto do paciente "${patient.nome_civil}". Exibindo imagem padrão.`
                );
              }}
            />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Feather name="image" size={40} color={isDark ? '#aaa' : '#555'} />
            </View>
          )}
          <Text style={[styles.patientName, { color: colors.text }]}>{patient.nome_civil}</Text>
          <Text style={[styles.patientId, { color: colors.text }]}>Nº prontuário: {patient.prontuario}</Text>

          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: isDark ? '#4a4a4a' : '#ccc', opacity: isFinalizado ? 0.6 : 1 }]}
            onPress={handlePickFile}
            disabled={isFinalizado}
          >
            <Text style={[styles.uploadText, { color: colors.text }]}>
              {fileName ? fileName : 'Upload de arquivos'}
            </Text>
            <Feather name="upload" size={16} color={colors.text} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Relatório:</Text>

        <View style={[styles.textAreaContainer, { backgroundColor: colors.inputBg }]}>
          <TextInput
            style={[styles.textArea, { color: colors.text }]}
            placeholder="Comece a digitar..."
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            multiline
            value={relatorio}
            onChangeText={setRelatorio}
            editable={!isFinalizado}
          />
          {!isFinalizado && (
            <TouchableOpacity style={styles.transcribeBtn} onPress={transcrever}>
              <Text style={styles.transcribeText}>Transcrever arquivo</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Comentários:</Text>
        <TextInput
          style={[styles.commentArea, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Comece a digitar..."
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          multiline
          value={comentarios}
          onChangeText={setComentarios}
          editable={!isFinalizado}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Compartilhar:</Text>
        <View style={styles.shareRow}>
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: colors.whatsappBtn }]}>
            <Text style={[styles.shareText, { color: '#fff' }]}>WhatsApp</Text>
            <FontAwesome name="whatsapp" size={18} color="#fff" style={{ marginLeft: 5 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: isDark ? '#444' : '#eee', borderColor: '#d9534f', borderWidth: 1 }]}
            onPress={handleOpenEmailModal}
          >
            <Text style={[styles.shareText, { color: colors.text }]}>E-mail</Text>
            <Feather name="mail" size={18} color={colors.text} style={{ marginLeft: 5 }} />
          </TouchableOpacity>
        </View>

        {/* Botões de ação */}
        {isFinalizado ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isSaving ? '#888' : colors.blueBtn, flex: 1 }]}
              onPress={handleReopen}
              disabled={isSaving}
            >
              <Text style={styles.actionBtnText}>
                {isSaving ? 'Reabrindo...' : 'Reabrir relatório'}
              </Text>
              <Feather name="rotate-ccw" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isSaving ? '#888' : colors.blueBtn, flex: 1, marginRight: 10 }]}
              onPress={() => handleSave('Em Andamento')}
              disabled={isSaving}
            >
              <Text style={styles.actionBtnText}>{isSaving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isSaving ? '#888' : '#d9534f', flex: 1 }]}
              onPress={() => handleSave('Finalizado')}
              disabled={isSaving}
            >
              <Text style={styles.actionBtnText}>{isSaving ? 'Finalizando...' : 'Finalizar'}</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Modal de Compartilhamento por E-mail */}
      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSendingEmail) setEmailModalVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboardContainer}
          >
            <View style={[styles.modalCard, { backgroundColor: isDark ? '#232b2f' : '#ffffff' }]}>
              {/* Header do Modal */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Compartilhar por E-mail
                </Text>
                <TouchableOpacity
                  onPress={() => setEmailModalVisible(false)}
                  disabled={isSendingEmail}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalInstructions, { color: isDark ? '#ddd' : '#333' }]}>
                Digite o endereço de email do destinatário:
              </Text>

              <ScrollView style={styles.recipientsScrollView} keyboardShouldPersistTaps="handled">
                {recipients.map((item, index) => (
                  <View key={item.id} style={styles.recipientBlock}>
                    <View style={styles.recipientInputRow}>
                      <TextInput
                        style={[
                          styles.recipientInput,
                          {
                            backgroundColor: colors.inputBg,
                            color: colors.text,
                            borderColor: item.error ? '#d9534f' : 'transparent',
                            borderWidth: item.error ? 1 : 0,
                          },
                        ]}
                        placeholder="destinatario@exemplo.com"
                        placeholderTextColor={isDark ? '#aaa' : '#666'}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        value={item.mailto}
                        editable={!isSendingEmail}
                        onChangeText={(t) => handleRecipientChange(item.id, t)}
                      />

                      {recipients.length > 1 && (
                        <TouchableOpacity
                          style={[styles.removeRecipientBtn, { opacity: isSendingEmail ? 0.4 : 1 }]}
                          onPress={() => handleRemoveRecipient(item.id)}
                          disabled={isSendingEmail}
                        >
                          <Feather name="trash-2" size={18} color="#d9534f" />
                        </TouchableOpacity>
                      )}

                      {item.status === 'sending' && (
                        <ActivityIndicator size="small" color="#1d70b8" style={{ marginLeft: 8 }} />
                      )}
                      {item.status === 'success' && (
                        <Feather name="check-circle" size={20} color="#25D366" style={{ marginLeft: 8 }} />
                      )}
                      {item.status === 'error' && (
                        <Feather name="alert-circle" size={20} color="#d9534f" style={{ marginLeft: 8 }} />
                      )}
                    </View>

                    {item.error ? (
                      <Text style={styles.recipientErrorText}>{item.error}</Text>
                    ) : item.errorMessage ? (
                      <Text style={styles.recipientErrorText}>{item.errorMessage}</Text>
                    ) : null}
                  </View>
                ))}

                {/* Botão + Adicionar novo e-mail */}
                <TouchableOpacity
                  style={[styles.addEmailBtn, { borderColor: colors.blueBtn, opacity: isSendingEmail ? 0.5 : 1 }]}
                  onPress={handleAddRecipient}
                  disabled={isSendingEmail}
                >
                  <Text style={[styles.addEmailBtnText, { color: colors.blueBtn }]}>
                    + Adicionar novo e-mail
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.savedReportNotice, { color: isDark ? '#aaa' : '#777' }]}>
                  * O e-mail enviará a versão persistida deste relatório salva no sistema.
                </Text>
              </ScrollView>

              {/* Botões do Rodapé do Modal */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: isDark ? '#555' : '#ccc' }]}
                  onPress={() => setEmailModalVisible(false)}
                  disabled={isSendingEmail}
                >
                  <Text style={[styles.modalCancelBtnText, { color: colors.text }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    { backgroundColor: isSendingEmail ? '#888' : colors.blueBtn },
                  ]}
                  onPress={handleSendEmails}
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.modalConfirmBtnText}>Enviando...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.modalConfirmBtnText}>Confirmar envio</Text>
                      <Feather name="send" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  patientHeader: { alignItems: 'center', marginVertical: 20 },
  photo: { width: 100, height: 100, borderRadius: 50, marginBottom: 10 },
  photoPlaceholder: {
    width: 100, height: 100, borderRadius: 50, marginBottom: 10,
    justifyContent: 'center', alignItems: 'center'
  },
  patientName: { fontSize: 22, fontWeight: 'bold' },
  patientId: { fontSize: 14, opacity: 0.7, marginTop: 5, marginBottom: 15 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20,
  },
  uploadText: { fontSize: 14 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, marginTop: 10 },
  textAreaContainer: {
    borderRadius: 15, padding: 15, minHeight: 150, marginBottom: 15
  },
  textArea: { flex: 1, textAlignVertical: 'top', minHeight: 100 },
  transcribeBtn: {
    backgroundColor: 'rgba(0,0,0,0.1)', alignSelf: 'center',
    paddingVertical: 5, paddingHorizontal: 15, borderRadius: 15, marginTop: 10
  },
  transcribeText: { fontSize: 12, opacity: 0.8 },
  commentArea: {
    borderRadius: 15, padding: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 20
  },
  shareRow: { flexDirection: 'row', marginBottom: 30 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, marginRight: 15
  },
  shareText: { fontSize: 14, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: {
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  // Estilos do Modal de Compartilhamento por E-mail
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalKeyboardContainer: {
    width: '100%',
    maxWidth: 500,
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalInstructions: {
    fontSize: 14,
    marginBottom: 15,
    fontWeight: '500',
  },
  recipientsScrollView: {
    maxHeight: 320,
  },
  recipientBlock: {
    marginBottom: 10,
  },
  recipientInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipientInput: {
    flex: 1,
    height: 45,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  removeRecipientBtn: {
    marginLeft: 8,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipientErrorText: {
    color: '#d9534f',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  addEmailBtn: {
    width: '100%',
    height: 45,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 12,
  },
  addEmailBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  savedReportNotice: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  modalConfirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
