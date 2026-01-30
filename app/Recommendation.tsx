import { RecommendationScreen } from '../src/screens';
import { StandardHeader } from '../src/components/common/StandardHeader';
import { Stack } from 'expo-router';

export default function RecommendationRoute() {
  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          header: () => <StandardHeader title="Recommendation" /> 
        }} 
      />
      <RecommendationScreen />
    </>
  );
}
