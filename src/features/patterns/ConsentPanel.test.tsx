import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { render } from '@/testing/render';

import { ConsentWords } from './ConsentPanel';
import { patternsCopy } from './patternsCopy';

// The walk (v11): the consent asked for TalkBack's focus on its heading in the effect of the commit
// that added it, before Android had made the view, and the request went to a view it did not have
// ("Unable to find viewState for tag … for sendAccessibilityEvent", twice in logcat). It asks once
// the heading has been laid out, a frame later, and only when a screen reader is running.
const HEADING_TAG = 42;
const focus = jest.mocked(AccessibilityInfo.setAccessibilityFocus);
const screenReader = jest.mocked(AccessibilityInfo.isScreenReaderEnabled);

// Frames are held here and come when the test says, not when a busy machine's clock does. Set on
// the global directly: a spy restored after one test leaves the next without the property at all.
const frames = new Map<number, FrameRequestCallback>();
let lastFrame = 0;
const realFrames = { request: global.requestAnimationFrame, cancel: global.cancelAnimationFrame };
beforeAll(() => {
  global.requestAnimationFrame = (run) => {
    lastFrame += 1;
    frames.set(lastFrame, run);
    return lastFrame;
  };
  global.cancelAnimationFrame = (id) => {
    if (id) frames.delete(id);
  };
});
afterAll(() => {
  global.requestAnimationFrame = realFrames.request;
  global.cancelAnimationFrame = realFrames.cancel;
});
const nextFrame = () =>
  act(async () => {
    const due = [...frames.values()];
    frames.clear();
    due.forEach((run) => run(0));
  });
const heading = () => screen.getByRole('header', { name: patternsCopy.consent.title });
const laidOut = () =>
  fireEvent(heading(), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 52 } },
  });

beforeEach(() => {
  focus.mockClear();
  frames.clear();
  // The module the panel reads it from, not a copy of it. Its exports are getters.
  const native = jest.requireActual<{ findNodeHandle: unknown }>('react-native');
  jest.spyOn(native, 'findNodeHandle', 'get').mockReturnValue(() => HEADING_TAG);
});
afterEach(() => {
  jest.restoreAllMocks();
  screenReader.mockImplementation(async () => false);
});

describe('the consent’s heading and a screen reader', () => {
  it('is given the focus only once it has been laid out, and a frame after that', async () => {
    screenReader.mockImplementation(async () => true);
    await render(<ConsentWords count={3} />);
    await nextFrame();
    // Mounted, and the screen reader known to be on: still nothing, as the view may not exist yet.
    expect(focus).not.toHaveBeenCalled();
    await laidOut();
    expect(focus).not.toHaveBeenCalled();
    await nextFrame();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(HEADING_TAG);
    // Once: a later layout does not move the reader back to it.
    await laidOut();
    await nextFrame();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('is never asked for without a screen reader, where there is nobody to move', async () => {
    await render(<ConsentWords count={3} />);
    await laidOut();
    await nextFrame();
    await nextFrame();
    expect(focus).not.toHaveBeenCalled();
  });

  it('is not asked for once the panel has gone before its frame came', async () => {
    screenReader.mockImplementation(async () => true);
    const view = await render(<ConsentWords count={3} />);
    await nextFrame();
    await laidOut();
    expect(frames.size).toBe(1);
    await view.unmount();
    await nextFrame();
    expect(focus).not.toHaveBeenCalled();
  });
});
