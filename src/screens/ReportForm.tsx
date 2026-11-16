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
import { urlAssinada } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { validateEmail } from '../utils/validators';
import { extrairTextoDoArquivo, OcrError } from '../utils/ocr';
import {
  montarConteudoCompartilhamento,
  montarConteudoEmail,
  isTextoExtenso,
  LIMITE_AVISO_TEXTO,
} from '../services/compartilhamento/montarConteudo';
import { compartilharPorWhatsApp } from '../services/compartilhamento/whatsapp';
import { compartilharPorEmail } from '../services/compartilhamento/email';
import { Destinatarios } from '../services/compartilhamento/types';

interface EmailRecipientItem {
  id: string;
  email: string;
  error?: string;
}

type RecipientSection = 'para' | 'cc' | 'cco';

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

  const [reportStatus, setReportStatus] = useState<ReportStatus>(
    existingReport?.status === 'Finalizado' || existingReport?.status === 'finalizado'
      ? 'finalizado'
      : 'em_andamento'
  );
  const [fileUri, setFileUri] = useState<string | undefined>(existingReport?.arquivo_path);
  const [fileName, setFileName] = useState<string | undefined>(existingReport?.arquivo_nome);
  const [fileType, setFileType] = useState<string | undefined>(existingReport?.arquivo_tipo);
  const [fileSize, setFileSize] = useState<number | undefined>(existingReport?.arquivo_tamanho);
  const [relatorio, setRelatorio] = useState(existingReport?.transcricao ?? '');
  const [comentarios, setComentarios] = useState(existingReport?.comentario ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => {
    urlAssinada('pacientes_fotos', patient?.foto_perfil_path ?? null).then(setFotoUrl);
  }, [patient?.foto_perfil_path]);

  // Estados para o modal de compartilhamento por e-mail
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [paraRecipients, setParaRecipients] = useState<EmailRecipientItem[]>([{ id: '1', email: '' }]);
  const [ccRecipients, setCcRecipients] = useState<EmailRecipientItem[]>([]);
  const [ccoRecipients, setCcoRecipients] = useState<EmailRecipientItem[]>([]);
  const [isPreparingEmail, setIsPreparingEmail] = useState(false);

  // Se o relatório mudar (ex: navegação de outro relatório), recarrega os dados
  useEffect(() => {
    if (existingReport) {
      setReportStatus(
        existingReport.status === 'Finalizado' || existingReport.status === 'finalizado'
          ? 'finalizado'
          : 'em_andamento'
      );
      setFileUri(existingReport.arquivo_path);
      setFileName(existingReport.arquivo_nome);
      setFileType(existingReport.arquivo_tipo);
      setFileSize(existingReport.arquivo_tamanho);
      setRelatorio(existingReport.transcricao ?? '');
      setComentarios(existingReport.comentario ?? '');
    }
  }, [reportId]);

  const isFinalizado = reportStatus === 'finalizado' || reportStatus === 'Finalizado';

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

  const transcrever = async () => {
    if (!fileUri) {
      Alert.alert('Aviso', 'Nenhum arquivo anexado para transcrever.');
      return;
    }

    const effectiveMime =
      fileType ||
      (fileName?.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : fileName?.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg');

    // Validar tipo antes de enviar
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(effectiveMime.toLowerCase())) {
      Alert.alert(
        'Tipo não suportado',
        'Apenas arquivos PDF, PNG e JPG/JPEG podem ser transcritos.',
      );
      return;
    }

    setIsTranscribing(true);

    try {
      const result = await extrairTextoDoArquivo(fileUri, fileName, effectiveMime);

      if (!result.texto.trim()) {
        Alert.alert(
          'Sem texto',
          'Não foi possível extrair texto do arquivo. Verifique se o documento contém texto legível.',
        );
      } else {
        const separator = relatorio.trim() ? '\n\n' : '';
        setRelatorio(prev => prev + separator + result.texto);
        Alert.alert('Transcrição concluída', 'O texto foi extraído e adicionado ao relatório.');
      }
    } catch (err) {
      const ocrErr = err as OcrError;
      const actions: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }> = [
        { text: 'OK', style: 'cancel' },
      ];

      if (ocrErr.retryable) {
        actions.push({
          text: 'Tentar novamente',
          onPress: () => transcrever(),
        });
      }

      Alert.alert('Erro na transcrição', ocrErr.message || 'Erro desconhecido.', actions);
    } finally {
      setIsTranscribing(false);
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
    setParaRecipients([{ id: Date.now().toString(), email: '' }]);
    setCcRecipients([]);
    setCcoRecipients([]);
    setEmailModalVisible(true);
  };

  const handleShareWhatsApp = () => {
    if (!reportId) {
      Alert.alert(
        'Salvar relatório',
        'Para compartilhar este relatório pelo WhatsApp, é necessário salvá-lo primeiro para que a versão persistida no sistema seja enviada.'
      );
      return;
    }

    const reportIndex = patient?.reports.findIndex(r => r.id === reportId) ?? -1;
    const reportNumber = reportIndex >= 0 ? reportIndex + 1 : undefined;

    const conteudo = montarConteudoCompartilhamento({
      numeroRelatorio: reportNumber,
      prontuario: patient?.prontuario,
      nomeCivil: patient?.nome_civil,
      nomeSocial: patient?.nome_social,
      transcricao: relatorio,
      comentario: comentarios,
      anexo: fileUri
        ? {
            uri: fileUri,
            nome: fileName,
            mimeType: fileType,
          }
        : undefined,
    });

    const executarEnvio = async () => {
      const res = await compartilharPorWhatsApp(conteudo);
      if (!res.sucesso && !res.cancelado && res.erro) {
        Alert.alert(
          'Erro ao compartilhar',
          'Não foi possível abrir o compartilhamento do WhatsApp. Verifique se o aplicativo está instalado e tente novamente.'
        );
      }
    };

    const confirmarEnvio = () => {
      if (isTextoExtenso(conteudo.texto, LIMITE_AVISO_TEXTO)) {
        Alert.alert(
          'Texto extenso',
          `O relatório possui mais de ${LIMITE_AVISO_TEXTO} caracteres. Por questões de legibilidade no WhatsApp, a mensagem pode ficar bastante longa.\n\nDeseja continuar mesmo assim?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Continuar', onPress: executarEnvio },
          ]
        );
      } else {
        executarEnvio();
      }
    };

    Alert.alert(
      'Compartilhar via WhatsApp',
      'O conteúdo será compartilhado pelo WhatsApp. Confirme que não há dados que identifiquem o paciente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: confirmarEnvio },
      ]
    );
  };

  const handleAddRecipient = (section: RecipientSection) => {
    const newItem = { id: `${Date.now()}-${Math.random()}`, email: '' };
    if (section === 'para') {
      setParaRecipients(prev => [...prev, newItem]);
    } else if (section === 'cc') {
      setCcRecipients(prev => [...prev, newItem]);
    } else {
      setCcoRecipients(prev => [...prev, newItem]);
    }
  };

  const handleRemoveRecipient = (section: RecipientSection, id: string) => {
    if (section === 'para') {
      if (paraRecipients.length <= 1) return;
      setParaRecipients(prev => prev.filter(r => r.id !== id));
    } else if (section === 'cc') {
      setCcRecipients(prev => prev.filter(r => r.id !== id));
    } else {
      setCcoRecipients(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleRecipientChange = (section: RecipientSection, id: string, text: string) => {
    const updater = (prev: EmailRecipientItem[]) =>
      prev.map(r => (r.id === id ? { ...r, email: text.toLowerCase(), error: undefined } : r));

    if (section === 'para') {
      setParaRecipients(updater);
    } else if (section === 'cc') {
      setCcRecipients(updater);
    } else {
      setCcoRecipients(updater);
    }
  };

  const handleOpenEmailClient = async () => {
    if (!reportId) return;

    // 1. Validar e coletar endereços com detecção de duplicados
    let hasErrors = false;
    const seenEmails = new Set<string>();

    const validateList = (list: EmailRecipientItem[], sectionLabel: string, isRequired: boolean) => {
      return list.map((item, index) => {
        const email = item.email.trim().toLowerCase();

        // Se for CC ou CCO e o campo estiver vazio, apenas limpa
        if (!isRequired && !email) {
          return { ...item, email: '', error: undefined };
        }

        const validation = validateEmail(email);
        if (!validation.isValid) {
          hasErrors = true;
          return {
            ...item,
            email,
            error: `${sectionLabel} ${index + 1}: ${validation.error || 'E-mail inválido'}`,
          };
        }

        if (seenEmails.has(email)) {
          hasErrors = true;
          return {
            ...item,
            email,
            error: `E-mail duplicado (${email})`,
          };
        }

        seenEmails.add(email);
        return { ...item, email, error: undefined };
      });
    };

    const validatedPara = validateList(paraRecipients, 'Para', true);
    const validatedCc = validateList(ccRecipients, 'CC', false);
    const validatedCco = validateList(ccoRecipients, 'CCO', false);

    setParaRecipients(validatedPara);
    setCcRecipients(validatedCc);
    setCcoRecipients(validatedCco);

    const finalPara = validatedPara.map(r => r.email.trim()).filter(Boolean);
    const finalCc = validatedCc.map(r => r.email.trim()).filter(Boolean);
    const finalCco = validatedCco.map(r => r.email.trim()).filter(Boolean);

    if (finalPara.length === 0) {
      Alert.alert(
        'Destinatário obrigatório',
        'Informe pelo menos um endereço de e-mail válido no campo "Para".'
      );
      return;
    }

    if (hasErrors) {
      Alert.alert(
        'Destinatários inválidos',
        'Por favor, corrija os endereços destacados antes de prosseguir com o envio.'
      );
      return;
    }

    // 2. Verificar se existe sessão ativa (necessária para gerar URL assinada de anexo no bucket privado)
    const { data: { session } } = await supabase.auth.getSession();
    const isSessionExpired = !session || (session.expires_at ? session.expires_at * 1000 < Date.now() : false);

    if (isSessionExpired) {
      Alert.alert(
        'Sessão expirada',
        'Sua sessão não está ativa ou expirou. Por favor, faça login novamente no aplicativo.'
      );
      return;
    }

    // 3. Montar dados para o envio
    const reportIndex = patient?.reports.findIndex(r => r.id === reportId) ?? -1;
    const reportNumber = reportIndex >= 0 ? reportIndex + 1 : undefined;

    const conteudo = montarConteudoEmail({
      numeroRelatorio: reportNumber,
      prontuario: patient?.prontuario,
      nomeCivil: patient?.nome_civil,
      nomeSocial: patient?.nome_social,
      transcricao: relatorio,
      comentario: comentarios,
      anexo: fileUri
        ? {
            uri: fileUri,
            nome: fileName,
            mimeType: fileType,
          }
        : undefined,
    });

    const destinatarios: Destinatarios = {
      para: finalPara,
      cc: finalCc,
      cco: finalCco,
    };

    setIsPreparingEmail(true);

    try {
      const resultado = await compartilharPorEmail(conteudo, destinatarios);

      if (resultado.sucesso) {
        setEmailModalVisible(false);

        // Feedback condicionado à plataforma (Android sempre retorna 'sent' devido a limitações de intents)
        if (Platform.OS === 'ios') {
          if (resultado.status === 'sent') {
            Alert.alert('E-mail enviado', 'O relatório foi transmitido pelo aplicativo de e-mail.');
          } else if (resultado.status === 'saved') {
            Alert.alert('Rascunho salvo', 'A mensagem foi salva na sua pasta de rascunhos.');
          }
        } else {
          Alert.alert(
            'Compositor de e-mail',
            'O aplicativo de e-mail foi aberto com os dados do relatório.'
          );
        }
      } else if (!resultado.cancelado && resultado.erro) {
        Alert.alert(
          'Falha ao abrir e-mail',
          resultado.erro || 'Não foi possível abrir o compositor de e-mail.'
        );
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Falha inesperada ao preparar o e-mail.');
    } finally {
      setIsPreparingEmail(false);
    }
  };

  const handleReopen = async () => {
    if (!reportId) return;

    setIsSaving(true);
    const success = await updateReport(reportId, {
      status: 'em_andamento',
    });
    setIsSaving(false);

    if (success) {
      setReportStatus('em_andamento');
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
          {fotoUrl && !photoError ? (
            <Image
              source={{ uri: fotoUrl }}
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
            <TouchableOpacity
              style={[styles.transcribeBtn, { opacity: isTranscribing ? 0.6 : 1 }]}
              onPress={transcrever}
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1d70b8" style={{ marginRight: 6 }} />
                  <Text style={styles.transcribeText}>Extraindo texto…</Text>
                </View>
              ) : (
                <Text style={styles.transcribeText}>Transcrever arquivo</Text>
              )}
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
          <TouchableOpacity
            style={[
              styles.shareBtn,
              {
                backgroundColor: colors.whatsappBtn,
                opacity: !reportId ? 0.6 : 1,
              },
            ]}
            onPress={handleShareWhatsApp}
            activeOpacity={!reportId ? 0.6 : 0.8}
          >
            <Text style={[styles.shareText, { color: '#fff' }]}>WhatsApp</Text>
            <FontAwesome name="whatsapp" size={18} color="#fff" style={{ marginLeft: 5 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.shareBtn,
              {
                backgroundColor: isDark ? '#444' : '#eee',
                borderColor: '#d9534f',
                borderWidth: 1,
                opacity: !reportId ? 0.6 : 1,
              },
            ]}
            onPress={handleOpenEmailModal}
            activeOpacity={!reportId ? 0.6 : 0.8}
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
              onPress={() => handleSave('em_andamento')}
              disabled={isSaving}
            >
              <Text style={styles.actionBtnText}>{isSaving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: isSaving ? '#888' : '#d9534f', flex: 1 }]}
              onPress={() => handleSave('finalizado')}
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
          if (!isPreparingEmail) setEmailModalVisible(false);
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
                  disabled={isPreparingEmail}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalInstructions, { color: isDark ? '#ddd' : '#333' }]}>
                Preencha os destinatários para abrir no app de e-mail:
              </Text>

              <ScrollView style={styles.recipientsScrollView} keyboardShouldPersistTaps="handled">
                {/* Seção Para (Obrigatório) */}
                <Text style={[styles.sectionSubtitle, { color: colors.text }]}>Para *</Text>
                {paraRecipients.map((item) => (
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
                        value={item.email}
                        editable={!isPreparingEmail}
                        onChangeText={(t) => handleRecipientChange('para', item.id, t)}
                      />
                      {paraRecipients.length > 1 && (
                        <TouchableOpacity
                          style={[styles.removeRecipientBtn, { opacity: isPreparingEmail ? 0.4 : 1 }]}
                          onPress={() => handleRemoveRecipient('para', item.id)}
                          disabled={isPreparingEmail}
                        >
                          <Feather name="trash-2" size={18} color="#d9534f" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {item.error ? (
                      <Text style={styles.recipientErrorText}>{item.error}</Text>
                    ) : null}
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addEmailSmallBtn, { borderColor: colors.blueBtn, opacity: isPreparingEmail ? 0.5 : 1 }]}
                  onPress={() => handleAddRecipient('para')}
                  disabled={isPreparingEmail}
                >
                  <Text style={[styles.addEmailSmallBtnText, { color: colors.blueBtn }]}>
                    + Adicionar destinatário em Para
                  </Text>
                </TouchableOpacity>

                {/* Seção CC (Com Cópia) */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionSubtitle, { color: colors.text }]}>CC (Com Cópia)</Text>
                  {ccRecipients.length === 0 && (
                    <TouchableOpacity
                      onPress={() => handleAddRecipient('cc')}
                      disabled={isPreparingEmail}
                    >
                      <Text style={[styles.addSectionLink, { color: colors.blueBtn }]}>+ Adicionar CC</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {ccRecipients.map((item) => (
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
                        placeholder="cc@exemplo.com"
                        placeholderTextColor={isDark ? '#aaa' : '#666'}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        value={item.email}
                        editable={!isPreparingEmail}
                        onChangeText={(t) => handleRecipientChange('cc', item.id, t)}
                      />
                      <TouchableOpacity
                        style={[styles.removeRecipientBtn, { opacity: isPreparingEmail ? 0.4 : 1 }]}
                        onPress={() => handleRemoveRecipient('cc', item.id)}
                        disabled={isPreparingEmail}
                      >
                        <Feather name="trash-2" size={18} color="#d9534f" />
                      </TouchableOpacity>
                    </View>
                    {item.error ? (
                      <Text style={styles.recipientErrorText}>{item.error}</Text>
                    ) : null}
                  </View>
                ))}

                {ccRecipients.length > 0 && (
                  <TouchableOpacity
                    style={[styles.addEmailSmallBtn, { borderColor: colors.blueBtn, opacity: isPreparingEmail ? 0.5 : 1 }]}
                    onPress={() => handleAddRecipient('cc')}
                    disabled={isPreparingEmail}
                  >
                    <Text style={[styles.addEmailSmallBtnText, { color: colors.blueBtn }]}>
                      + Adicionar outro CC
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Seção CCO (Cópia Oculta) */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionSubtitle, { color: colors.text }]}>CCO (Cópia Oculta)</Text>
                  {ccoRecipients.length === 0 && (
                    <TouchableOpacity
                      onPress={() => handleAddRecipient('cco')}
                      disabled={isPreparingEmail}
                    >
                      <Text style={[styles.addSectionLink, { color: colors.blueBtn }]}>+ Adicionar CCO</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {ccoRecipients.map((item) => (
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
                        placeholder="cco@exemplo.com"
                        placeholderTextColor={isDark ? '#aaa' : '#666'}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        value={item.email}
                        editable={!isPreparingEmail}
                        onChangeText={(t) => handleRecipientChange('cco', item.id, t)}
                      />
                      <TouchableOpacity
                        style={[styles.removeRecipientBtn, { opacity: isPreparingEmail ? 0.4 : 1 }]}
                        onPress={() => handleRemoveRecipient('cco', item.id)}
                        disabled={isPreparingEmail}
                      >
                        <Feather name="trash-2" size={18} color="#d9534f" />
                      </TouchableOpacity>
                    </View>
                    {item.error ? (
                      <Text style={styles.recipientErrorText}>{item.error}</Text>
                    ) : null}
                  </View>
                ))}

                {ccoRecipients.length > 0 && (
                  <TouchableOpacity
                    style={[styles.addEmailSmallBtn, { borderColor: colors.blueBtn, opacity: isPreparingEmail ? 0.5 : 1 }]}
                    onPress={() => handleAddRecipient('cco')}
                    disabled={isPreparingEmail}
                  >
                    <Text style={[styles.addEmailSmallBtnText, { color: colors.blueBtn }]}>
                      + Adicionar outro CCO
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.savedReportNotice, { color: isDark ? '#aaa' : '#777' }]}>
                  * O e-mail enviará a versão persistida deste relatório salva no sistema.
                </Text>
              </ScrollView>

              {/* Botões do Rodapé do Modal */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: isDark ? '#555' : '#ccc' }]}
                  onPress={() => setEmailModalVisible(false)}
                  disabled={isPreparingEmail}
                >
                  <Text style={[styles.modalCancelBtnText, { color: colors.text }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    { backgroundColor: isPreparingEmail ? '#888' : colors.blueBtn },
                  ]}
                  onPress={handleOpenEmailClient}
                  disabled={isPreparingEmail}
                >
                  {isPreparingEmail ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.modalConfirmBtnText}>Abrindo...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.modalConfirmBtnText}>Abrir e-mail</Text>
                      <Feather name="mail" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
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
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  addSectionLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  addEmailSmallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 10,
  },
  addEmailSmallBtnText: {
    fontSize: 12,
    fontWeight: '600',
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
