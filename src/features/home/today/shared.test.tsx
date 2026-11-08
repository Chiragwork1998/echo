import { screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { homeLabels } from './homeLabels';
import { CardSkeleton } from './shared';

afterEach(() => jest.restoreAllMocks());

describe('the placeholder for the card that is coming', () => {
  it('waits 150 ms before it shows, so a quick read leaves no card for a frame', async () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    const waits: number[] = [];
    jest.spyOn(reanimated, 'withDelay').mockImplementation(((at: number, value: unknown) => {
      waits.push(at);
      return value;
    }) as never);
    await render(<CardSkeleton height={84} />);
    expect(waits).toEqual([150]);
  });

  it('is announced as busy from the first moment, and keeps its footprint', async () => {
    await render(<CardSkeleton height={84} />);
    const card = screen.getByLabelText(homeLabels.loading, { includeHiddenElements: true });
    expect(card.props.accessibilityState).toEqual({ busy: true });
    expect(card.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 84 })]),
    );
  });
});
