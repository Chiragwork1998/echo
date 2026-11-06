import { fireEvent, screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { BeginButton } from './BeginButton';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('BeginButton', () => {
  it('exposes a labelled button and proceeds when pressed', async () => {
    const onPress = jest.fn();
    await render(<BeginButton label="BEGIN" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'BEGIN' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
