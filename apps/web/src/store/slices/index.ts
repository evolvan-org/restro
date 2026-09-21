import { combineReducers } from '@reduxjs/toolkit';

import { reducer as auth } from './auth';
import { reducer as modal } from './modal';
import { reducer as sidepane } from './sidepane';

export const rootReducer = combineReducers({
  auth,
  modal,
  sidepane,
});

export type RootState = ReturnType<typeof rootReducer>;
