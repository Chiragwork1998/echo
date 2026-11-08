import { render as baseRender } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import HomeLayout from '../../app/home/_layout';
import OnboardingLayout from '../../app/onboarding/_layout';

// Lives here because Expo Router treats every file under app/ as a route.

type Options = { contentStyle?: { backgroundColor?: string }; animation?: string };
let mockStackOptions: Options | undefined;
const mockScreens = new Map<string, Options>();

jest.mock('expo-router', () => {
  function Stack(props: { screenOptions: Options; children?: ReactNode }) {
    mockStackOptions = props.screenOptions;
    return props.children ?? null;
  }
  function Screen({ name, options }: { name: string; options: Options }) {
    mockScreens.set(name, options);
    return null;
  }
  Stack.Screen = Screen;
  return {
    Stack,
    ThemeProvider: ({ children }: { children: ReactNode }) => children,
    DefaultTheme: { colors: {} },
    router: { push: jest.fn(), navigate: jest.fn() },
    usePathname: () => '/home',
  };
});
jest.mock('@/components/EchoBackground', () => ({ EchoBackground: () => null }));
jest.mock('@/features/home/tabs/HomeTabBar', () => ({ HomeTabBar: () => null }));
jest.mock('@/features/home/NightHomeLoop', () => ({ NightHomeLoop: () => null }));

beforeEach(() => {
  mockStackOptions = undefined;
  mockScreens.clear();
});

const CLEAR = 'transparent';

describe('onboarding stands its screens on nothing', () => {
  it('leaves every screen clear, so that the plate backing shows where a photograph is not drawn yet', async () => {
    await baseRender(<OnboardingLayout />);
    expect(mockStackOptions?.contentStyle).toEqual({ backgroundColor: CLEAR });
  });

  it('still dissolves one screen into the next', async () => {
    await baseRender(<OnboardingLayout />);
    expect(mockStackOptions?.animation).toBe('fade');
  });
});

describe('Home’s stack stands its screens on nothing', () => {
  it('leaves every screen clear, Completion included, which draws its own plate above the backing', async () => {
    await baseRender(<HomeLayout />);
    expect(mockStackOptions?.contentStyle).toEqual({ backgroundColor: CLEAR });
  });

  it('leaves the session, Breathe and Rehearse clear too', async () => {
    await baseRender(<HomeLayout />);
    for (const name of ['session', 'breathe', 'rehearse']) {
      expect(mockScreens.get(name)?.contentStyle).toEqual({ backgroundColor: CLEAR });
    }
  });
});
