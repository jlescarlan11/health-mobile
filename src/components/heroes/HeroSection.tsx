import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface HeroSectionProps {
  children: React.ReactNode;
  colors: string[];
  height?: number;
  style?: StyleProp<ViewStyle>;
}

const HeroSection: React.FC<HeroSectionProps> = ({ children, colors, height = 200, style }) => {
  return (
    <LinearGradient colors={[colors[0], colors[1]]} style={[styles.container, { height }, style]}>
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingHorizontal: 0, // Remove horizontal padding for edge-to-edge HomeHero
    paddingTop: 40,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
  },
});

export default HeroSection;
