import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { youCopy } from './youCopy';

/**
 * PLACEHOLDER. The support address is not decided. It is the only place it appears, on a reserved
 * `.example` domain that can never be delivered to anyone. Replace it before release.
 */
export const SUPPORT_EMAIL = 'support@echo.example';

export const APP_VERSION = Constants.expoConfig?.version ?? '';

/**
 * Opens the person's own email app on a blank message. There is no body parameter, deliberately:
 * nothing from the journal, and nothing else, is ever put in it (PRODUCT_REQUIREMENTS: support
 * never attaches entries automatically).
 */
export const supportUrl = () =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(youCopy.supportSubject)}`;

export async function openSupport(): Promise<boolean> {
  try {
    await Linking.openURL(supportUrl());
    return true;
  } catch {
    return false;
  }
}
