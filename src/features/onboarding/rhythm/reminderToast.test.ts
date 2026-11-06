import { showToast } from '@/components/Toast';

import { announceReminder, reminderConfirmation } from './reminderToast';

jest.mock('@/components/Toast', () => ({ showToast: jest.fn() }));

const mockClock = { uses24: false, locale: 'en-US' };
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: mockClock.locale }],
  getCalendars: () => [{ uses24hourClock: mockClock.uses24 }],
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockClock.uses24 = false;
  mockClock.locale = 'en-US';
});

describe('reminderConfirmation', () => {
  it('writes the time as the device does', () => {
    expect(reminderConfirmation({ status: 'scheduled', time: '21:30' })).toBe(
      'We’ll meet you at 9:30 PM.',
    );
    expect(reminderConfirmation({ status: 'scheduled', time: '08:05' })).toBe(
      'We’ll meet you at 8:05 AM.',
    );
    mockClock.uses24 = true;
    mockClock.locale = 'en-GB';
    expect(reminderConfirmation({ status: 'scheduled', time: '21:30' })).toBe(
      'We’ll meet you at 21:30.',
    );
  });

  it('uses an ordinary space before AM or PM, so the line reads and wraps like any other', () => {
    const narrowNoBreakSpace = String.fromCharCode(0x202f);
    expect(reminderConfirmation({ status: 'scheduled', time: '21:30' })).not.toContain(
      narrowNoBreakSpace,
    );
  });

  it.each([{ status: 'off' }, { status: 'not_allowed' }, { status: 'failed' }] as const)(
    'is silent for a reminder that is $status',
    (commit) => {
      expect(reminderConfirmation(commit)).toBeNull();
    },
  );

  it('is silent for a time it cannot read', () => {
    expect(reminderConfirmation({ status: 'scheduled', time: 'soon' })).toBeNull();
    expect(reminderConfirmation(undefined)).toBeNull();
  });
});

describe('announceReminder', () => {
  it('shows the toast once for a scheduled reminder, and never otherwise', () => {
    announceReminder({ status: 'scheduled', time: '21:30' });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('We’ll meet you at 9:30 PM.');
    announceReminder({ status: 'failed' });
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
