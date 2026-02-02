import axios from 'axios';
import { API_URL } from './apiConfig';
import type { AuthUser, SexAtBirth } from '../types/auth';

export interface ProfileServiceHealth {
  id: string;
  chronicConditions: string[];
  allergies: string[];
  currentMedications: string[];
  surgicalHistory: string | null;
  familyHistory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileServiceResponse {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  sexAtBirth: SexAtBirth;
  createdAt: string;
  updatedAt: string;
  healthProfile: ProfileServiceHealth | null;
}

export interface ProfileSyncPayload {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  sexAtBirth?: SexAtBirth | null;
  chronicConditions?: string[];
  allergies?: string[];
  surgicalHistory?: string | null;
  familyHistory?: string | null;
}

export interface ProfileSyncInput {
  profile: {
    fullName?: string | null;
    dob?: string | null;
    sex?: string | null;
    chronicConditions: string[];
    allergies: string[];
    surgicalHistory?: string | null;
    familyHistory?: string | null;
  };
  authUser?: AuthUser | null;
}

const SEX_AT_BIRTH_OPTIONS: SexAtBirth[] = ['male', 'female', 'intersex', 'not_specified'];

const normalizeSexAtBirth = (value?: string | null): SexAtBirth | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (SEX_AT_BIRTH_OPTIONS.includes(normalized as SexAtBirth)) {
    return normalized as SexAtBirth;
  }
  return undefined;
};

const splitFullName = (value?: string | null) => {
  if (!value) {
    return { firstName: undefined, lastName: undefined };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { firstName: undefined, lastName: undefined };
  }
  const segments = trimmed.split(/\s+/);
  const [firstName, ...rest] = segments;
  return {
    firstName,
    lastName: rest.length ? rest.join(' ') : undefined,
  };
};

export const buildProfilePayload = ({ profile, authUser }: ProfileSyncInput): ProfileSyncPayload => {
  const { firstName, lastName } = splitFullName(profile.fullName);
  const sexFromProfile = normalizeSexAtBirth(profile.sex);
  const sex = sexFromProfile ?? authUser?.sexAtBirth;

  return {
    firstName: firstName ?? authUser?.firstName ?? undefined,
    lastName: lastName ?? authUser?.lastName ?? undefined,
    dateOfBirth: profile.dob ?? authUser?.dateOfBirth ?? undefined,
    sexAtBirth: sex ?? undefined,
    chronicConditions: profile.chronicConditions,
    allergies: profile.allergies,
    surgicalHistory: profile.surgicalHistory ?? null,
    familyHistory: profile.familyHistory ?? null,
  };
};

export const fetchUserProfile = async (): Promise<ProfileServiceResponse> => {
  const response = await axios.get(`${API_URL}/profile`);
  return response.data;
};

export const saveUserProfile = async (payload: ProfileSyncPayload): Promise<ProfileServiceResponse> => {
  const response = await axios.put(`${API_URL}/profile`, payload, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
};
