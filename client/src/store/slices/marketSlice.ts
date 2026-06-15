import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

interface MarketState {
  listings: any[];
  myListings: any[];
  transactions: any[];
  soundTide: any | null;
  loading: boolean;
  total: number;
}

const initialState: MarketState = {
  listings: [],
  myListings: [],
  transactions: [],
  soundTide: null,
  loading: false,
  total: 0
};

export const fetchListings = createAsyncThunk(
  'market/listings',
  async ({ type = 'all', page = 1, sort = 'price' }: any = {}) => {
    const response = await api.get('/market/listings', { params: { type, page, sort } });
    return response.data;
  }
);

export const fetchMyListings = createAsyncThunk('market/myListings', async () => {
  const response = await api.get('/market/my-listings');
  return response.data.listings;
});

export const createListing = createAsyncThunk(
  'market/createListing',
  async ({ itemType, itemId, price, itemData }: any) => {
    const response = await api.post('/market/list', { itemType, itemId, price, itemData });
    return response.data;
  }
);

export const cancelListing = createAsyncThunk('market/cancelListing', async (listingId: string) => {
  const response = await api.post(`/market/cancel/${listingId}`);
  return response.data;
});

export const buyListing = createAsyncThunk('market/buyListing', async (listingId: string) => {
  const response = await api.post(`/market/buy/${listingId}`);
  return response.data;
});

export const fetchSoundTide = createAsyncThunk('market/soundTide', async () => {
  const response = await api.get('/market/sound-tide');
  return response.data;
});

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    addListing: (state, action) => {
      state.listings.unshift(action.payload);
    },
    removeListing: (state, action) => {
      state.listings = state.listings.filter(l => l.id !== action.payload);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchListings.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchListings.fulfilled, (state, action) => {
        state.loading = false;
        state.listings = action.payload.listings;
        state.total = action.payload.total;
      })
      .addCase(fetchMyListings.fulfilled, (state, action) => {
        state.myListings = action.payload;
      })
      .addCase(fetchSoundTide.fulfilled, (state, action) => {
        state.soundTide = action.payload;
      });
  }
});

export const { addListing, removeListing } = marketSlice.actions;
export default marketSlice.reducer;
