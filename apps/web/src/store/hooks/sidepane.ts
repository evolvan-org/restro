import type { DiningSection, RestaurantTable, StaffAccount, TableStatus } from '@rms/api-contract';
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

/** Open the dining-section form: pass a section to edit it, or nothing to create one. */
export function useShowDiningSectionFormSidePane(): (section?: DiningSection) => void {
  const showSidePane = useShowSidePane();
  return (section) => {
    showSidePane(SidePaneType.DiningSectionForm, section ? { section } : {});
  };
}

/** Open the table-status form: pass a status to edit it, or nothing to create one. */
export function useShowTableStatusFormSidePane(): (status?: TableStatus) => void {
  const showSidePane = useShowSidePane();
  return (status) => {
    showSidePane(SidePaneType.TableStatusForm, status ? { status } : {});
  };
}

/** Open the restaurant table form: pass a table to edit it, or nothing to create one. */
export function useShowTableFormSidePane(): (table?: RestaurantTable) => void {
  const showSidePane = useShowSidePane();
  return (table) => {
    showSidePane(SidePaneType.TableForm, table ? { table } : {});
  };
}

/** Open the sample pane — the template for per-pane convenience hooks. */
export function useShowSampleSidePane() {
  const showSidePane = useShowSidePane();
  return () => showSidePane(SidePaneType.Sample, { title: 'Sample side pane' });
}
