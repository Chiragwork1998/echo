import { fireEvent, screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { PrimaryCTA } from './PrimaryCTA';

describe('PrimaryCTA', () => {
  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<PrimaryCTA label="Begin with this" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Begin with this' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire, and announces disabled, when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PrimaryCTA label="Reflect" onPress={onPress} disabled disabledHint="Write more" />,
    );
    const button = screen.getByRole('button', { name: 'Reflect' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
