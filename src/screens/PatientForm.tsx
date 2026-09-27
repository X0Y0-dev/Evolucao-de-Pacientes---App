import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, Gender } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { formatCPF, formatDate, formatPhone } from '../utils/masks';
import { getPatientPhotoUrl } from '../utils/uploadFile';

type Props = NativeStackScreenProps<RootStackParamList, 'PatientForm'>;

export default function PatientForm({ route }: Props) {
  const navigation = useNavigation<Props['navigation']>();
  const patientId = route.params?.patientId;
  const isEditing = !!patientId;

  const { theme, patients, addPatient, updatePatient, deletePatient } = useAppContext();
  const isDark = theme === 'dark';

  const existingPatient = patientId ? patients.find(p => p.id === patientId) : undefined;

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [nomeCivil, setNomeCivil] = useState('');
  const [nomeSocial, setNomeSocial] = useState('');
  const [cpf, setCpf] = useState('');
  const [sexo, setSexo] = useState<Gender | undefined>();
  const [nascimento, setNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [showSexDropdown, setShowSexDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Preenche dados caso seja edição
  useEffect(() => {
    if (existingPatient) {
      setNomeCivil(existingPatient.nome_civil);
      setNomeSocial(existingPatient.nome_social || '');
      setCpf(formatCPF(existingPatient.cpf));
      setSexo(existingPatient.sexo);

      // Converte data de nascimento caso esteja em formato YYYY-MM-DD
      let birth = existingPatient.nascimento || '';
      if (birth.includes('-')) {
        const parts = birth.split('-');
        if (parts.length === 3) {
          birth = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      setNascimento(birth);
      setTelefone(formatPhone(existingPatient.telefone));
      setEmail(existingPatient.email);
      setPhotoUri(existingPatient.foto_perfil_path);
    }
  }, [patientId]);

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#c9d4db',
    greenBtn: '#12a454',
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!nomeCivil.trim() || !cpf.trim() || !nascimento.trim() || !telefone.trim() || !email.trim()) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    // Validação do telefone: ^55\d{2}9\d{8}$
    const cleanPhone = telefone.replace(/\D/g, '');
    const phoneRegex = /^55\d{2}9\d{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      Alert.alert(
        'Telefone inválido',
        'O número de telefone deve conter o código do país (55), DDD e o 9 antes dos 8 dígitos.\nFormato: +55 (11) 91234-5678'
      );
      return;
    }

    if (isEditing && patientId) {
      setIsSaving(true);
      const success = await updatePatient(
        patientId,
        {
          nome_civil: nomeCivil.trim(),
          nome_social: nomeSocial.trim() ? nomeSocial.trim() : undefined,
          cpf,
          sexo,
          nascimento,
          telefone: cleanPhone,
          email: email.trim(),
        },
        (photoUri && (photoUri.startsWith('file://') || photoUri.startsWith('content://')))
          ? photoUri
          : undefined
      );
      setIsSaving(false);

      if (success) {
        navigation.goBack();
      }
    } else {
      const randomId = Math.floor(Math.random() * 90000) + 10000;

      setIsSaving(true);
      const success = await addPatient({
        prontuario: randomId.toString(),
        nome_civil: nomeCivil.trim(),
        nome_social: nomeSocial.trim() ? nomeSocial.trim() : undefined,
        cpf,
        sexo,
        nascimento,
        telefone: cleanPhone,
        email: email.trim(),
        foto_perfil_path: photoUri,
      });
      setIsSaving(false);

      if (success) {
        navigation.goBack();
      }
    }
  };

  const handleDelete = () => {
    if (!patientId) return;
    Alert.alert(
      'Excluir paciente',
      `Tem certeza de que deseja excluir o paciente "${nomeCivil}"? Todos os relatórios e arquivos vinculados serão apagados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            const success = await deletePatient(patientId);
            setIsSaving(false);
            if (success) {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const genderOptions: Gender[] = ['Masculino', 'Feminino', 'Não-binário', 'Indefinido', 'Outros'];

  // Resolve foto local ou do storage
  const displayPhotoUri = photoUri
    ? (photoUri.startsWith('file://') || photoUri.startsWith('content://')
        ? photoUri
        : getPatientPhotoUrl(photoUri))
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header showBack />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.photoContainer} onPress={pickImage}>
          {displayPhotoUri ? (
            <Image source={{ uri: displayPhotoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Feather name="image" size={40} color={isDark ? '#aaa' : '#555'} />
            </View>
          )}
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Informações:</Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Nome Civil *"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          value={nomeCivil}
          onChangeText={setNomeCivil}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Nome Social"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          value={nomeSocial}
          onChangeText={setNomeSocial}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="CPF *"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          keyboardType="numeric"
          value={cpf}
          onChangeText={(text) => setCpf(formatCPF(text))}
          maxLength={14}
        />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.label, { color: colors.text }]}>Sexo:</Text>
            <TouchableOpacity 
              style={[styles.input, { backgroundColor: colors.inputBg, justifyContent: 'center' }]}
              onPress={() => setShowSexDropdown(!showSexDropdown)}
            >
              <Text style={{ color: sexo ? colors.text : (isDark ? '#aaa' : '#666') }}>
                {sexo ? sexo : 'Selecionar'}
              </Text>
            </TouchableOpacity>

            {showSexDropdown && (
              <View style={[styles.dropdown, { backgroundColor: colors.inputBg }]}>
                {genderOptions.map((opt) => (
                  <TouchableOpacity 
                    key={opt} 
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSexo(opt);
                      setShowSexDropdown(false);
                    }}
                  >
                    <Text style={{ color: colors.text }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.text }]}>Nascimento:</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="DD/MM/AAAA *"
              placeholderTextColor={isDark ? '#aaa' : '#666'}
              keyboardType="numeric"
              value={nascimento}
              onChangeText={(text) => setNascimento(formatDate(text))}
              maxLength={10}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Contato:</Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="E-mail *"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Telefone * (ex: +55 (11) 91234-5678)"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          keyboardType="phone-pad"
          value={telefone}
          onChangeText={(text) => setTelefone(formatPhone(text))}
          maxLength={19}
        />

        {isEditing ? (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: isSaving ? '#888' : colors.greenBtn }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.submitBtnText}>{isSaving ? 'Salvando...' : 'Salvar'}</Text>
              <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.deleteBtn, { backgroundColor: isSaving ? '#888' : '#d9534f' }]}
              onPress={handleDelete}
              disabled={isSaving}
            >
              <Text style={styles.submitBtnText}>Excluir</Text>
              <Feather name="trash-2" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.submitBtn, { backgroundColor: isSaving ? '#888' : colors.greenBtn }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.submitBtnText}>{isSaving ? 'Salvando...' : 'Criar paciente'}</Text>
            <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  photoContainer: { alignSelf: 'center', marginVertical: 20 },
  photo: { width: 120, height: 120, borderRadius: 60 },
  photoPlaceholder: { 
    width: 120, height: 120, borderRadius: 60, 
    justifyContent: 'center', alignItems: 'center' 
  },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  input: {
    height: 45, borderRadius: 20, paddingHorizontal: 15, marginBottom: 15
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', zIndex: 10 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  dropdown: {
    position: 'absolute', top: 75, left: 0, right: 0,
    borderRadius: 10, zIndex: 100, padding: 5,
    borderWidth: 1, borderColor: '#aaa'
  },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 10 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 25, marginTop: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 25,
    marginRight: 10,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 25,
  },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
