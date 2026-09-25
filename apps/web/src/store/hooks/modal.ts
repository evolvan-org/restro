import type { CreateStaffResponse, StaffAccount } from '@rms/api-contract';
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

/** Show a newly created staff account's one-time temporary password. */
export function useShowStaffTemporaryPasswordModal(): (created: CreateStaffResponse) => void {
  const showModal = useShowModal();
  return (created) => {
    showModal(ModalType.StaffTemporaryPassword, {
      name: created.account.name,
      email: created.account.email,
      temporaryPassword: created.temporaryPassword,
    });
  };
}

/** Ask to confirm activating or deactivating a staff account. */
export function useShowStaffStatusModal(): (account: StaffAccount) => void {
  const showModal = useShowModal();
  return (account) => {
    showModal(ModalType.StaffStatus, { account });
  };
}

/** Open the sample modal — the template for per-modal convenience hooks. */
export function useShowSampleModal() {
  const showModal = useShowModal();
  return () => showModal(ModalType.Sample, { title: 'Sample modal' });
}
