import { act, renderHook } from '@testing-library/react-native';

import { IN_VIEW_LATEST_MS, useInView } from './useInView';

type Transition = (event: { data?: { closing?: boolean } }) => void;
const mockStack = {
  focused: false,
  transitions: new Set<Transition>(),
  navigation: {
    addListener: (_type: string, listener: Transition) => {
      mockStack.transitions.add(listener);
      return () => void mockStack.transitions.delete(listener);
    },
  },
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockStack.focused,
  useNavigation: () => mockStack.navigation,
}));

const ended = (closing: boolean) =>
  act(async () => mockStack.transitions.forEach((listener) => listener({ data: { closing } })));
const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockStack.focused = false;
  mockStack.transitions.clear();
});
afterEach(() => jest.useRealTimers());

describe('useInView', () => {
  it('is not in view while another screen has the focus, however long that lasts', async () => {
    const { result } = await renderHook(() => useInView());
    await wait(2000);
    expect(result.current).toBe(false);
    expect(mockStack.transitions.size).toBe(0);
  });

  it('comes into view when the stack has finished its transition onto the page, not when the focus moves', async () => {
    const view = await renderHook(() => useInView());
    // Back: the focus is the page's at once, while the reader above is still fading.
    mockStack.focused = true;
    await view.rerender({});
    expect(view.result.current).toBe(false);
    // The reader's own transition ending says nothing about this page's.
    await ended(true);
    expect(view.result.current).toBe(false);
    await ended(false);
    expect(view.result.current).toBe(true);
  });

  it('comes into view a little after the stack’s fade if the stack never says', async () => {
    const view = await renderHook(() => useInView());
    mockStack.focused = true;
    await view.rerender({});
    await wait(IN_VIEW_LATEST_MS - 1);
    expect(view.result.current).toBe(false);
    await wait(1);
    expect(view.result.current).toBe(true);
  });

  it('goes out of view the moment the focus goes, and waits again for the next return', async () => {
    mockStack.focused = true;
    const view = await renderHook(() => useInView());
    await ended(false);
    expect(view.result.current).toBe(true);
    mockStack.focused = false;
    await view.rerender({});
    expect(view.result.current).toBe(false);
    mockStack.focused = true;
    await view.rerender({});
    expect(view.result.current).toBe(false);
    await ended(false);
    expect(view.result.current).toBe(true);
  });
});
