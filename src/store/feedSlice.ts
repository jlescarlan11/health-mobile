import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { FeedItem } from '../types/feed';
import { healthFeedService } from '../services/healthFeedService';

interface FeedState {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  currentPage: number;
  hasMore: boolean;
}

const initialState: FeedState = {
  items: [],
  loading: false,
  error: null,
  lastUpdated: null,
  currentPage: 1,
  hasMore: true,
};

export const fetchFeed = createAsyncThunk(
  'feed/fetchFeed',
  async ({ page, pageSize }: { page: number; pageSize: number }, { rejectWithValue }) => {
    try {
      const results = await healthFeedService.fetchHealthFeed({ page, pageSize });
      return { items: results, page };
    } catch (error: unknown) {
      return rejectWithValue((error as Error).message || 'Failed to fetch health feed');
    }
  }
);

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    resetFeed: (state) => {
      state.items = [];
      state.currentPage = 1;
      state.hasMore = true;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeed.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeed.fulfilled, (state, action) => {
        state.loading = false;
        const items = action.payload.items || [];
        const page = action.payload.page;
        
        if (page === 1) {
          state.items = items;
        } else {
          // Append new items, avoiding duplicates
          const existingIds = new Set((state.items || []).map(i => i.id));
          const newItems = items.filter(i => !existingIds.has(i.id));
          state.items = [...(state.items || []), ...newItems];
        }

        state.currentPage = page;
        const requestedPageSize = action.meta.arg?.pageSize ?? items.length;
        state.hasMore = items.length >= requestedPageSize;
        state.lastUpdated = Date.now();
      })
      .addCase(fetchFeed.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, resetFeed } = feedSlice.actions;
export default feedSlice.reducer;
