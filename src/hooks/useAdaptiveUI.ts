import { useMemo } from 'react';
import { useAppSelector } from './reduxHooks';

export interface AdaptiveUISettings {
  scaleFactor: number;
  isSimplified: boolean;
  isPWDMode: boolean;
  layoutPadding: number;
  touchTargetScale: number;
  simplifiedSpacing: number;
  borderRadius: number;
  highContrastSupport: boolean;
}

/**
 * Derives shared UI metrics from the Redux settingsSlice, including typography
 * scaling and layout adjustments for specialized modes (Senior/PWD).
 */
export const useAdaptiveUI = (): AdaptiveUISettings => {
  const specializedModes = useAppSelector((state) => state.settings?.specializedModes);

  return useMemo(() => {
    const modes = specializedModes || { isSenior: false, isPWD: false, isChronic: false };
    const { isSenior, isPWD } = modes;

    const baseScale = isSenior ? 1.25 : 1.0;
    const scaleFactor = isPWD && !isSenior ? Math.max(baseScale, 1.15) : baseScale;
    const isSimplified = isSenior || isPWD;
    const isPWDMode = isPWD;

    const layoutPadding = isPWDMode ? 24 : 16;
    const touchTargetScale = isPWDMode ? 1.2 : 1.0;
    const simplifiedSpacing = isPWDMode ? 20 : 12;
    const borderRadius = isPWDMode ? 20 : 16;
    const highContrastSupport = isPWDMode;

    return {
      scaleFactor,
      isSimplified,
      isPWDMode,
      layoutPadding,
      touchTargetScale,
      simplifiedSpacing,
      borderRadius,
      highContrastSupport,
    };
  }, [specializedModes]);
};
