import { tokens } from './tokens';

export type EchoThemeName = keyof typeof tokens.color;
export type EchoTheme = { name: EchoThemeName; color: (typeof tokens.color)[EchoThemeName] };

export const themes: Record<EchoThemeName, EchoTheme> = {
  day: { name: 'day', color: tokens.color.day },
  night: { name: 'night', color: tokens.color.night },
};
