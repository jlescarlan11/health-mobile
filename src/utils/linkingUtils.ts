import { Linking, Platform } from 'react-native';

export type OpenExternalMapsParams = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  address?: string;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const openViber = async (phone: string): Promise<boolean> => {
  if (!phone) return false;

  let cleanPhone = phone.replace(/[^\d+]/g, '');

  // Handle Philippine local numbers: 09... -> 639...
  if (cleanPhone.startsWith('09') && cleanPhone.length === 11) {
    cleanPhone = '63' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('+639') && cleanPhone.length === 13) {
    // Keep as is, but we'll also try without +
  }

  const variations = [cleanPhone];
  if (cleanPhone.startsWith('+')) {
    variations.push(cleanPhone.substring(1));
  } else if (!cleanPhone.startsWith('+') && cleanPhone.length > 5) {
    // If it looks like an international number but missing +, try adding it
    variations.push('+' + cleanPhone);
  }

  const candidates: string[] = [];
  for (const v of variations) {
    const encoded = encodeURIComponent(v);
    candidates.push(`viber://chat?number=${encoded}`);
    candidates.push(`viber://contact?number=${encoded}`);
  }

  for (const url of candidates) {
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (supported) {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        // Continue to next candidate
      }
    }
  }

  return false;
};

export const openMessenger = async (id: string): Promise<boolean> => {
  if (!id) return false;

  const candidates: string[] = [
    `fb-messenger://user-thread/${id}`,
    `fb-messenger://user/${id}`, // Older scheme
    `https://m.me/${id}`, // Robust web fallback
    `https://www.messenger.com/t/${id}`, // Desktop/Universal fallback
  ];

  for (const url of candidates) {
    const isWeb = url.startsWith('http');
    const supported = await Linking.canOpenURL(url).catch(() => false);

    if (supported || isWeb) {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        // Continue to next candidate
      }
    }
  }

  return false;
};

export const openExternalMaps = async ({
  latitude,
  longitude,
  label,
  address,
}: OpenExternalMapsParams): Promise<boolean> => {
  const hasCoords = isFiniteNumber(latitude) && isFiniteNumber(longitude);
  const destinationCoords = hasCoords ? `${latitude},${longitude}` : '';
  const destinationText = [label, address].filter(Boolean).join(' - ').trim();

  const candidates: string[] = [];

  if (hasCoords) {
    if (Platform.OS === 'ios') {
      candidates.push(`http://maps.apple.com/?daddr=${encodeURIComponent(destinationCoords)}`);
    } else if (Platform.OS === 'android') {
      candidates.push(`google.navigation:q=${encodeURIComponent(destinationCoords)}`);
    }

    candidates.push(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationCoords)}`,
    );
  } else if (destinationText) {
    candidates.push(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationText)}`,
    );
  } else {
    return false;
  }

  for (const url of candidates) {
    const supported = await Linking.canOpenURL(url).catch(() => false);

    if (!supported && !url.startsWith('http')) continue;

    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Try the next candidate.
    }
  }

  return false;
};
