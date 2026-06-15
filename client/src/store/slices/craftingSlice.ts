import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface CraftingState {
  recipes: any[];
  materials: any[];
  detectors: any[];
  tasks: any[];
  loading: boolean;
  crafting: boolean;
  preview: any;
  previewLoading: boolean;
}

const initialState: CraftingState = {
  recipes: [],
  materials: [],
  detectors: [],
  tasks: [],
  loading: false,
  crafting: false,
  preview: null,
  previewLoading: false
};

export const fetchRecipes = createAsyncThunk('crafting/recipes', async () => {
  const response = await api.get('/crafting/recipes');
  return response.data.recipes;
});

export const fetchMaterials = createAsyncThunk('crafting/materials', async () => {
  const response = await api.get('/crafting/materials');
  return response.data.materials;
});

export const fetchDetectors = createAsyncThunk('crafting/detectors', async () => {
  const response = await api.get('/crafting/detectors');
  return response.data.detectors;
});

export const fetchTasks = createAsyncThunk('crafting/tasks', async () => {
  const response = await api.get('/crafting/tasks');
  return response.data.tasks;
});

export const startCrafting = createAsyncThunk(
  'crafting/start',
  async ({ recipeId, echosmithId, materials }: any) => {
    const response = await api.post('/crafting/start', { recipeId, echosmithId, materials });
    return response.data;
  }
);

export const previewCrafting = createAsyncThunk(
  'crafting/preview',
  async ({ recipeId, echosmithId, materials }: any) => {
    const response = await api.post('/crafting/preview', { recipeId, echosmithId, materials });
    return response.data;
  }
);

const craftingSlice = createSlice({
  name: 'crafting',
  initialState,
  reducers: {
    addCraftingTask: (state, action) => {
      state.tasks.unshift(action.payload);
    },
    completeCrafting: (state, action) => {
      const taskIndex = state.tasks.findIndex(t => t.id === action.payload.taskId);
      if (taskIndex >= 0) {
        state.tasks[taskIndex].status = 'completed';
      }
      if (action.payload.detector) {
        state.detectors.unshift(action.payload.detector);
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecipes.fulfilled, (state, action) => {
        state.recipes = action.payload;
      })
      .addCase(fetchMaterials.fulfilled, (state, action) => {
        state.materials = action.payload;
      })
      .addCase(fetchDetectors.fulfilled, (state, action) => {
        state.detectors = action.payload;
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.tasks = action.payload;
      })
      .addCase(startCrafting.pending, (state) => {
        state.crafting = true;
      })
      .addCase(startCrafting.fulfilled, (state) => {
        state.crafting = false;
      })
      .addCase(startCrafting.rejected, (state) => {
        state.crafting = false;
      })
      .addCase(previewCrafting.pending, (state) => {
        state.previewLoading = true;
      })
      .addCase(previewCrafting.fulfilled, (state, action) => {
        state.previewLoading = false;
        state.preview = action.payload;
      })
      .addCase(previewCrafting.rejected, (state) => {
        state.previewLoading = false;
      });
  }
});

export const { addCraftingTask, completeCrafting } = craftingSlice.actions;
export default craftingSlice.reducer;
