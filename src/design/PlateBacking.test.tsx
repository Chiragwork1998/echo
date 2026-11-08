import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { backgroundColours, backgroundSources } from '@/design/generated/backgrounds';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { PlateBacking } from './PlateBacking';
import { noteShownPlate, releaseShownPlate, resetPlatesForTests } from './platePaint';

jest.mock('expo-image', () => {
  const { View: Box } = jest.requireActual('react-native');
  return { Image: (props: { source: unknown }) => <Box testID="plate" {...props} /> };
});

const HIDDEN = { includeHiddenElements: true };
const photographs = () => screen.queryAllByTestId('plate', HIDDEN);
const sources = () => photographs().map((photo) => photo.props.source);
const settled = () => act(async () => void (await Promise.resolve()));

beforeEach(async () => {
  resetPlatesForTests();
  await act(async () => usePreferences.setState({ theme: 'night' }));
});

describe('the plate backing, beneath the whole navigator', () => {
  it('is a flat colour only until the first plate has been drawn, and then it is a photograph', async () => {
    await render(<PlateBacking />);
    expect(photographs()).toHaveLength(0);
    await act(async () => noteShownPlate('home', 'night', 'home'));
    expect(sources()).toEqual([backgroundSources.night.home]);
  });

  it('shows the last plate that was drawn, in its theme, with the same source the screen drew', async () => {
    await act(async () => noteShownPlate('a', 'day', 'privacy'));
    await render(<PlateBacking />);
    // The same module as the screen's plate, so that expo-image's memory cache serves both.
    expect(photographs()[0]?.props.source).toBe(backgroundSources.day.privacy);
    expect(photographs()[0]?.props.contentFit).toBe('cover');
    expect(photographs()[0]?.props.contentPosition).toBe('center');
  });

  it('fills the screen, takes no touches, and is hidden from screen readers', async () => {
    await act(async () => noteShownPlate('a', 'night', 'home'));
    await render(<PlateBacking />);
    const backing = screen.getByTestId('plate-backing', HIDDEN);
    expect(StyleSheet.flatten(backing.props.style as object)).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
    expect(backing.props.pointerEvents).toBe('none');
    expect(backing.props.accessibilityElementsHidden).toBe(true);
    expect(backing.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('keeps the photograph that is on show beneath the next one until the next has been drawn', async () => {
    await act(async () => noteShownPlate('a', 'night', 'intent'));
    await render(<PlateBacking />);
    await act(async () => photographs()[0]?.props.onDisplay());
    await act(async () => noteShownPlate('b', 'night', 'horizon'));
    // Both are drawn, the new one over the old: the backing is never without a whole photograph.
    expect(sources()).toEqual([backgroundSources.night.intent, backgroundSources.night.horizon]);
    await act(async () => photographs()[1]?.props.onDisplay());
    expect(sources()).toEqual([backgroundSources.night.horizon]);
  });

  it('lets the old photograph go if the new one cannot be drawn, rather than hold it for ever', async () => {
    await act(async () => noteShownPlate('a', 'night', 'intent'));
    await render(<PlateBacking />);
    await act(async () => photographs()[0]?.props.onDisplay());
    await act(async () => noteShownPlate('b', 'night', 'horizon'));
    await act(async () => photographs()[1]?.props.onError());
    expect(sources()).toEqual([backgroundSources.night.horizon]);
  });

  it('never holds more than two photographs, however quickly the plates change', async () => {
    await act(async () => noteShownPlate('a', 'night', 'intent'));
    await render(<PlateBacking />);
    await act(async () => photographs()[0]?.props.onDisplay());
    await act(async () => noteShownPlate('b', 'night', 'horizon'));
    await act(async () => noteShownPlate('c', 'night', 'voice'));
    await act(async () => noteShownPlate('d', 'night', 'rhythm'));
    expect(photographs().length).toBeLessThanOrEqual(2);
    // The one that was on show stays beneath, and the newest is over it.
    expect(sources()).toEqual([backgroundSources.night.intent, backgroundSources.night.rhythm]);
  });

  it('goes back to the plate that remains when the screen above is gone', async () => {
    await act(async () => noteShownPlate('home', 'night', 'home'));
    await act(async () => noteShownPlate('completion', 'night', 'completion'));
    await render(<PlateBacking />);
    await act(async () => photographs()[photographs().length - 1]?.props.onDisplay());
    await act(async () => releaseShownPlate('completion'));
    await settled();
    expect(sources()).toContain(backgroundSources.night.home);
  });

  it('keeps the flat colour that is its base the dominant colour of the plate, never white', async () => {
    await render(<PlateBacking />);
    const backing = screen.getByTestId('plate-backing', HIDDEN);
    const { backgroundColor } = StyleSheet.flatten(backing.props.style as object) as {
      backgroundColor?: string;
    };
    expect(Object.values(backgroundColours.night)).toContain(backgroundColor);
  });
});
