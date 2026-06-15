import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface GuildState {
  guild: any | null;
  members: any[];
  tower: any | null;
  guilds: any[];
  loading: boolean;
  isMember: boolean;
}

const initialState: GuildState = {
  guild: null,
  members: [],
  tower: null,
  guilds: [],
  loading: false,
  isMember: false
};

export const fetchGuild = createAsyncThunk('guild/fetch', async () => {
  const response = await api.get('/guild');
  return response.data;
});

export const fetchGuildList = createAsyncThunk(
  'guild/list',
  async ({ page = 1, sort = 'level' }: any = {}) => {
    const response = await api.get('/guild/list', { params: { page, sort } });
    return response.data;
  }
);

export const createGuild = createAsyncThunk('guild/create', async (name: string) => {
  const response = await api.post('/guild/create', { name });
  return response.data;
});

export const joinGuild = createAsyncThunk('guild/join', async (guildId: string) => {
  const response = await api.post(`/guild/join/${guildId}`);
  return response.data;
});

export const leaveGuild = createAsyncThunk('guild/leave', async () => {
  const response = await api.post('/guild/leave');
  return response.data;
});

export const contributeGuild = createAsyncThunk(
  'guild/contribute',
  async ({ amount, type = 'gold' }: { amount: number; type?: string }) => {
    const response = await api.post('/guild/contribute', { amount, type });
    return response.data;
  }
);

export const upgradeTower = createAsyncThunk('guild/upgradeTower', async () => {
  const response = await api.post('/guild/tower/upgrade');
  return response.data;
});

const guildSlice = createSlice({
  name: 'guild',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGuild.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGuild.fulfilled, (state, action) => {
        state.loading = false;
        state.guild = action.payload.guild;
        state.members = action.payload.members || [];
        state.tower = action.payload.tower;
        state.isMember = action.payload.isMember;
      })
      .addCase(fetchGuildList.fulfilled, (state, action) => {
        state.guilds = action.payload.guilds || [];
      });
  }
});

export default guildSlice.reducer;
