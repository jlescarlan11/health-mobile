import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  highContrastMode: boolean;
  language: 'en' | 'fil';
  specializedModes: {
    isSenior: boolean;
    isPWD: boolean;
    isChronic: boolean;
  };
}

const initialState: SettingsState = {
  theme: 'system',
  fontSize: 'medium',
  highContrastMode: false,
  language: 'en',
  specializedModes: {
    isSenior: false,
    isPWD: false,
    isChronic: false,
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<SettingsState['theme']>) => {
      state.theme = action.payload;
    },
    setFontSize: (state, action: PayloadAction<SettingsState['fontSize']>) => {
      state.fontSize = action.payload;
    },
    setHighContrastMode: (state, action: PayloadAction<boolean>) => {
      state.highContrastMode = action.payload;
    },
    setLanguage: (state, action: PayloadAction<SettingsState['language']>) => {
      state.language = action.payload;
    },
    toggleSpecializedMode: (
      state,
      action: PayloadAction<keyof SettingsState['specializedModes']>,
    ) => {
      // Safety guard to ensure specializedModes exists
      if (!state.specializedModes) {
        state.specializedModes = {
          isSenior: false,
          isPWD: false,
          isChronic: false,
        };
      }
      state.specializedModes = {
        ...state.specializedModes,
        [action.payload]: !state.specializedModes[action.payload],
      };
    },
  },
});

export const {
  setTheme,
  setFontSize,
  setHighContrastMode,
  setLanguage,
  toggleSpecializedMode,
} = settingsSlice.actions;
export default settingsSlice.reducer;
