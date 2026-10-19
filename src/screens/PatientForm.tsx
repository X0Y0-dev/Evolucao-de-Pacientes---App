import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, Gender } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { formatCPF, formatDate, formatPhone, formatCEP } from '../utils/masks';
import { getPatientPhotoUrl } from '../utils/uploadFile';
import { validateEmail } from '../utils/validators';

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

  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [localidade, setLocalidade] = useState('');
  const [uf, setUf] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [complementoEndereco, setComplementoEndereco] = useState('');
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  useEffect(() => {
    if (existingPatient) {
      setNomeCivil(existingPatient.nome_civil);
      setNomeSocial(existingPatient.nome_social || '');
      setCpf(formatCPF(existingPatient.cpf));
      setSexo(existingPatient.sexo);
      let birth = existingPatient.nascimento || '';
      if (birth.includes('-')) {
        const parts = birth.split('-');
        if (parts.length === 3) birth = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      setNascimento(birth);
      setTelefone(formatPhone(existingPatient.telefone));
      setEmail(existingPatient.email);
      setPhotoUri(existingPatient.foto_perfil_path);
      setCep(formatCEP(existingPatient.cep || ''));
      setLogradouro(existingPatient.logradouro || '');
      setBairro(existingPatient.bairro || '');
      setLocalidade(existingPatient.localidade || '');
      setUf(existingPatient.uf || '');
      setNumeroEndereco(existingPatient.numero_endereco || '');
      setComplementoEndereco(existingPatient.complemento_endereco || '');
    }
  }, [patientId]);

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#c9d4db',
    greenBtn: '#12a454',
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const fetchCep = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      Alert.alert('CEP inválido', 'O CEP deve conter exatamente 8 dígitos.');
      return;
    }
    setIsFetchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) {
        Alert.alert('CEP não encontrado', 'Não foi possível encontrar o endereço para este CEP.');
      } else {
        setCep(formatCEP(data.cep || cleanCep));
        setLogradouro(data.logradouro || '');
        setBairro(data.bairro || '');
        setLocalidade(data.localidade || '');
        setUf(data.uf || '');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível consultar o CEP. Verifique sua conexão.');
    } finally {
      setIsFetchingCep(false);
    }
  };

  const handleSave = async () => {
    if (!nomeCivil.trim() || !cpf.trim() || !nascimento.trim() || !telefone.trim() || !email.trim()) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailValidation = validateEmail(cleanEmail);
    if (!emailValidation.isValid) {
      Alert.alert('E-mail inválido', emailValidation.error || 'Formato de e-mail inválido.');
      return;
    }

    const cleanPhone = telefone.replace(/\D/g, '');
    if (!/^55\d{2}9\d{8}$/.test(cleanPhone)) {
      Alert.alert('Telefone inválido', 'Formato: +55 (11) 91234-5678');
      return;
    }

    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length > 0 && cleanCep.length !== 8) {
      Alert.alert('CEP inválido', 'O CEP deve conter exatamente 8 dígitos.');
      return;
    }

    const addressFields = {
      cep: cleanCep ? formatCEP(cleanCep) : undefined,
      logradouro: logradouro.trim() || undefined,
      bairro: bairro.trim() || undefined,
      localidade: localidade.trim() || undefined,
      uf: uf.trim() || undefined,
      numero_endereco: numeroEndereco.trim() || undefined,
      complemento_endereco: complementoEndereco.trim() || undefined,
    };

    if (isEditing && patientId) {
      setIsSaving(true);
      const success = await updatePatient(
        patientId,
        {
          nome_civil: nomeCivil.trim(),
          nome_social: nomeSocial.trim() || undefined,
          cpf,
          sexo,
          nascimento,
          telefone: cleanPhone,
          email: cleanEmail,
          ...addressFields,
        },
        (photoUri && (photoUri.startsWith('file://') || photoUri.startsWith('content://'))) ? photoUri : undefined
      );
      setIsSaving(false);
      if (success) navigation.goBack();
    } else {
      const randomId = Math.floor(Math.random() * 90000) + 10000;
      setIsSaving(true);
      const success = await addPatient({
        prontuario: randomId.toString(),
        nome_civil: nomeCivil.trim(),
        nome_social: nomeSocial.trim() || undefined,
        cpf,
        sexo,
        nascimento,
        telefone: cleanPhone,
        email: cleanEmail,
        foto_perfil_path: photoUri,
        ...addressFields,
      });
      setIsSaving(false);
      if (success) navigation.goBack();
    }
  };

  const handleDelete = () => {
    if (!patientId) return;
    Alert.alert(
      'Excluir paciente',
      `Tem certeza de que deseja excluir "${nomeCivil}"? Todos os relatórios serão apagados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sim', style: 'destructive', onPress: async () => {
          setIsSaving(true);
          const success = await deletePatient(patientId);
          setIsSaving(false);
          if (success) navigation.goBack();
        }},
      ]
    );
  };

  const genderOptions: Gender[] = ['Masculino', 'Feminino', 'Não-binário', 'Indefinido', 'Outros'];

  const displayPhotoUri = photoUri
    ? ((photoUri.startsWith('file://') || photoUri.startsWith('content://')) ? photoUri : getPatientPhotoUrl(photoUri))
    : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <Header showBack />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

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
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="Nome Civil *" placeholderTextColor={isDark ? '#aaa' : '#666'} value={nomeCivil} onChangeText={setNomeCivil} />
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="Nome Social" placeholderTextColor={isDark ? '#aaa' : '#666'} value={nomeSocial} onChangeText={setNomeSocial} />
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="CPF *" placeholderTextColor={isDark ? '#aaa' : '#666'} keyboardType="numeric" value={cpf} onChangeText={(t) => setCpf(formatCPF(t))} maxLength={14} />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.label, { color: colors.text }]}>Sexo:</Text>
            <TouchableOpacity style={[styles.input, { backgroundColor: colors.inputBg, justifyContent: 'center' }]} onPress={() => setShowSexDropdown(!showSexDropdown)}>
              <Text style={{ color: sexo ? colors.text : (isDark ? '#aaa' : '#666') }}>{sexo || 'Selecionar'}</Text>
            </TouchableOpacity>
            {showSexDropdown && (
              <View style={[styles.dropdown, { backgroundColor: colors.inputBg }]}>
                {genderOptions.map((opt) => (
                  <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { setSexo(opt as Gender); setShowSexDropdown(false); }}>
                    <Text style={{ color: colors.text }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.text }]}>Nascimento:</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="DD/MM/AAAA *" placeholderTextColor={isDark ? '#aaa' : '#666'} keyboardType="numeric" value={nascimento} onChangeText={(t) => setNascimento(formatDate(t))} maxLength={10} />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Contato:</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="E-mail *"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={(t) => setEmail(t.toLowerCase())}
        />
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="Telefone * (ex: +55 (11) 91234-5678)" placeholderTextColor={isDark ? '#aaa' : '#666'} keyboardType="phone-pad" value={telefone} onChangeText={(t) => setTelefone(formatPhone(t))} maxLength={19} />

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Endereço:</Text>

        {/* 1: [cep] [botão com uma lupa] */}
        <View style={styles.cepRow}>
          <TextInput
            style={[styles.input, styles.cepInput, { backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="CEP"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            keyboardType="numeric"
            value={cep}
            onChangeText={(t) => setCep(formatCEP(t))}
            maxLength={9}
          />
          <TouchableOpacity style={[styles.cepBtn, { backgroundColor: colors.inputBg, opacity: isFetchingCep ? 0.6 : 1 }]} onPress={fetchCep} disabled={isFetchingCep}>
            <Feather name="search" size={20} color={isDark ? '#fff' : '#333'} />
          </TouchableOpacity>
        </View>

        {/* 2: [bairro] */}
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Bairro"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          value={bairro}
          onChangeText={setBairro}
        />

        {/* 3: [logradouro] [numero_endereco] */}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 3, marginRight: 8, backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="Logradouro"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            value={logradouro}
            onChangeText={setLogradouro}
          />
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="Nº"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            keyboardType="numeric"
            value={numeroEndereco}
            onChangeText={setNumeroEndereco}
          />
        </View>

        {/* 4: [localidade] [uf] */}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 3, marginRight: 8, backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="Cidade"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            value={localidade}
            onChangeText={setLocalidade}
          />
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder="UF"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            value={uf}
            onChangeText={(t) => setUf(t.toUpperCase())}
            maxLength={2}
            autoCapitalize="characters"
          />
        </View>

        {/* 5: [complemento] */}
        <TextInput style={[styles.complemento, { backgroundColor: colors.inputBg, color: colors.text }]} placeholder="Complemento" placeholderTextColor={isDark ? '#aaa' : '#666'} multiline value={complementoEndereco} onChangeText={setComplementoEndereco} />

        {isEditing ? (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: isSaving ? '#888' : colors.greenBtn }]} onPress={handleSave} disabled={isSaving}>
              <Text style={styles.submitBtnText}>{isSaving ? 'Salvando...' : 'Salvar'}</Text>
              <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: isSaving ? '#888' : '#d9534f' }]} onPress={handleDelete} disabled={isSaving}>
              <Text style={styles.submitBtnText}>Excluir</Text>
              <Feather name="trash-2" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: isSaving ? '#888' : colors.greenBtn }]} onPress={handleSave} disabled={isSaving}>
            <Text style={styles.submitBtnText}>{isSaving ? 'Salvando...' : 'Criar paciente'}</Text>
            <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  photoContainer: { alignSelf: 'center', marginVertical: 20 },
  photo: { width: 120, height: 120, borderRadius: 60 },
  photoPlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  input: { height: 45, borderRadius: 20, paddingHorizontal: 15, marginBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'flex-start', zIndex: 10 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  dropdown: { position: 'absolute', top: 75, left: 0, right: 0, borderRadius: 10, zIndex: 100, padding: 5, borderWidth: 1, borderColor: '#aaa' },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 10 },
  cepRow: { flexDirection: 'row', alignItems: 'center' },
  cepInput: { flex: 1, marginRight: 8 },
  cepBtn: { width: 45, height: 45, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  complemento: { borderRadius: 15, padding: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 20 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 25, marginTop: 20 },
  actionButtonsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 25, marginRight: 10 },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 25 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
