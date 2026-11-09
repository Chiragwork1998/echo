import { act, renderHook } from '@testing-library/react-native';
import { Image, type ImageRef } from 'expo-image';

import { backgroundSources } from './generated/backgrounds';
import {
  resetPlateThumbsForTests,
  THUMB_LIMIT,
  usePlateThumb,
  warmPlateThumbs,
} from './plateThumbs';

jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));

const loadAsync = jest.mocked(Image.loadAsync);
const decoded = (name: string) => ({ name }) as unknown as ImageRef;

beforeEach(() => {
  resetPlateThumbsForTests();
  loadAsync.mockReset();
  loadAsync.mockImplementation(async (source) => decoded(String(source)));
});

// The thumbnail on Home's card and the avatar in its header were empty for a frame and then popped in,
// at the welcome and after every tab change (the walk, v10). They are a crop of the Home plate at a
// size of their own, decoded when they mount. Decoded ahead of time and kept, they are drawn whole in
// the first frame they are asked for, however often the screen comes back.
describe('the decoded thumbnails of Home’s plate', () => {
  it('loads each theme’s Home plate once, at the size of a thumbnail and not of a screen', async () => {
    await warmPlateThumbs('night');
    await warmPlateThumbs('night');
    expect(loadAsync).toHaveBeenCalledTimes(2);
    expect(loadAsync).toHaveBeenCalledWith(backgroundSources.night.home, THUMB_LIMIT);
    expect(loadAsync).toHaveBeenCalledWith(backgroundSources.day.home, THUMB_LIMIT);
    expect(THUMB_LIMIT.maxWidth).toBeLessThan(600);
  });

  it('loads the theme that is on show first', async () => {
    const pending = warmPlateThumbs('day');
    expect(loadAsync.mock.calls[0]?.[0]).toBe(backgroundSources.day.home);
    await pending;
  });

  it('hands out null until a theme’s thumbnail is ready, and then the very same one every time', async () => {
    let finish: (image: ImageRef) => void = () => undefined;
    loadAsync.mockReturnValueOnce(new Promise<ImageRef>((resolve) => (finish = resolve)));
    const view = await renderHook(() => usePlateThumb('night'));
    expect(view.result.current).toBeNull();
    await act(async () => finish(decoded('night')));
    const first = view.result.current;
    expect(first).not.toBeNull();
    const again = await renderHook(() => usePlateThumb('night'));
    expect(again.result.current).toBe(first);
  });

  it('asks for the thumbnail itself, if no one has warmed it before the first screen wants it', async () => {
    const view = await renderHook(() => usePlateThumb('day'));
    await act(async () => undefined);
    expect(loadAsync).toHaveBeenCalledWith(backgroundSources.day.home, THUMB_LIMIT);
    expect(view.result.current).not.toBeNull();
  });

  it('survives a load that fails, and tries again the next time it is asked', async () => {
    loadAsync.mockRejectedValueOnce(new Error('no memory'));
    await expect(warmPlateThumbs('night')).resolves.toBeUndefined();
    expect(loadAsync).toHaveBeenCalledTimes(2);
    loadAsync.mockClear();
    await warmPlateThumbs('night');
    // The theme that failed is asked for again; the one that was held is not.
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(backgroundSources.night.home, THUMB_LIMIT);
    const view = await renderHook(() => usePlateThumb('night'));
    expect(view.result.current).not.toBeNull();
  });

  it('does nothing on a build whose image module cannot load to memory', async () => {
    (Image as { loadAsync?: unknown }).loadAsync = undefined;
    await expect(warmPlateThumbs('night')).resolves.toBeUndefined();
    (Image as { loadAsync?: unknown }).loadAsync = loadAsync;
  });
});
