import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useNavigation } from '@react-navigation/native';

interface HeaderProps {
  showBack?: boolean;
}

export default function Header({ showBack = false }: HeaderProps) {
  const { theme, toggleTheme } = useAppContext();
  const navigation = useNavigation();
  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={{ backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' }}>
      <View style={styles.container}>
        <View style={styles.left}>
          {showBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Feather name="chevron-left" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          )}
        </View>

        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />

        <View style={styles.right}>
          <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
            <Feather name={isDark ? 'moon' : 'sun'} size={24} color={isDark ? '#fff' : '#000'} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  logo: {
    width: 60,
    height: 60,
  },
  left: {
    width: 40,
    alignItems: 'flex-start',
  },
  right: {
    width: 40,
    alignItems: 'flex-end',
  },
  iconButton: {
    padding: 5,
  },
});
