import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import NotFoundScreen from '../src/screens/NotFoundScreen';

export default function NotFound() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  
  return <NotFoundScreen navigation={navigation} route={route} />;
}
