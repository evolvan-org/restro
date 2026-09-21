import { createSlice } from '@reduxjs/toolkit';

import { ModalCaseReducers, ModalState, ModalType } from '../types/modal';

const initialState: ModalState = {
  type: ModalType.None,
  payload: {},
};

/**
 * UI state — not persisted. A modal open on refresh would have no context to
 * render against, so the slice resets to `None` every session.
 */
export const { actions, reducer, ...slice } = createSlice<
  ModalState,
  ModalCaseReducers,
  'modal',
  {}
>({
  name: 'modal',
  initialState,
  reducers: {
    showModal: (_state, { payload }) => payload,
    hideModal: () => initialState,
    resetModal: () => initialState,
  },
});
