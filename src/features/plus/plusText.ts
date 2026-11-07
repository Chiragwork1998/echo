import type { TextStyle } from 'react-native';

export { supporting as small } from '@/features/tab-pages/textStyles';

/**
 * The paywall's second size: the goldens' supporting lines, which the onboarding subtitles also use
 * (docs/SPEC_CONFLICTS.md, C-12), in Inter Regular. Plan prices, the benefits and the inline notes.
 */
export const secondary: TextStyle = { fontSize: 14.1, lineHeight: 19 };
