const PHONE_SEGMENT_ENDS = [3, 6, 10];

export const PHILIPPINES_COUNTRY_CODE = '+63';
export const MAX_PHILIPPINES_PHONE_DIGITS = 10;
export const PHILIPPINES_PHONE_PLACEHOLDER = '9xx xxx xxxx';

export const sanitizePhilippinesPhoneInput = (value: string): string =>
  value.replace(/\D/g, '').slice(0, MAX_PHILIPPINES_PHONE_DIGITS);

export const formatPhilippinesPhoneNumber = (digits: string): string => {
  const cleaned = digits.slice(0, MAX_PHILIPPINES_PHONE_DIGITS);
  if (!cleaned) {
    return '';
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const segmentEnd of PHONE_SEGMENT_ENDS) {
    if (cursor >= cleaned.length) {
      break;
    }
    const segment = cleaned.slice(cursor, segmentEnd);
    if (segment.length) {
      parts.push(segment);
    }
    cursor = segmentEnd;
  }

  return parts.join(' ');
};
