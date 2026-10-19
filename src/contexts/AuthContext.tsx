import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Perfil {
  nome_usuario: string;
}

interface AuthContextData {
  session: Session | null;
  perfil: Perfil | null;
  loading: boolean;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchPerfil(userId: string) {
    const { data, error } = await supabase
      .from('perfis')
      .select('nome_usuario')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Falha ao carregar perfil:', error.message);
      setPerfil(null);
    } else {
      setPerfil(data as Perfil);
    }
  }

  useEffect(() => {
    // Carrega sessão inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchPerfil(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Escuta mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (s?.user) {
          fetchPerfil(s.user.id);
        } else {
          setPerfil(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) {
      throw error;
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Erro', 'Não foi possível encerrar a sessão.');
    }
  }

  return (
    <AuthContext.Provider value={{ session, perfil, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
