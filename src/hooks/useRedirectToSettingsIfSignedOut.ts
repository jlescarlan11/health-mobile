import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export const useRedirectToSettingsIfSignedOut = (
  isSignedIn: boolean,
  isSessionLoaded: boolean,
) => {
  const router = useRouter();

  useEffect(() => {
    if (!isSessionLoaded) {
      return;
    }

    if (isSignedIn) {
      return;
    }

    router.replace('/(Home)/Settings');
  }, [isSignedIn, isSessionLoaded, router]);
};
