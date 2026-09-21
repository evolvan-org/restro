import { createSlice } from '@reduxjs/toolkit';

import { SidePaneCaseReducers, SidePaneState, SidePaneType } from '../types/sidepane';

const initialState: SidePaneState = {
  type: SidePaneType.None,
  payload: {},
};

/**
 * UI state — not persisted (same rationale as the modal slice).
 */
export const { actions, reducer, ...slice } = createSlice<
  SidePaneState,
  SidePaneCaseReducers,
  'sidepane',
  {}
>({
  name: 'sidepane',
  initialState,
  reducers: {
    showSidePane: (_state, { payload }) => payload,
    hideSidePane: () => initialState,
  },
});
