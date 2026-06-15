import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface ContestState {
  currentContest: any | null;
  userEntry: any | null;
  standings: any[];
  opponents: any[];
  history: any[];
  loading: boolean;
  skillCooldowns: Record<string, number>;
  activeBuffs: any[];
}

const initialState: ContestState = {
  currentContest: null,
  userEntry: null,
  standings: [],
  opponents: [],
  history: [],
  loading: false,
  skillCooldowns: {},
  activeBuffs: []
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

export const fetchOpponents = createAsyncThunk('contest/opponents', async () => {
  const response = await api.get('/contest/opponents');
  return response.data.opponents;
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
    },
    setSkillCooldown: (state, action) => {
      const { skillType, cooldownEnd } = action.payload;
      state.skillCooldowns[skillType] = cooldownEnd;
    },
    addBuff: (state, action) => {
      state.activeBuffs.push(action.payload);
    },
    clearExpiredBuffs: (state) => {
      const now = Date.now();
      state.activeBuffs = state.activeBuffs.filter((b: any) => b.endTime > now);
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
      })
      .addCase(fetchOpponents.fulfilled, (state, action) => {
        state.opponents = action.payload;
      })
      .addCase(applyContestSkill.fulfilled, (state, action: any) => {
        if (action.payload?.success) {
          const skillType = action.meta.arg.skillType;
          const cooldownEnd = Date.now() + (action.payload.cooldown || 30) * 1000;
          state.skillCooldowns[skillType] = cooldownEnd;
          
          if (skillType === 'focus_boost') {
            state.activeBuffs.push({
              type: 'focus_boost',
              endTime: Date.now() + (action.payload.duration || 10) * 1000
            });
          }
        }
      });
  }
});

export const { updateScore, updateStandings, setSkillCooldown, addBuff, clearExpiredBuffs } = contestSlice.actions;
export default contestSlice.reducer;
