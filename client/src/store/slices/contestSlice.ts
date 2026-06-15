import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface ContestState {
  currentContest: any | null;
  userEntry: any | null;
  standings: any[];
  history: any[];
  loading: boolean;
}

const initialState: ContestState = {
  currentContest: null,
  userEntry: null,
  standings: [],
  history: [],
  loading: false
};

export const fetchCurrentContest = createAsyncThunk('contest/current', async () => {
  const response = await api.get('/contest/current');
  return response.data;
});

export const joinContest = createAsyncThunk('contest/join', async (detectorId: string) => {
  const response = await api.post('/contest/join', { detectorId });
  return response.data;
});

export const applyContestSkill = createAsyncThunk(
  'contest/skill',
  async ({ skillType, targetEntryId }: { skillType: string; targetEntryId?: string }) => {
    const response = await api.post('/contest/skill', { skillType, targetEntryId });
    return response.data;
  }
);

export const fetchContestHistory = createAsyncThunk('contest/history', async () => {
  const response = await api.get('/contest/history');
  return response.data.history;
});

const contestSlice = createSlice({
  name: 'contest',
  initialState,
  reducers: {
    updateScore: (state, action) => {
      if (state.userEntry && action.payload.entryId === state.userEntry.id) {
        state.userEntry.score = action.payload.score;
        state.userEntry.current_intensity = action.payload.intensity;
      }
    },
    updateStandings: (state, action) => {
      state.standings = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentContest.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCurrentContest.fulfilled, (state, action) => {
        state.loading = false;
        state.currentContest = action.payload.contest;
        state.userEntry = action.payload.userEntry;
        state.standings = action.payload.standings || [];
      })
      .addCase(fetchContestHistory.fulfilled, (state, action) => {
        state.history = action.payload;
      });
  }
});

export const { updateScore, updateStandings } = contestSlice.actions;
export default contestSlice.reducer;
