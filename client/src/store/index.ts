import { configureStore } from '@reduxjs/toolkit';
import playerReducer from './slices/playerSlice';
import workshopReducer from './slices/workshopSlice';
import craftingReducer from './slices/craftingSlice';
import contestReducer from './slices/contestSlice';
import marketReducer from './slices/marketSlice';
import guildReducer from './slices/guildSlice';

export const store = configureStore({
  reducer: {
    player: playerReducer,
    workshop: workshopReducer,
    crafting: craftingReducer,
    contest: contestReducer,
    market: marketReducer,
    guild: guildReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
