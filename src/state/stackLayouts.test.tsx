import { render as baseRender } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { useOnboarding } from '@/state/onboarding';
import { usePreferences } from '@/state/preferences';

import HomeLayout from '../../app/home/_layout';
import OnboardingLayout from '../../app/onboarding/_layout';

// Lives here because Expo Router treats every file under app/ as a route.

type Options = {
  contentStyle?: { backgroundColor?: string };
  animation?: string;
  presentation?: string;
};
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
let mockComesUp: boolean | undefined;
let mockVeiled: boolean | undefined;
jest.mock('@/components/EchoBackground', () => ({
  EchoBackground: ({ comesUp }: { comesUp?: boolean }) => {
    mockComesUp = comesUp;
    return null;
  },
}));
jest.mock('@/features/home/dissolve', () => ({
  ...jest.requireActual('@/features/home/dissolve'),
  HomeDissolveProvider: ({ children, veiled }: { children: ReactNode; veiled?: boolean }) => {
    mockVeiled = veiled;
    return children;
  },
}));
jest.mock('@/features/home/tabs/HomeTabBar', () => ({
  HomeTabBar: () => null,
  HomeTabBarProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/features/home/NightHomeLoop', () => ({ NightHomeLoop: () => null }));

beforeEach(() => {
  mockStackOptions = undefined;
  mockScreens.clear();
  mockComesUp = undefined;
  mockVeiled = undefined;
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

// On Android a stack takes the screens beneath its top screen down from the window, and builds them
// again when they come back, unless the screens above are presented as translucent (react-native-screens'
// ScreenStack keeps everything beneath the first screen that is not). Home sat beneath the session,
// Rehearse and Completion, so on Enter your space Home's interface was built again after the photograph
// was already showing: the walk (v10) saw the bare photograph for a fifth to half a second, five
// samples in five, and then Home's interface cut in. Presented over Home, it stays up beneath them.
describe('Home stays up beneath the session, Rehearse and Completion on Android', () => {
  const OVER_HOME = ['session', 'rehearse', 'complete'];

  afterEach(() => jest.restoreAllMocks());

  it('presents each of them over Home, translucent', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await baseRender(<HomeLayout />);
    for (const name of OVER_HOME) {
      expect(mockScreens.get(name)?.presentation).toBe('transparentModal');
    }
  });

  it('keeps the options each of them had: clear, and no swipe away from a session that is committed', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await baseRender(<HomeLayout />);
    for (const name of ['session', 'rehearse']) {
      expect(mockScreens.get(name)?.contentStyle).toEqual({ backgroundColor: CLEAR });
    }
    expect(mockScreens.get('session')).toMatchObject({ gestureEnabled: false });
    expect(mockScreens.get('rehearse')).toMatchObject({ gestureEnabled: false });
    expect(mockScreens.get('complete')?.contentStyle).toEqual({ backgroundColor: CLEAR });
  });

  // A session begun from Breathe was presented over Breathe's plain screen, which had taken Home down:
  // after it, Enter your space showed the bare plate for 130 to 150 ms while Home was built again (the
  // walk, v11). Breathe is presented over Home as well, and keeps its own cut in and out.
  it('presents Breathe over Home too, with its own coming and going still a cut', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await baseRender(<HomeLayout />);
    expect(mockScreens.get('breathe')).toMatchObject({
      presentation: 'transparentModal',
      animation: 'none',
      gestureEnabled: false,
      contentStyle: { backgroundColor: CLEAR },
    });
  });

  it('changes nothing on iOS, whose navigation controller keeps the screens beneath', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await baseRender(<HomeLayout />);
    for (const name of [...OVER_HOME, 'breathe']) {
      expect(mockScreens.get(name)).not.toHaveProperty('presentation');
    }
    expect(mockScreens.get('breathe')?.animation).toBe('none');
  });
});

// The welcome: Completion's interface has let go over its photograph; Home's photograph comes up over that
// one, and Home's interface rises once Home is ready (the walk, v11, saw a bare frame and then a cut).
describe('Home’s first look after onboarding', () => {
  afterEach(() => {
    usePreferences.setState({ homeWelcomed: true });
    useOnboarding.setState({ completedAt: undefined });
  });

  it('brings Home’s photograph up over Completion’s, and begins with Home’s interface veiled', async () => {
    usePreferences.setState({ homeWelcomed: false });
    useOnboarding.setState({ completedAt: Date.now() });
    await baseRender(<HomeLayout />);
    expect(mockComesUp).toBe(true);
    expect(mockVeiled).toBe(true);
  });

  it('leaves every other Home as it was', async () => {
    usePreferences.setState({ homeWelcomed: true });
    useOnboarding.setState({ completedAt: Date.now() });
    await baseRender(<HomeLayout />);
    expect(mockComesUp).toBe(false);
    expect(mockVeiled).toBe(false);
  });
});
