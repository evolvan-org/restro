import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

/**
 * Every modal the app can show is a member of this enum. `None` (0, falsy)
 * means "no modal open". Add one entry per modal, then map it to a component
 * in `components/AppLayout/ModalDialog`.
 *
 * @example
 *   ConfirmDelete,
 *   EditProfile,
 */
export enum ModalType {
  None,
  Sample,
}

/**
 * Props passed to the currently open modal. As modals are added, widen this to
 * a discriminated union of each modal's props (see Yoho's `ModalPayload`), so
 * `showModal(type, payload)` is type-checked against the component it renders.
 */
export type ModalPayload = Record<string, unknown>;

export type ModalState = {
  type: ModalType;
  payload: ModalPayload;
};

type ModalCaseReducer<T = void> = CaseReducer<ModalState, PayloadAction<T>>;

export type ModalCaseReducers = {
  showModal: ModalCaseReducer<ModalState>;
  hideModal: ModalCaseReducer;
  resetModal: ModalCaseReducer;
};
