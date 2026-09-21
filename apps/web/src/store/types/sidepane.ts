import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

/**
 * Every side pane the app can show is a member of this enum. `None` (0, falsy)
 * means "no pane open". Add one entry per pane, then map it to a component in
 * `components/AppLayout/SidePane`.
 *
 * @example
 *   MenuItemForm,
 *   ReservationDetails,
 */
export enum SidePaneType {
  None,
  Sample,
}

/**
 * Props passed to the currently open side pane. As panes are added, widen this
 * to a discriminated union of each pane's props (see Yoho's `SidePanePayload`).
 */
export type SidePanePayload = Record<string, unknown>;

export type SidePaneState = {
  type: SidePaneType;
  payload: SidePanePayload;
};

type SidePaneCaseReducer<T = void> = CaseReducer<SidePaneState, PayloadAction<T>>;

export type SidePaneCaseReducers = {
  showSidePane: SidePaneCaseReducer<SidePaneState>;
  hideSidePane: SidePaneCaseReducer;
};
