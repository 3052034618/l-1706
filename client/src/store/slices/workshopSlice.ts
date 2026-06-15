import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface WorkshopState {
  workshop: any | null;
  echosmiths: any[];
  loading: boolean;
  error: string | null;
}

const initialState: WorkshopState = {
  workshop: null,
  echosmiths: [],
  loading: false,
  error: null
};

export const fetchWorkshop = createAsyncThunk('workshop/fetch', async () => {
  const response = await api.get('/workshop');
  return response.data;
});

export const createWorkshop = createAsyncThunk('workshop/create', async (name: string) => {
  const response = await api.post('/workshop/create', { name });
  return response.data;
});

export const upgradeWorkshop = createAsyncThunk('workshop/upgrade', async () => {
  const response = await api.post('/workshop/upgrade');
  return response.data;
});

export const recruitEchosmith = createAsyncThunk('workshop/recruit', async (name: string) => {
  const response = await api.post('/workshop/echosmiths/recruit', { name });
  return response.data;
});

export const promoteEchosmith = createAsyncThunk(
  'workshop/promote',
  async ({ id, skillType }: { id: string; skillType: string }) => {
    const response = await api.post(`/workshop/echosmiths/${id}/promote`, { skillType });
    return response.data;
  }
);

const workshopSlice = createSlice({
  name: 'workshop',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkshop.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchWorkshop.fulfilled, (state, action) => {
        state.loading = false;
        state.workshop = action.payload.workshop;
        state.echosmiths = action.payload.echosmiths || [];
      })
      .addCase(fetchWorkshop.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || null;
      });
  }
});

export default workshopSlice.reducer;
