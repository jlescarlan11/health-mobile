import { CrisisSupportScreen } from '../src/screens';
import { Stack } from 'expo-router';

export default function CrisisSupportRoute() {
  return (
    <>
      <Stack.Screen options={{ presentation: 'modal' }} />
      <CrisisSupportScreen />
    </>
  );
}
