import type { CreateStaffResponse, DiningSection, StaffAccount } from '@rms/api-contract';
import { useDispatch } from 'react-redux';

import { actions } from '../slices/modal';
import { ModalPayload, ModalType } from '../types/modal';
import useStoreSelector from './useStoreSelector';

/** Open a modal of `type`, passing it `payload`. */
export function useShowModal() {
  const dispatch = useDispatch();
  return (type: ModalType, payload: ModalPayload = {}) =>
    dispatch(actions.showModal({ type, payload }));
}

/** Close the current modal. */
export function useHideModal() {
  const dispatch = useDispatch();
  return () => dispatch(actions.hideModal());
}

/** Reset modal state back to `None`. */
export function useResetModal() {
  const dispatch = useDispatch();
  return () => dispatch(actions.resetModal());
}

export function useModalType() {
  return useStoreSelector(({ modal }) => modal.type);
}

export function useModalPayload() {
  return useStoreSelector(({ modal }) => modal.payload);
}

/** Show the one-time temporary password after account creation or password regeneration. */
export function useShowStaffTemporaryPasswordModal(): (
  created: CreateStaffResponse,
  mode?: 'created' | 'regenerated',
) => void {
  const showModal = useShowModal();
  return (created, mode = 'created') => {
    showModal(ModalType.StaffTemporaryPassword, {
      name: created.account.name,
      email: created.account.email,
      temporaryPassword: created.temporaryPassword,
      mode,
    });
  };
}

/** Ask to confirm replacing a staff account's password. */
export function useShowStaffPasswordRegenerationModal(): (account: StaffAccount) => void {
  const showModal = useShowModal();
  return (account) => {
    showModal(ModalType.StaffPasswordRegeneration, { account });
  };
}

/** Ask to confirm activating or deactivating a staff account. */
export function useShowStaffStatusModal(): (account: StaffAccount) => void {
  const showModal = useShowModal();
  return (account) => {
    showModal(ModalType.StaffStatus, { account });
  };
}

/** Confirm archiving or reactivating a dining section. */
export function useShowDiningSectionActionModal(): (
  section: DiningSection,
  action: 'archive' | 'activate',
) => void {
  const showModal = useShowModal();
  return (section, action) => {
    showModal(ModalType.DiningSectionAction, { section, action });
  };
}

/** Open the sample modal — the template for per-modal convenience hooks. */
export function useShowSampleModal() {
  const showModal = useShowModal();
  return () => showModal(ModalType.Sample, { title: 'Sample modal' });
}
