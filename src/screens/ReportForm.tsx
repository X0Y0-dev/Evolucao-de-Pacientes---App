import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ReportStatus } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { getPatientPhotoUrl } from '../utils/uploadFile';

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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header showBack />

      <ScrollView contentContainerStyle={styles.scrollContent}>

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

          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: isDark ? '#444' : '#eee', borderColor: '#d9534f', borderWidth: 1 }]}>
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
    </View>
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
});
