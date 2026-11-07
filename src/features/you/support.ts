import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { links } from '@/config/links';

import { youCopy } from './youCopy';

/** The support address, from src/config/links.ts (a placeholder until the lead replaces it). */
export const SUPPORT_EMAIL = links.supportEmail;

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

/** Opens one of ECHO's pages in the browser. false when nothing could open it. */
export async function openPage(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
