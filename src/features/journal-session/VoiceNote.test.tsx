// The note on the daily sky when this month's free minutes of voice into words are used. It is the
// note a reopened draft shows for a recording with no words yet, with one more line saying why, and
// ECHO Plus beside Write instead. Nothing in it repeats anything the person said.
import { fireEvent, screen } from '@testing-library/react-native';

import { render } from '@/testing/render';

import { sessionCopy } from './sessionCopy';
import { VOICE_NOTES, VoiceNote } from './VoiceNote';

const handlers = () => ({
  onAllow: jest.fn(),
  onSettings: jest.fn(),
  onWrite: jest.fn(),
  onRetry: jest.fn(),
  onPlus: jest.fn(),
});

describe('the free minutes note', () => {
  it('is a note the daily session draws', () => {
    expect(VOICE_NOTES).toContain('transcribe_allowance');
  });

  it('says the recording is safe, then why, and offers Plus and writing, never Try again', async () => {
    const actions = handlers();
    await render(
      <VoiceNote
        view="transcribe_allowance"
        line={sessionCopy.transcribe.untranscribed}
        detail={sessionCopy.transcribe.allowance.line}
        {...actions}
      />,
    );
    expect(screen.getByText(sessionCopy.transcribe.untranscribed)).toBeTruthy();
    expect(screen.getByText(sessionCopy.transcribe.allowance.line)).toBeTruthy();
    expect(screen.queryByRole('button', { name: sessionCopy.errors.retry })).toBeNull();
    expect(screen.queryByRole('button', { name: sessionCopy.transcribe.action })).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: sessionCopy.transcribe.allowance.plus }),
    );
    expect(actions.onPlus).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.writeInstead }));
    expect(actions.onWrite).toHaveBeenCalledTimes(1);
    expect(actions.onRetry).not.toHaveBeenCalled();
  });

  it('says the first line alone when the session gives it no second', async () => {
    await render(<VoiceNote view="transcribe_allowance" line={null} {...handlers()} />);
    expect(screen.getByText(sessionCopy.transcribe.untranscribed)).toBeTruthy();
    expect(screen.queryByText(sessionCopy.transcribe.allowance.line)).toBeNull();
  });

  it('is not offered on any other note', async () => {
    await render(<VoiceNote view="transcribe_failed" line={null} {...handlers()} />);
    expect(
      screen.queryByRole('button', { name: sessionCopy.transcribe.allowance.plus }),
    ).toBeNull();
  });
});
