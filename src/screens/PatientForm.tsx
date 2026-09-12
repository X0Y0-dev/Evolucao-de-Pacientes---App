import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Gender } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

type PatientFormNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PatientForm'>;

export default function PatientForm() {
  const navigation = useNavigation<PatientFormNavigationProp>();
  const { theme, addPatient } = useAppContext();
  const isDark = theme === 'dark';
  
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [nomeCivil, setNomeCivil] = useState('');
  const [nomeSocial, setNomeSocial] = useState('');
  const [cpf, setCpf] = useState('');
  const [sexo, setSexo] = useState<Gender | undefined>();
  const [nascimento, setNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [showSexDropdown, setShowSexDropdown] = useState(false);

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

  const handleSave = () => {
    if (!nomeCivil || !cpf || !nascimento || !telefone || !email) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    
    // Auto generate 5 digits ID
    const randomId = Math.floor(Math.random() * 90000) + 10000;
    
    addPatient({
      id: randomId.toString(),
      nomeCivil,
      nomeSocial,
      cpf,
      sexo,
      nascimento,
      telefone,
      email,
      photoUri,
      reports: [],
    });
    
    navigation.goBack();
  };

  const genderOptions: Gender[] = ['Masculino', 'Feminino', 'Não-binário', 'Indefinido', 'Outros'];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header showBack />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.photoContainer} onPress={pickImage}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
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
          onChangeText={setCpf}
        />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.label, { color: colors.text }]}>Sexo:</Text>
            <TouchableOpacity 
              style={[styles.input, { backgroundColor: colors.inputBg, justifyContent: 'center' }]}
              onPress={() => setShowSexDropdown(!showSexDropdown)}
            >
              <Text style={{ color: sexo ? colors.text : (isDark ? '#aaa' : '#666') }}>
                {sexo || 'Selecione v'}
              </Text>
            </TouchableOpacity>
            {showSexDropdown && (
              <View style={[styles.dropdown, { backgroundColor: colors.inputBg }]}>
                {genderOptions.map(g => (
                  <TouchableOpacity 
                    key={g} 
                    style={styles.dropdownItem}
                    onPress={() => { setSexo(g); setShowSexDropdown(false); }}
                  >
                    <Text style={{ color: colors.text }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.text }]}>Nascimento: *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={isDark ? '#aaa' : '#666'}
              value={nascimento}
              onChangeText={setNascimento}
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
          placeholder="Telefone *"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          keyboardType="phone-pad"
          value={telefone}
          onChangeText={setTelefone}
        />

        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: colors.greenBtn }]}
          onPress={handleSave}
        >
          <Text style={styles.submitBtnText}>Criar paciente</Text>
          <Feather name="check-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

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
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
