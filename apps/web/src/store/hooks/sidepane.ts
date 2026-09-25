import type { StaffAccount } from '@rms/api-contract';
import { useDispatch } from 'react-redux';

import { actions } from '../slices/sidepane';
import { SidePanePayload, SidePaneType } from '../types/sidepane';

import useStoreSelector from './useStoreSelector';

/** Open a side pane of `type`, passing it `payload`. */
export function useShowSidePane() {
  const dispatch = useDispatch();
  return (type: SidePaneType, payload: SidePanePayload = {}) =>
    dispatch(actions.showSidePane({ type, payload }));
}

/** Close the current side pane. */
export function useHideSidePane() {
  const dispatch = useDispatch();
  return () => dispatch(actions.hideSidePane());
}

export function useSidePaneType() {
  return useStoreSelector(({ sidepane }) => sidepane.type);
}

export function useSidePanePayload() {
  return useStoreSelector(({ sidepane }) => sidepane.payload);
}

/** Open the staff account form: pass an account to edit it, or nothing to create one. */
export function useShowStaffFormSidePane(): (account?: StaffAccount) => void {
  const showSidePane = useShowSidePane();
  return (account) => {
    showSidePane(SidePaneType.StaffForm, account ? { account } : {});
  };
}

/** Open the sample pane — the template for per-pane convenience hooks. */
export function useShowSampleSidePane() {
  const showSidePane = useShowSidePane();
  return () => showSidePane(SidePaneType.Sample, { title: 'Sample side pane' });
}
