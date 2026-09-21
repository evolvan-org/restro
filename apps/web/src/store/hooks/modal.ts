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

/** Open the sample modal — the template for per-modal convenience hooks. */
export function useShowSampleModal() {
  const showModal = useShowModal();
  return () => showModal(ModalType.Sample, { title: 'Sample modal' });
}
