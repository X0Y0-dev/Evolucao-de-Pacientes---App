import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather, FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportForm'>;

export default function ReportForm({ route }: Props) {
  const { patientId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, patients, addReport } = useAppContext();
  const isDark = theme === 'dark';
  
  const patient = patients.find(p => p.id === patientId);
  
  const [fileUri, setFileUri] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [relatorio, setRelatorio] = useState('');
  const [comentarios, setComentarios] = useState('');

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#c9d4db',
    blueBtn: '#1d70b8',
    whatsappBtn: '#25D366',
    emailBtn: '#d9e2e8', // Light mode email btn looks gray/white with red border
    saveBtn: '#1d70b8',
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'],
      });
      if (!result.canceled && result.assets.length > 0) {
        setFileUri(result.assets[0].uri);
        setFileName(result.assets[0].name);
      }
    } catch (err) {
      console.log('Error picking document', err);
    }
  };

  const transcrever = () => {
    if (fileUri) {
      setRelatorio(relatorio + '\n[Transcrição do arquivo simulada...]');
    } else {
      Alert.alert('Aviso', 'Nenhum arquivo anexado para transcrever.');
    }
  };

  const handleSave = (status: 'Em Andamento' | 'Finalizado') => {
    if (!relatorio.trim()) {
      Alert.alert('Erro', 'O campo de relatório é obrigatório.');
      return;
    }
    
    addReport(patientId, {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('pt-BR'),
      status,
      fileUri,
      text: relatorio,
      comments: comentarios,
    });
    
    navigation.goBack();
  };

  if (!patient) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header showBack />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.patientHeader}>
          {patient.photoUri ? (
            <Image source={{ uri: patient.photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Feather name="user" size={40} color={isDark ? '#aaa' : '#555'} />
            </View>
          )}
          <Text style={[styles.patientName, { color: colors.text }]}>{patient.nomeCivil}</Text>
          <Text style={[styles.patientId, { color: colors.text }]}>Nº prontuário: {patient.id}</Text>
          
          <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: isDark ? '#4a4a4a' : '#ccc' }]} onPress={pickDocument}>
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
          />
          <TouchableOpacity style={styles.transcribeBtn} onPress={transcrever}>
            <Text style={styles.transcribeText}>Transcrever arquivo</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.createBtn, { backgroundColor: colors.blueBtn }]}
          onPress={() => handleSave('Em Andamento')}
        >
          <Text style={styles.createBtnText}>Criar relatório</Text>
          <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Comentários:</Text>
        <TextInput
          style={[styles.commentArea, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Comece a digitar..."
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          multiline
          value={comentarios}
          onChangeText={setComentarios}
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

        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: colors.blueBtn, flex: 1, marginRight: 10 }]}
            onPress={() => handleSave('Em Andamento')}
          >
            <Text style={styles.actionBtnText}>Salvar</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#d9534f', flex: 1 }]}
            onPress={() => handleSave('Finalizado')}
          >
            <Text style={styles.actionBtnText}>Finalizar</Text>
          </TouchableOpacity>
        </View>

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
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 25, marginBottom: 20,
  },
  createBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
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
  actionBtn: { paddingVertical: 15, borderRadius: 25, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
