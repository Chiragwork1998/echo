import { useLayoutEffect } from 'react';
import { Modal, type ModalProps } from 'react-native';

import { openOwnWindow } from '@/state/ownWindows';

/**
 * React Native's Modal, counted as one of ECHO's own windows while it is visible, so that Android's
 * 'blur' as it opens does not raise the privacy cover over the page behind it (state/ownWindows).
 * The count goes up in a layout effect: native code shows the window, and reports the focus it
 * took, only after the commit. Use it for every Modal in the app.
 */
export function EchoModal(props: ModalProps) {
  // A Modal is visible unless told otherwise.
  const visible = props.visible ?? true;
  useLayoutEffect(() => (visible ? openOwnWindow() : undefined), [visible]);
  return <Modal {...props} />;
}
