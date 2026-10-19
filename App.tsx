import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { StatusBar } from 'expo-status-bar';

import Splash from './src/screens/Splash';
import LoginScreen from './src/screens/LoginScreen';
import Home from './src/screens/Home';
import PatientForm from './src/screens/PatientForm';
import ReportForm from './src/screens/ReportForm';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const { theme } = useAppContext();
  const { session, loading } = useAuth();
  const isDark = theme === 'dark';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {loading ? (
            // Enquanto verifica a sessão, mostra splash
            <Stack.Screen name="Splash" component={Splash} />
          ) : !session ? (
            // Sem sessão → apenas login
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            // Com sessão → app completo
            <>
              <Stack.Screen name="Home" component={Home} />
              <Stack.Screen name="PatientForm" component={PatientForm} />
              <Stack.Screen name="ReportForm" component={ReportForm} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </AppProvider>
  );
}
