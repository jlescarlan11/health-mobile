import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ProfileState {
  fullName: string | null;
  /** @deprecated Use for cloud sync/future features only; currently unmanaged in UI */
  username: string | null;
  /** @deprecated Use for cloud sync/future features only; currently unmanaged in UI */
  phoneNumber: string | null;
  dob: string | null;
  sex: string | null;
  bloodType: string | null;
  philHealthId: string | null;
  chronicConditions: string[];
  allergies: string[];
  surgicalHistory: string | null;
  familyHistory: string | null;
}

const initialState: ProfileState = {
  fullName: null,
  username: null,
  phoneNumber: null,
  dob: null,
  sex: null,
  bloodType: null,
  philHealthId: null,
  chronicConditions: [],
  allergies: [],
  surgicalHistory: null,
  familyHistory: null,
};

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    updateProfile: (state, action: PayloadAction<Partial<ProfileState>>) => {
      Object.assign(state, action.payload);
    },
    setFullName: (state, action: PayloadAction<string | null>) => {
      state.fullName = action.payload;
    },
    /** @deprecated */
    setUsername: (state, action: PayloadAction<string | null>) => {
      state.username = action.payload;
    },
    /** @deprecated */
    setPhoneNumber: (state, action: PayloadAction<string | null>) => {
      state.phoneNumber = action.payload;
    },
    setDob: (state, action: PayloadAction<string | null>) => {
      state.dob = action.payload;
    },
    setSex: (state, action: PayloadAction<string | null>) => {
      state.sex = action.payload;
    },
    setBloodType: (state, action: PayloadAction<string | null>) => {
      state.bloodType = action.payload;
    },
    setPhilHealthId: (state, action: PayloadAction<string | null>) => {
      state.philHealthId = action.payload;
    },
    setChronicConditions: (state, action: PayloadAction<string[]>) => {
      state.chronicConditions = action.payload;
    },
    addChronicCondition: (state, action: PayloadAction<string>) => {
      const condition = action.payload.trim();
      if (condition && !state.chronicConditions.includes(condition)) {
        state.chronicConditions.push(condition);
      }
    },
    removeChronicCondition: (state, action: PayloadAction<string>) => {
      state.chronicConditions = state.chronicConditions.filter((c) => c !== action.payload);
    },
    setAllergies: (state, action: PayloadAction<string[]>) => {
      state.allergies = action.payload;
    },
    addAllergy: (state, action: PayloadAction<string>) => {
      const allergy = action.payload.trim();
      if (allergy && !state.allergies.includes(allergy)) {
        state.allergies.push(allergy);
      }
    },
    removeAllergy: (state, action: PayloadAction<string>) => {
      state.allergies = state.allergies.filter((a) => a !== action.payload);
    },
    setSurgicalHistory: (state, action: PayloadAction<string | null>) => {
      state.surgicalHistory = action.payload;
    },
    setFamilyHistory: (state, action: PayloadAction<string | null>) => {
      state.familyHistory = action.payload;
    },
    clearProfile: (state) => {
      state.fullName = null;
      state.username = null;
      state.phoneNumber = null;
      state.dob = null;
      state.sex = null;
      state.bloodType = null;
      state.chronicConditions = [];
      state.allergies = [];
      state.surgicalHistory = null;
      state.familyHistory = null;
    },
  },
});

export const {
  updateProfile,
  setFullName,
  setUsername,
  setPhoneNumber,
  setDob,
  setSex,
  setBloodType,
  setPhilHealthId,
  setChronicConditions,
  addChronicCondition,
  removeChronicCondition,
  setAllergies,
  addAllergy,
  removeAllergy,
  setSurgicalHistory,
  setFamilyHistory,
  clearProfile,
} = profileSlice.actions;
export default profileSlice.reducer;

const parseAge = (dob: string | null): number | null => {
  if (!dob) return null;
  const birthday = new Date(dob);
  if (Number.isNaN(birthday.getTime())) return null;
  const today = new Date();
  const age = today.getFullYear() - birthday.getFullYear();
  return age >= 0 ? age : null;
};

const formatList = (values: string[]): string | null => {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : null;
};

const normalizeText = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const extractFirstName = (fullName?: string | null): string | null => {
  const normalized = fullName?.trim();
  if (!normalized) return null;
  const [firstName] = normalized.split(/\s+/).filter(Boolean);
  return firstName || null;
};

const buildClinicalSegments = (profile: ProfileState): string[] => {
  const segments: string[] = [];

  const age = parseAge(profile.dob);
  if (age !== null) segments.push(`Age: ${age}`);

  const sex = normalizeText(profile.sex);
  if (sex) segments.push(`Sex: ${sex}`);

  const blood = normalizeText(profile.bloodType);
  if (blood) segments.push(`Blood: ${blood}`);

  const cond = formatList(profile.chronicConditions);
  if (cond) segments.push(`Cond: ${cond}`);

  const allergies = formatList(profile.allergies);
  if (allergies) segments.push(`Allergies: ${allergies}`);

  const surg = normalizeText(profile.surgicalHistory);
  if (surg) segments.push(`Surg: ${surg}`);

  const fam = normalizeText(profile.familyHistory);
  if (fam) segments.push(`FamHx: ${fam}`);

  return segments;
};

export const selectClinicalContext = createSelector(
  (state: { profile: ProfileState }) => state.profile,
  (profile) => {
    const segments = buildClinicalSegments(profile);
    if (!segments.length) return null;
    return segments.join('. ');
  },
);

export const selectFullName = (state: { profile: ProfileState }) => state.profile.fullName;

export const selectProfileDob = (state: { profile: ProfileState }) => state.profile.dob;
export const selectFirstName = createSelector(
  (state: { profile: ProfileState }) => state.profile.fullName,
  (fullName) => extractFirstName(fullName),
);
