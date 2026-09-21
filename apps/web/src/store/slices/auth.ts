import { createSlice } from '@reduxjs/toolkit';
import { persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import { AuthCaseReducers, AuthState } from '../types/auth';

const initialState: AuthState = {};

export const { actions, ...slice } = createSlice<AuthState, AuthCaseReducers, 'auth', {}>({
  name: 'auth',
  initialState,
  reducers: {
    login: (_state, { payload }) => payload,
    logout: () => initialState,
  },
});

/** Auth is persisted so a refresh keeps the session (once tokens are issued). */
export const reducer = persistReducer(
  {
    key: 'rms-auth',
    version: 1,
    storage,
  },
  slice.reducer,
);
