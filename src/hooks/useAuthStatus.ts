import { useMemo } from 'react';
import { useAppSelector } from './reduxHooks';

export const useAuthStatus = () => {
  const { token, user, isSessionLoaded } = useAppSelector((state) => state.auth);

  const derivedFullName = useMemo(() => {
    const firstName = user?.firstName?.trim();
    const lastName = user?.lastName?.trim();
    if (!firstName || !lastName) {
      return null;
    }
    return `${firstName} ${lastName}`;
  }, [user]);

  const authDob = useMemo(() => {
    return user?.dateOfBirth ?? null;
  }, [user]);

  const hasAuthName = Boolean(derivedFullName);
  const hasAuthDob = Boolean(authDob);

  return {
    isSignedIn: Boolean(token),
    isSessionLoaded,
    authUser: user,
    derivedFullName,
    authDob,
    hasAuthName,
    hasAuthDob,
  };
};
