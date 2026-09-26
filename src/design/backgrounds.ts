import type { ImageSourcePropType } from 'react-native';

import type { EchoThemeName } from './themes';

/**
 * Routes that have landed so far. Extend from
 * `product-handoff/data/screen-manifest.json` as each screen is implemented;
 * plate numbering there is authoritative (`00-landing`, `01-intent`, ...).
 */
export type ImplementedScreenId = 'landing' | 'intent';

/** Exact Day and Night plates per screen; geometry is shared between themes. */
export const screenBackgrounds: Record<
  EchoThemeName,
  Record<ImplementedScreenId, ImageSourcePropType>
> = {
  day: {
    landing: require('../../assets/echo/backgrounds/day/00-landing.png'),
    intent: require('../../assets/echo/backgrounds/day/01-intent.png'),
  },
  night: {
    landing: require('../../assets/echo/backgrounds/night/00-landing.png'),
    intent: require('../../assets/echo/backgrounds/night/01-intent.png'),
  },
};
