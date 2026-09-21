import { TypedUseSelectorHook, useSelector } from 'react-redux';

import { RootState } from '../slices';

/** Prefer this over the raw `useSelector` — it's typed against `RootState`. */
const useStoreSelector: TypedUseSelectorHook<RootState> = useSelector;

export default useStoreSelector;
