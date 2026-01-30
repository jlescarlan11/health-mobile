import MedicationTrackerScreen from '../src/screens/MedicationTrackerScreen';
import { StandardHeader } from '../src/components/common/StandardHeader';
import { Stack } from 'expo-router';

export default function MedicationTrackerRoute() {
  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          header: () => <StandardHeader title="Medication Tracker" /> 
        }} 
      />
      <MedicationTrackerScreen />
    </>
  );
}
