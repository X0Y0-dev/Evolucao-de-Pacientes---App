import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../context/AppContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#c9d4db',
    placeholder: isDark ? '#aaa' : '#666',
    greenBtn: '#12a454',
    disabledBtn: isDark ? '#2a5a3a' : '#8ecbaa',
    errorText: '#e74c3c',
  };

  const emailIsValid = email.includes('@') && email.trim().length > 0;
  const senhaIsValid = senha.length >= 6;
  const canSubmit = emailIsValid && senhaIsValid && !loading;

  async function handleSignIn() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), senha);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (
        msg.includes('Invalid login credentials') ||
        msg.includes('invalid_credentials')
      ) {
        setError('E-mail ou senha incorretos.');
      } else if (msg.includes('Email not confirmed')) {
        setError('E-mail não confirmado. Verifique sua caixa de entrada.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Sem conexão com a internet. Tente novamente.');
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={[styles.title, { color: colors.text }]}>Bem-vindo</Text>
          <Text style={[styles.subtitle, { color: colors.placeholder }]}>
            Faça login para continuar
          </Text>

          {/* E-mail */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>E-mail</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="seuemail@exemplo.com"
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t.toLowerCase());
                setError(null);
              }}
              editable={!loading}
            />
          </View>

          {/* Senha */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Senha</Text>
            <View style={[styles.passwordRow, { backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.text }]}
                placeholder="••••••••"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={senha}
                onChangeText={(t) => {
                  setSenha(t);
                  setError(null);
                }}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                disabled={loading}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.placeholder}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mensagem de erro */}
          {error ? (
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
          ) : null}

          {/* Botão Entrar */}
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: canSubmit ? colors.greenBtn : colors.disabledBtn },
            ]}
            onPress={handleSignIn}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 36,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeButton: {
    paddingLeft: 10,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
