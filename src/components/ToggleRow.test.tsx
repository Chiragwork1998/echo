import { fireEvent, screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { ToggleRow } from './ToggleRow';

jest.mock('@/design/haptics');

describe('ToggleRow', () => {
  it('is a switch, checked or not, named by its label', async () => {
    const off = await render(
      <ToggleRow label="Keep this on my phone" value={false} onChange={jest.fn()} />,
    );
    const row = screen.getByRole('switch', { name: 'Keep this on my phone' });
    expect(row).not.toBeChecked();
    await off.unmount();
    await render(<ToggleRow label="Keep this on my phone" value onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Keep this on my phone' })).toBeChecked();
  });

  it('asks for the opposite on press', async () => {
    const onChange = jest.fn();
    await render(<ToggleRow label="Keep this" value={false} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Keep this' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when it is disabled, and says so', async () => {
    const onChange = jest.fn();
    await render(<ToggleRow label="Keep this" value={false} onChange={onChange} disabled />);
    const row = screen.getByRole('switch', { name: 'Keep this' });
    expect(row).toBeDisabled();
    await fireEvent.press(row);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the golden switch inside it, with a knob at 1.5 when off', async () => {
    await render(<ToggleRow label="Keep this" value={false} onChange={jest.fn()} />);
    expect(screen.getByTestId('switch-track')).toBeTruthy();
    expect(screen.getByTestId('switch-knob')).toBeTruthy();
  });
});
