import { z } from 'zod';
import type { Facility, Medication } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return false;
};

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  if (hours < 0 || hours > 24) return undefined;
  if (minutes < 0 || minutes > 59) return undefined;
  if (hours === 24 && minutes !== 0) return undefined;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const emptySchedule = (): Record<number, { open: string; close: string } | null> => ({
  0: null,
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
});

const normalizeSchedule = (
  value: unknown,
): Record<number, { open: string; close: string } | null> | undefined => {
  if (!Array.isArray(value) && !isRecord(value)) return undefined;

  const schedule = emptySchedule();
  let hasAny = false;

  for (let day = 0; day <= 6; day += 1) {
    const rawEntry = Array.isArray(value) ? value[day] : (value[day] ?? value[String(day)]);

    if (rawEntry === null) {
      schedule[day] = null;
      hasAny = true;
      continue;
    }

    if (!isRecord(rawEntry)) {
      schedule[day] = null;
      continue;
    }

    const open = normalizeTime(rawEntry.open);
    const close = normalizeTime(rawEntry.close);
    if (!open || !close) {
      schedule[day] = null;
      continue;
    }

    schedule[day] = { open, close };
    hasAny = true;
  }

  return hasAny ? schedule : undefined;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const OperatingHoursInputSchema = z.object({
  is24x7: z.unknown().optional(),
  open: z.unknown().optional(),
  close: z.unknown().optional(),
  description: z.unknown().optional(),
  schedule: z.unknown().optional(),
});

const FacilityInputSchema = z
  .object({
    id: z.unknown(),
    name: z.unknown(),
    type: z.unknown().optional(),
    services: z.unknown().optional(),
    address: z.unknown().optional(),
    latitude: z.unknown(),
    longitude: z.unknown(),
    phone: z.unknown().optional(),
    contacts: z.unknown().optional(),
    yakapAccredited: z.unknown().optional(),
    hours: z.unknown().optional(),
    operatingHours: z.unknown().optional(),
    photoUrl: z.unknown().optional(),
    distance: z.unknown().optional(),
    specialized_services: z.unknown().optional(),
    is_24_7: z.unknown().optional(),
    lastUpdated: z.unknown().optional(),
  })
  .passthrough();

const normalizeOperatingHours = (
  value: unknown,
  is24x7Fallback: boolean,
): Facility['operatingHours'] | undefined => {
  if (!isRecord(value)) {
    if (is24x7Fallback) {
      return {
        is24x7: true,
        description: 'Open 24/7',
        schedule: {
          0: { open: '00:00', close: '23:59' },
          1: { open: '00:00', close: '23:59' },
          2: { open: '00:00', close: '23:59' },
          3: { open: '00:00', close: '23:59' },
          4: { open: '00:00', close: '23:59' },
          5: { open: '00:00', close: '23:59' },
          6: { open: '00:00', close: '23:59' },
        },
      };
    }

    return undefined;
  }

  const parsed = OperatingHoursInputSchema.safeParse(value);
  if (!parsed.success) return undefined;

  const is24x7 = coerceBoolean(parsed.data.is24x7) || is24x7Fallback;
  const open = normalizeTime(parsed.data.open);
  const close = normalizeTime(parsed.data.close);
  const description =
    typeof parsed.data.description === 'string' ? parsed.data.description : undefined;

  if (is24x7) {
    return {
      is24x7: true,
      description,
      schedule: {
        0: { open: '00:00', close: '23:59' },
        1: { open: '00:00', close: '23:59' },
        2: { open: '00:00', close: '23:59' },
        3: { open: '00:00', close: '23:59' },
        4: { open: '00:00', close: '23:59' },
        5: { open: '00:00', close: '23:59' },
        6: { open: '00:00', close: '23:59' },
      },
    };
  }

  const schedule = normalizeSchedule(parsed.data.schedule);

  return {
    is24x7: false,
    open,
    close,
    description,
    ...(schedule ? { schedule } : {}),
  };
};

export const normalizeFacility = (value: unknown): Facility | null => {
  const parsed = FacilityInputSchema.safeParse(value);
  if (!parsed.success) return null;

  const record = parsed.data;
  const id = typeof record.id === 'string' ? record.id.trim() : String(record.id ?? '').trim();
  const name =
    typeof record.name === 'string' ? record.name.trim() : String(record.name ?? '').trim();

  const latitude = coerceNumber(record.latitude);
  const longitude = coerceNumber(record.longitude);
  if (!id || !name || latitude === undefined || longitude === undefined) return null;

  const is24x7Flag = coerceBoolean(record.is_24_7);
  const yakapAccredited = coerceBoolean(record.yakapAccredited);

  const phone = typeof record.phone === 'string' ? record.phone.trim() : undefined;

  const contacts = Array.isArray(record.contacts)
    ? (record.contacts as Record<string, unknown>[]).map((c) => ({
        id: (c.id as string | undefined) ?? '',
        phoneNumber: c.phoneNumber as string,
        platform:
          (c.platform === 'viber' || c.platform === 'messenger' || c.platform === 'email'
            ? c.platform
            : 'phone') as any,
        teleconsultUrl: c.teleconsultUrl as string | undefined,
        contactName: c.contactName as string | undefined,
        role: c.role as string | undefined,
        facilityId: (c.facilityId as string | undefined) ?? '',
      }))
    : undefined;

  const hours = typeof record.hours === 'string' ? record.hours : undefined;
  const photoUrl = typeof record.photoUrl === 'string' ? record.photoUrl : undefined;
  const distance = coerceNumber(record.distance);
  const lastUpdated = coerceNumber(record.lastUpdated);

  const services = normalizeStringArray(record.services) as Facility['services'];
  const specialized_services = normalizeStringArray(record.specialized_services);

  const operatingHours = normalizeOperatingHours(record.operatingHours, is24x7Flag);

  const busyness_score = coerceNumber(record.busyness_score);
  let busyness: Facility['busyness'] = undefined;
  if (busyness_score !== undefined) {
    let status: 'quiet' | 'moderate' | 'busy' = 'quiet';
    if (busyness_score >= 0.7) status = 'busy';
    else if (busyness_score >= 0.4) status = 'moderate';
    busyness = { score: busyness_score, status };
  }

  return {
    id,
    name,
    type: typeof record.type === 'string' ? record.type : '',
    services,
    address: typeof record.address === 'string' ? record.address : '',
    latitude,
    longitude,
    ...(phone ? { phone } : {}),
    ...(contacts ? { contacts } : {}),
    yakapAccredited,
    ...(hours ? { hours } : {}),
    ...(operatingHours ? { operatingHours } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(distance === undefined ? {} : { distance }),
    ...(lastUpdated === undefined ? {} : { lastUpdated }),
    specialized_services,
    is_24_7: is24x7Flag,
    ...(busyness ? { busyness } : {}),
  };
};

const extractFacilitiesArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.facilities)) return data.facilities;
  return [];
};

export const normalizeFacilitiesApiResponse = (data: unknown) => {
  const rawFacilities = extractFacilitiesArray(data);
  const facilities = rawFacilities.map(normalizeFacility).filter((f): f is Facility => Boolean(f));
  const rejectedCount = rawFacilities.length - facilities.length;

  if (Array.isArray(data)) {
    return { data: facilities, facilities, rejectedCount };
  }

  if (isRecord(data) && Array.isArray(data.facilities)) {
    return { data: { ...data, facilities }, facilities, rejectedCount };
  }

  return { data: facilities, facilities, rejectedCount };
};

const MedicationInputSchema = z.object({
  id: z.unknown(),
  name: z.unknown(),
  dosage: z.unknown().optional(),
  scheduled_time: z.unknown().optional(),
  is_active: z.unknown().optional(),
  days_of_week: z.unknown().optional(),
});

export const normalizeMedication = (value: unknown): Medication | null => {
  const parsed = MedicationInputSchema.safeParse(value);
  if (!parsed.success) return null;

  const record = parsed.data;
  const id = typeof record.id === 'string' ? record.id.trim() : String(record.id ?? '').trim();
  const name =
    typeof record.name === 'string' ? record.name.trim() : String(record.name ?? '').trim();

  if (!id || !name) return null;

  const dosage = typeof record.dosage === 'string' ? record.dosage.trim() : '';
  const scheduled_time =
    typeof record.scheduled_time === 'string' ? normalizeTime(record.scheduled_time) || '' : '';
  const is_active = coerceBoolean(record.is_active ?? true);
  const days_of_week = normalizeStringArray(record.days_of_week);

  return {
    id,
    name,
    dosage,
    scheduled_time,
    is_active,
    days_of_week,
  };
};
