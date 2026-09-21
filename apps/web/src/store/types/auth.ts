import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

/**
 * Authentication state. Persisted across sessions (see the auth slice).
 *
 * Auth is not built yet — there is no login API or token issuance. This shape
 * exists so the access token has a home the moment auth lands; `login` will
 * replace the whole state with the payload returned by the auth endpoint.
 */
export type AuthState = {
  accessToken?: string;
};

type AuthCaseReducer<T = void> = CaseReducer<AuthState, PayloadAction<T>>;

export type AuthCaseReducers = {
  login: AuthCaseReducer<AuthState>;
  logout: AuthCaseReducer;
};
