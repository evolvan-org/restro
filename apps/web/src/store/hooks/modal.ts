import type {
  DiningSection,
  MenuCategory,
  MenuItem,
  Reservation,
  RestaurantTable,
  StaffAccount,
  TableStatus,
} from '@rms/api-contract';
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

/** Confirm resending an invitation or emailing a password-reset link. */
export function useShowStaffEmailActionModal(): (
  account: StaffAccount,
  action: 'resend-invite' | 'password-reset',
) => void {
  const showModal = useShowModal();
  return (account, action) => {
    showModal(ModalType.StaffEmailAction, { account, action });
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

/** Confirm deactivating or reactivating a menu category. */
export function useShowMenuCategoryStatusModal(): (
  category: MenuCategory,
  action: 'deactivate' | 'activate',
) => void {
  const showModal = useShowModal();
  return (category, action) => {
    showModal(ModalType.MenuCategoryStatus, { category, action });
  };
}

/** Confirm deactivating or reactivating a menu item. */
export function useShowMenuItemStatusModal(): (
  item: MenuItem,
  action: 'deactivate' | 'activate',
) => void {
  const showModal = useShowModal();
  return (item, action) => {
    showModal(ModalType.MenuItemStatus, { item, action });
  };
}

/** Ask to activate, deactivate, or archive a table status. */
export function useShowTableStatusActionModal(): (
  status: TableStatus,
  action: 'status' | 'archive',
) => void {
  const showModal = useShowModal();
  return (status, action) => {
    showModal(ModalType.TableStatusAction, { status, action });
  };
}

/** Ask to confirm activating or deactivating a restaurant table. */
export function useShowTableActiveModal(): (table: RestaurantTable) => void {
  const showModal = useShowModal();
  return (table) => {
    showModal(ModalType.TableActive, { table });
  };
}

/** Open the reservation cancellation form. */
export function useShowReservationCancelModal(): (reservation: Reservation) => void {
  const showModal = useShowModal();
  return (reservation) => {
    showModal(ModalType.ReservationCancel, { reservation });
  };
}

/** Open the sample modal — the template for per-modal convenience hooks. */
export function useShowSampleModal() {
  const showModal = useShowModal();
  return () => showModal(ModalType.Sample, { title: 'Sample modal' });
}
