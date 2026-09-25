'use client';

import { Fragment, type ComponentType } from 'react';

import SampleModal from '@/components/Modals/SampleModal';
import StaffStatusModal from '@/components/Modals/StaffStatusModal';
import StaffTemporaryPasswordModal from '@/components/Modals/StaffTemporaryPasswordModal';
import { useModalPayload, useModalType } from '@/store/hooks/modal';
import { ModalType } from '@/store/types/modal';

/**
 * Maps each `ModalType` to the component that renders it. Add an entry here
 * when you add a modal — the container looks it up by the type in Redux and
 * renders it with the payload from `showModal(type, payload)`. Each modal is
 * self-contained: it renders its own `<Dialog>` and animates itself via the
 * Headless UI `transition` prop.
 */
const MODALS: Partial<Record<ModalType, ComponentType<any>>> = {
  [ModalType.None]: Fragment,
  [ModalType.Sample]: SampleModal,
  [ModalType.StaffTemporaryPassword]: StaffTemporaryPasswordModal,
  [ModalType.StaffStatus]: StaffStatusModal,
};

/** Single mount point for every modal, driven by the `modal` slice. */
export default function ModalDialog() {
  const modalType = useModalType();
  const modalPayload = useModalPayload();

  const CurrentModal = MODALS[modalType];
  if (!CurrentModal || CurrentModal === Fragment) return null;

  return <CurrentModal {...modalPayload} />;
}
