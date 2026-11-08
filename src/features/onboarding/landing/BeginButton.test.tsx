import { fireEvent, screen } from '@testing-library/react-native';

import { cue } from '@/design/haptics';
import { render } from '@/testing/render';

import { BeginButton } from './BeginButton';

jest.mock('@/design/haptics');

describe('BeginButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes a labelled button and proceeds when pressed', async () => {
    const onPress = jest.fn();
    await render(<BeginButton label="BEGIN" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'BEGIN' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cues a commit as it is pressed', async () => {
    await render(<BeginButton label="BEGIN" onPress={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'BEGIN' }));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });
});
