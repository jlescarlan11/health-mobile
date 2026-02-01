import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { clearStoredAuthToken, getStoredAuthToken } from '../services/authSession';
import { clearProfile } from './profileSlice';
import type { AuthUser } from '../types/auth';

type AuthStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  isSessionLoaded: boolean;
}

const initialState: AuthState = {
  token: null,
  user: null,
  status: 'idle',
  error: null,
  isSessionLoaded: false,
};

export const loadStoredAuthToken = createAsyncThunk('auth/loadStoredAuthToken', async () => {
  const token = await getStoredAuthToken();
  return token;
});

export const signOutAsync = createAsyncThunk('auth/signOut', async (_, { dispatch }) => {
  await clearStoredAuthToken();
  dispatch(clearProfile());
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
      if (!action.payload) {
        state.user = null;
      }
      state.status = action.payload ? 'succeeded' : 'idle';
      state.error = null;
    },
    setAuthUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    setAuthLoading(state) {
      state.status = 'loading';
      state.error = null;
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.status = action.payload ? 'failed' : 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadStoredAuthToken.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadStoredAuthToken.fulfilled, (state, action) => {
        state.token = action.payload;
        if (!action.payload) {
          state.user = null;
        }
        state.status = action.payload ? 'succeeded' : 'idle';
        state.error = null;
        state.isSessionLoaded = true;
      })
      .addCase(loadStoredAuthToken.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error?.message || 'Unable to read stored authentication token';
        state.isSessionLoaded = true;
      })
      .addCase(signOutAsync.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signOutAsync.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error?.message || 'Unable to sign out';
      })
      .addCase(signOutAsync.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.status = 'idle';
        state.error = null;
        state.isSessionLoaded = true;
      });
  },
});

export const { setAuthToken, setAuthUser, setAuthLoading, setAuthError } = authSlice.actions;
export default authSlice.reducer;
export type { AuthState };
