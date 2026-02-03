const pad = (value: number) => String(value).padStart(2, '0');
const ISO_DOB_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DATE_PLACEHOLDER = 'YYYY-MM-DD';
export const DATE_FORMAT_EXAMPLE = 'YYYY-MM-DD';
export const MINIMUM_DOB_YEAR = 1900;

const digitsFromValue = (value: string) => value.replace(/\D/g, '').slice(0, 8);

export const formatDateOfBirthInput = (value: string): string => {
  const digits = digitsFromValue(value);
  if (!digits) return '';
  const parts: string[] = [];
  parts.push(digits.slice(0, Math.min(4, digits.length)));
  if (digits.length > 4) {
    parts.push(digits.slice(4, Math.min(6, digits.length)));
  }
  if (digits.length > 6) {
    parts.push(digits.slice(6));
  }
  return parts.filter(Boolean).join('-');
};

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const parseIsoDateString = (value: string): Date | null => {
  const match = ISO_DOB_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const getUtcDateParts = (date: Date) => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
});

export interface AgeDelta {
  years: number;
  months: number;
  days: number;
}

export const calculateAgeFromDate = (dob: Date, reference: Date = new Date()): AgeDelta => {
  const normalizedReference = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  );
  const dobParts = getUtcDateParts(dob);
  const refParts = getUtcDateParts(normalizedReference);

  let years = refParts.year - dobParts.year;
  let months = refParts.month - dobParts.month;
  let days = refParts.day - dobParts.day;

  if (days < 0) {
    months -= 1;
    const prevMonth = refParts.month - 1 || 12;
    const yearForPrevMonth = prevMonth === 12 ? refParts.year - 1 : refParts.year;
    days += daysInMonth(yearForPrevMonth, prevMonth);
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  return { years, months, days };
};

export const calculateAgeFromIso = (value: string, reference: Date = new Date()): AgeDelta | null => {
  const parsed = parseIsoDateString(value);
  if (!parsed) {
    return null;
  }
  return calculateAgeFromDate(parsed, reference);
};

export const formatAgeDescription = (age: AgeDelta): string => {
  if (age.years > 0) {
    return `${age.years} year${age.years === 1 ? '' : 's'}`;
  }
  if (age.months > 0) {
    return `${age.months} month${age.months === 1 ? '' : 's'}`;
  }
  return `${age.days} day${age.days === 1 ? '' : 's'}`;
};

export const formatIsoDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
};

export const formatIsoDateForDisplay = (value: string, reference: Date = new Date()): string => {
  if (!ISO_DOB_REGEX.test(value.trim())) {
    return value;
  }
  const parsed = parseIsoDateString(value);
  if (!parsed) {
    return value;
  }
  const age = calculateAgeFromDate(parsed, reference);
  return `${value} (${formatAgeDescription(age)})`;
};

export const isFutureDate = (date: Date, reference: Date = new Date()) =>
  date.getTime() > reference.getTime();

export const validateIsoDateValue = (value: string | null | undefined): string | null => {
  if (!value) {
    return `Enter a valid date (e.g. ${DATE_FORMAT_EXAMPLE}).`;
  }
  const trimmed = value.trim();
  if (!ISO_DOB_REGEX.test(trimmed)) {
    return `Enter a valid date (e.g. ${DATE_FORMAT_EXAMPLE}).`;
  }

  const parsed = parseIsoDateString(trimmed);
  if (!parsed) {
    return 'Enter a realistic calendar date.';
  }

  const year = parsed.getUTCFullYear();
  if (year < MINIMUM_DOB_YEAR) {
    return `Year must be ${MINIMUM_DOB_YEAR} or later.`;
  }

  if (isFutureDate(parsed)) {
    return 'Date of birth cannot be in the future.';
  }

  return null;
};

export const getIsoDigits = (value: string) => digitsFromValue(value);
