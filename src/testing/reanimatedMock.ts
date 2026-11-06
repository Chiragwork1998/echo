// Reanimated's bundled mock runs native initialisers and throws under jest-expo. This covers the
// API the app uses and resolves every animation to its final value immediately. If a test needs
// another function, add it here.
import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

const identity = <T>(value: T) => value;

const useSharedValue = <T>(initial: T) =>
  useState(() => ({
    value: initial,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
    },
  }))[0];

export const reanimatedMock = {
  __esModule: true,
  default: { View, Text, Image, ScrollView, createAnimatedComponent: identity },
  createAnimatedComponent: identity,
  useSharedValue,
  useDerivedValue: (compute: () => unknown) => ({ value: compute(), get: compute }),
  useAnimatedStyle: (compute: () => object) => compute(),
  useAnimatedProps: (compute: () => object) => compute(),
  useReducedMotion: () => false,
  useAnimatedKeyboard: () => ({
    height: { value: 0, get: () => 0 },
    state: { value: 0, get: () => 0 },
  }),
  useAnimatedReaction: () => undefined,
  withTiming: identity,
  withSpring: identity,
  withDelay: (_delay: number, value: unknown) => value,
  withRepeat: identity,
  withSequence: (...values: unknown[]) => values.at(-1),
  cancelAnimation: () => undefined,
  runOnJS: identity,
  runOnUI: identity,
  interpolate: (_value: number, _input: number[], output: number[]) => output[0],
  interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: {
    linear: identity,
    ease: identity,
    quad: identity,
    cubic: identity,
    sin: identity,
    in: identity,
    out: identity,
    inOut: identity,
    bezier: () => identity,
  },
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
};
