import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { useNavigation } from '@react-navigation/native';

type SplashNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function Splash() {
  const navigation = useNavigation<SplashNavigationProp>();
  const { theme } = useAppContext();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After logo fade-in, wait a bit and move to next screen
      setTimeout(() => {
        navigation.replace('Home');
      }, 1000);
    });
  }, [fadeAnim, translateY, navigation]);

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#f0f0f0'; // Using app standard background colors

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Animated.Image
        source={require('../../assets/logo.png')}
        style={[
          styles.logo,
          {
            opacity: fadeAnim,
            transform: [{ translateY }],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 200,
  },
});
