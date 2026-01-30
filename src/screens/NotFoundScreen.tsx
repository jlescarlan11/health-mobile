import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../components/common/Text';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { router } from 'expo-router';
import { Button, ScreenSafeArea } from '../components/common';

type Props = StackScreenProps<RootStackParamList, 'NotFound'>;

const NotFoundScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <ScreenSafeArea style={styles.container}>
      <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
      <Button
        onPress={() => router.replace('/')}
        title="Go to home screen"
      />
    </ScreenSafeArea>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});

export default NotFoundScreen;
