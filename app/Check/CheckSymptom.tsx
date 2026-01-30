import CheckSymptomScreen from '../../src/features/navigation/CheckSymptomScreen';
import { StandardHeader } from '../../src/components/common/StandardHeader';
import { Stack } from 'expo-router';

export default function CheckSymptomRoute() {
  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          header: () => <StandardHeader title="Check Symptoms" showBackButton /> 
        }} 
      />
      <CheckSymptomScreen />
    </>
  );
}
