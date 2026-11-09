import { render as baseRender } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

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

  it('leaves Breathe as it was: it is not drawn over Home', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await baseRender(<HomeLayout />);
    expect(mockScreens.get('breathe')).not.toHaveProperty('presentation');
    expect(mockScreens.get('breathe')?.animation).toBe('none');
  });

  it('changes nothing on iOS, whose navigation controller keeps the screens beneath', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await baseRender(<HomeLayout />);
    for (const name of OVER_HOME) {
      expect(mockScreens.get(name)).not.toHaveProperty('presentation');
    }
  });
});
