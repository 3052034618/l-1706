import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface PlayerState {
  data: any | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: PlayerState = {
  data: null,
  isLoggedIn: !!localStorage.getItem('token'),
  loading: false,
  error: null
};

export const login = createAsyncThunk(
  'player/login',
  async ({ username, password }: { username: string; password: string }) => {
    const response = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', response.data.token);
    return response.data;
  }
);

export const register = createAsyncThunk(
  'player/register',
  async ({ username, password, nickname }: { username: string; password: string; nickname?: string }) => {
    const response = await api.post('/auth/register', { username, password, nickname });
    localStorage.setItem('token', response.data.token);
    return response.data;
  }
);

export const fetchPlayerData = createAsyncThunk('player/fetchData', async () => {
  const response = await api.get('/auth/me');
  return response.data;
});

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    logout: (state) => {
      state.data = null;
      state.isLoggedIn = false;
      localStorage.removeItem('token');
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isLoggedIn = true;
        state.data = action.payload.player;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '登录失败';
      })
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.isLoggedIn = true;
        state.data = {
          id: action.payload.playerId,
          username: action.payload.username,
          nickname: action.payload.nickname
        };
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '注册失败';
      })
      .addCase(fetchPlayerData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPlayerData.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.player;
        state.isLoggedIn = true;
      })
      .addCase(fetchPlayerData.rejected, (state) => {
        state.loading = false;
        state.isLoggedIn = false;
        localStorage.removeItem('token');
      });
  }
});

export const { logout } = playerSlice.actions;
export default playerSlice.reducer;
