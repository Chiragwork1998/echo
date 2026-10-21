import type { ImageSourcePropType } from 'react-native';

import type { EchoThemeName } from './themes';

/**
 * Routes that have landed so far. Extend from
 * `product-handoff/data/screen-manifest.json` as each screen is implemented;
 * plate numbering there is authoritative (`00-landing`, `01-intent`, ...).
 */
export type ImplementedScreenId =
  | 'landing'
  | 'intent'
  | 'horizon'
  | 'voice'
  | 'rhythm'
  | 'privacy'
  | 'arrival'
  | 'first-echo'
  | 'completion'
  | 'home';

/**
 * Validated production plates are authored at 1290 x 2796 (9:19.5).
 * They must be rendered centered with aspect-fill and no additional grade.
 */
export const PLATE_SIZE = { width: 1290, height: 2796 } as const;

/** Focal points from `product-handoff/data/screen-manifest.json`. */
export const screenFocalPoints: Record<ImplementedScreenId, { x: number; y: number }> = {
  landing: { x: 0.5, y: 0.56 },
  intent: { x: 0.53, y: 0.55 },
  horizon: { x: 0.5, y: 0.53 },
  voice: { x: 0.5, y: 0.58 },
  rhythm: { x: 0.55, y: 0.5 },
  privacy: { x: 0.5, y: 0.46 },
  arrival: { x: 0.5, y: 0.62 },
  'first-echo': { x: 0.55, y: 0.54 },
  completion: { x: 0.55, y: 0.48 },
  home: { x: 0.54, y: 0.42 },
};

/** Exact Day and Night plates per screen; geometry is shared between themes. */
export const screenBackgrounds: Record<
  EchoThemeName,
  Record<ImplementedScreenId, ImageSourcePropType>
> = {
  day: {
    landing: require('../../assets/echo/backgrounds/day/00-landing.png'),
    intent: require('../../assets/echo/backgrounds/day/01-intent.png'),
    horizon: require('../../assets/echo/backgrounds/day/02-horizon.png'),
    voice: require('../../assets/echo/backgrounds/day/03-voice.png'),
    rhythm: require('../../assets/echo/backgrounds/day/04-rhythm.png'),
    privacy: require('../../assets/echo/backgrounds/day/05-privacy.png'),
    arrival: require('../../assets/echo/backgrounds/day/06-arrival.png'),
    'first-echo': require('../../assets/echo/backgrounds/day/07-first-echo.png'),
    completion: require('../../assets/echo/backgrounds/day/08-completion.png'),
    home: require('../../assets/echo/backgrounds/day/09-home.png'),
  },
  night: {
    landing: require('../../assets/echo/backgrounds/night/00-landing.png'),
    intent: require('../../assets/echo/backgrounds/night/01-intent.png'),
    horizon: require('../../assets/echo/backgrounds/night/02-horizon.png'),
    voice: require('../../assets/echo/backgrounds/night/03-voice.png'),
    rhythm: require('../../assets/echo/backgrounds/night/04-rhythm.png'),
    privacy: require('../../assets/echo/backgrounds/night/05-privacy.png'),
    arrival: require('../../assets/echo/backgrounds/night/06-arrival.png'),
    'first-echo': require('../../assets/echo/backgrounds/night/07-first-echo.png'),
    completion: require('../../assets/echo/backgrounds/night/08-completion.png'),
    home: require('../../assets/echo/backgrounds/night/09-home.png'),
  },
};
