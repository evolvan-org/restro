import { useDispatch } from 'react-redux';

import { AppDispatch } from '..';

/** Typed `useDispatch` — knows the store's thunk/action types. */
const useAppDispatch = () => useDispatch<AppDispatch>();

export default useAppDispatch;
