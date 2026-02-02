import { useMemo } from 'react';
import * as Location from 'expo-location';

export interface LocationAccessStateParams {
  permissionStatus: Location.PermissionStatus | null;
  canAskAgain: boolean | null;
  locationServicesEnabled: boolean | null;
}

export interface LocationAccessState {
  canUseLocation: boolean;
  canRequestPermission: boolean;
  needsSettings: boolean;
}

export const useLocationAccessState = ({
  permissionStatus,
  canAskAgain,
  locationServicesEnabled,
}: LocationAccessStateParams): LocationAccessState => {
  return useMemo(() => {
    const servicesEnabled = locationServicesEnabled;
    const servicesAccessible = locationServicesEnabled !== false;
    const isGranted = permissionStatus === 'granted';
    const isDenied = permissionStatus === 'denied';
    const isUndetermined = permissionStatus === 'undetermined' || permissionStatus === null;

    const canUseLocation = isGranted && servicesEnabled === true;
    const canRequestPermission =
      !isGranted &&
      servicesAccessible &&
      (isUndetermined || (isDenied && (canAskAgain ?? true)));
    const needsSettings = isDenied && canAskAgain === false;

    return {
      canUseLocation,
      canRequestPermission,
      needsSettings,
    };
  }, [permissionStatus, canAskAgain, locationServicesEnabled]);
};
