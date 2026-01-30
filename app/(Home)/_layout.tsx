import React from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const paddingBottom = insets.bottom > 0 ? insets.bottom : Platform.OS === 'ios' ? 20 : 12;
  const tabHeight = 60 + paddingBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: 'rgba(0,0,0,0.05)',
          elevation: 8,
          height: tabHeight,
          paddingBottom: paddingBottom,
          paddingTop: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="HomeFeed"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="home-variant" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="HealthHub"
        options={{
          tabBarLabel: 'Hub',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="newspaper-variant" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="cog" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
