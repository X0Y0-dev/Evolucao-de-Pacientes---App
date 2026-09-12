import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { StatusBar } from 'react-native';

import Splash from './src/screens/Splash';
import Home from './src/screens/Home';
import PatientForm from './src/screens/PatientForm';
import ReportForm from './src/screens/ReportForm';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#1a1a1a' : '#f0f0f0'} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="Splash" component={Splash} />
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="PatientForm" component={PatientForm} />
          <Stack.Screen name="ReportForm" component={ReportForm} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Navigation />
    </AppProvider>
  );
}
