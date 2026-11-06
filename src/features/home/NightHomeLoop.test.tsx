import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';

import { NIGHT_LOOP_COVER_GRACE_MS, NIGHT_LOOP_SOURCE, plateCoverRect } from '@/design/nightLoop';
import { ThemeProvider } from '@/design/theme';
import { usePreferences } from '@/state/preferences';
import { resetVideoPlayers, videoPlayers } from '@/testing/expoVideoMock';
import { render } from '@/testing/render';

import { NightHomeLoop } from './NightHomeLoop';

jest.mock('expo-video', () => jest.requireActual('@/testing/expoVideoMock').expoVideoMock);

let mockPath = '/home';
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));

type StateHandler = (state: string) => void;
let appState: StateHandler | undefined;
type Props = { suspended?: boolean };

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(async () => {
  mockPath = '/home';
  appState = undefined;
  resetVideoPlayers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, handler: unknown) => {
    if (type === 'change') appState = handler as StateHandler;
    return { remove: jest.fn() };
  }) as never);
  await act(async () => usePreferences.setState({ theme: 'night' }));
});

afterEach(() => jest.restoreAllMocks());

// The loop is hidden from screen readers on purpose, so the queries have to look past that.
const HIDDEN = { includeHiddenElements: true };
const player = () => videoPlayers[0];
const surface = () => screen.getByTestId('night-loop', HIDDEN);
const video = () => screen.getByTestId('video-view', HIDDEN);
const hasSurface = () => screen.queryByTestId('night-loop', HIDDEN) !== null;
const hasVideo = () => screen.queryByTestId('video-view', HIDDEN) !== null;
const opacity = () => (StyleSheet.flatten(surface().props.style) as { opacity: number }).opacity;
const measure = (width = 393, height = 852) =>
  act(async () => {
    surface().props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });

/** Mounted, Reduce Motion answered, and (unless asked not to) laid out, as the layout would. */
const mount = async ({ measured = true, ...props }: Props & { measured?: boolean } = {}) => {
  const view = await render(<NightHomeLoop {...props} />);
  // Reduce Motion is asked of the system, and answers a moment later.
  await act(async () => undefined);
  if (measured && hasSurface()) await measure();
  return view;
};
type View = Awaited<ReturnType<typeof mount>>;
// A rerender replaces the tree, so the providers go back around it.
const show = (view: View, props: Props = {}) =>
  view.rerender(
    <ThemeProvider crossfade={false}>
      <NightHomeLoop {...props} />
    </ThemeProvider>,
  );
const moveTo = async (view: View, path: string, props: Props = {}) => {
  mockPath = path;
  await show(view, props);
};
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

describe('who gets a player', () => {
  it('Night with motion allowed makes one, from the bundled file', async () => {
    await mount();
    expect(videoPlayers).toHaveLength(1);
    expect(player()?.source).toBe(NIGHT_LOOP_SOURCE);
  });

  it('Day makes none', async () => {
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await mount();
    expect(videoPlayers).toHaveLength(0);
    expect(hasSurface()).toBe(false);
  });

  it('Reduce Motion makes none: the still alone', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await mount();
    expect(videoPlayers).toHaveLength(0);
    expect(hasSurface()).toBe(false);
  });

  it('makes none until the system has said whether Reduce Motion is on', async () => {
    jest
      .mocked(AccessibilityInfo.isReduceMotionEnabled)
      .mockReturnValue(new Promise(() => undefined));
    await mount();
    expect(videoPlayers).toHaveLength(0);
  });

  it('lets go of the loop when the theme moves to Day', async () => {
    const view = await mount();
    expect(hasSurface()).toBe(true);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await show(view);
    expect(hasSurface()).toBe(false);
  });
});

describe('the player never takes audio focus', () => {
  it('is muted, mixes with others and stays in the foreground', async () => {
    await mount();
    expect(player()).toMatchObject({
      muted: true,
      audioMixingMode: 'mixWithOthers',
      staysActiveInBackground: false,
      showNowPlayingNotification: false,
      keepScreenOnWhilePlaying: false,
      allowsExternalPlayback: false,
      loop: true,
    });
  });

  it('already holds those settings by the time it is first asked to play', async () => {
    await mount();
    expect(player()?.atFirstPlay).toEqual({
      muted: true,
      audioMixingMode: 'mixWithOthers',
      staysActiveInBackground: false,
    });
  });

  it('draws no controls, no fullscreen, no picture in picture, no captions', async () => {
    await mount();
    const props = video().props;
    expect(props.nativeControls).toBe(false);
    expect(props.fullscreenOptions).toEqual({ enable: false });
    expect(props.allowsPictureInPicture).toBe(false);
    expect(props.startsPictureInPictureAutomatically).toBe(false);
    expect(props.allowsVideoFrameAnalysis).toBe(false);
    expect(props.controllerAutoShow).toBe(false);
    expect(props.useExoShutter).toBe(false);
  });

  it('is not focusable, not touchable, and hidden from screen readers', async () => {
    await mount();
    for (const node of [surface(), video()]) {
      expect(node.props.focusable).toBe(false);
      expect(node.props.pointerEvents).toBe('none');
      expect(node.props.accessibilityElementsHidden).toBe(true);
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });
});

describe('the surface', () => {
  it('is a TextureView on Android, so the glass above blurs it and it stacks with the plates', async () => {
    await mount();
    expect(video().props.surfaceType).toBe('textureView');
  });

  it('is stretched onto the still’s exact rectangle', async () => {
    await mount({ measured: false });
    await measure(820, 1180);
    const box = StyleSheet.flatten(video().parent?.props.style) as Record<string, number>;
    expect(box).toMatchObject(plateCoverRect({ width: 820, height: 1180 }));
    expect(video().props.contentFit).toBe('fill');
  });

  it('follows the box when it changes, as on rotation', async () => {
    await mount();
    await measure(1180, 820);
    const box = StyleSheet.flatten(video().parent?.props.style) as Record<string, number>;
    expect(box).toMatchObject(plateCoverRect({ width: 1180, height: 820 }));
  });

  it('draws no video view until it has been measured', async () => {
    await mount({ measured: false });
    expect(hasVideo()).toBe(false);
  });
});

describe('the still stays until the loop is really there', () => {
  it('is hidden before the first frame has rendered', async () => {
    await mount();
    expect(opacity()).toBe(0);
  });

  it('appears once the first frame has rendered', async () => {
    const view = await mount();
    await act(async () => video().props.onFirstFrameRender());
    // The test double shows an animation's end on the next draw.
    await show(view);
    expect(opacity()).toBe(1);
  });

  it('goes back to the still, with no message, if the player fails', async () => {
    const view = await mount();
    await act(async () => video().props.onFirstFrameRender());
    await show(view);
    expect(opacity()).toBe(1);
    await act(async () => player()?.emit('statusChange', { status: 'error' }));
    await show(view);
    expect(opacity()).toBe(0);
    expect(screen.queryByText(/error|wrong|unable|failed/i)).toBeNull();
  });

  it('never shows if the player fails before its first frame', async () => {
    const view = await mount();
    await act(async () => player()?.emit('statusChange', { status: 'error' }));
    await show(view);
    expect(opacity()).toBe(0);
  });

  it('draws nothing at all if the player cannot even be made', async () => {
    const video = jest.requireMock('expo-video');
    const made = video.useVideoPlayer;
    video.useVideoPlayer = () => {
      throw new Error('no decoder');
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await mount();
      expect(hasSurface()).toBe(false);
    } finally {
      video.useVideoPlayer = made;
    }
  });
});

describe('it plays only while the plate can be seen', () => {
  it('plays on Home', async () => {
    await mount();
    expect(player()?.playing).toBe(true);
  });

  it('pauses in the background, and plays on from the same frame on return', async () => {
    await mount();
    await act(async () => appState?.('background'));
    expect(player()?.playing).toBe(false);
    await act(async () => appState?.('active'));
    expect(player()?.playing).toBe(true);
    // Paused and played: never replaced, never restarted.
    expect(videoPlayers).toHaveLength(1);
    expect(player()?.calls).toEqual(['play', 'pause', 'play']);
  });

  it('counts the app switcher, which only deactivates the app, as away', async () => {
    await mount();
    await act(async () => appState?.('inactive'));
    expect(player()?.playing).toBe(false);
  });

  it('pauses when the lock closes over it', async () => {
    const view = await mount();
    await show(view, { suspended: true });
    expect(player()?.playing).toBe(false);
    await show(view);
    expect(player()?.playing).toBe(true);
  });

  it.each(['/home/echoes', '/home/patterns', '/home/you', '/home/entry', '/home/complete'])(
    'pauses behind %s, which wears a plate of its own, once it has faded in',
    async (path) => {
      const view = await mount();
      await moveTo(view, path);
      // Still going while the covering screen fades in over it.
      expect(player()?.playing).toBe(true);
      await advance(NIGHT_LOOP_COVER_GRACE_MS - 1);
      expect(player()?.playing).toBe(true);
      await advance(1);
      expect(player()?.playing).toBe(false);
    },
  );

  it('plays again the moment Home returns, without being remade', async () => {
    const view = await mount();
    await moveTo(view, '/home/echoes');
    await advance(NIGHT_LOOP_COVER_GRACE_MS);
    expect(player()?.playing).toBe(false);
    await moveTo(view, '/home');
    expect(player()?.playing).toBe(true);
    expect(videoPlayers).toHaveLength(1);
  });

  it('does not pause if Home returns before the grace has run out', async () => {
    const view = await mount();
    await moveTo(view, '/home/echoes');
    await advance(NIGHT_LOOP_COVER_GRACE_MS / 2);
    await moveTo(view, '/home');
    await advance(NIGHT_LOOP_COVER_GRACE_MS * 2);
    expect(player()?.playing).toBe(true);
    expect(player()?.calls).toEqual(['play']);
  });

  it('keeps playing through the session, which is transparent over the same plate', async () => {
    const view = await mount();
    await moveTo(view, '/home/session');
    await advance(NIGHT_LOOP_COVER_GRACE_MS * 3);
    expect(player()?.playing).toBe(true);
    expect(player()?.calls).toEqual(['play']);
  });

  it('is the same mounted surface from Home to the session and back: Begin restarts nothing', async () => {
    const view = await mount();
    const before = surface();
    await moveTo(view, '/home/session');
    await moveTo(view, '/home');
    expect(surface()).toBe(before);
    expect(videoPlayers).toHaveLength(1);
    expect(player()?.calls).toEqual(['play']);
  });

  it('is paused once the grace has run if it is first mounted behind a covering screen', async () => {
    mockPath = '/home/echoes';
    await mount();
    await advance(NIGHT_LOOP_COVER_GRACE_MS);
    expect(player()?.playing).toBe(false);
  });
});

describe('where expo-video is missing', () => {
  it('can still be imported, and draws the still: a build before the module was added keeps working', () => {
    jest.resetModules();
    jest.doMock('expo-video', () => {
      throw new Error('Cannot find native module ExpoVideo');
    });
    let loaded: unknown;
    jest.isolateModules(() => {
      loaded = jest.requireActual('./NightHomeLoop').NightHomeLoop;
    });
    jest.dontMock('expo-video');
    expect(loaded).toBeDefined();
  });
});
