import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { hydratePreferences, resetPreferences } from '@/state/preferences';
import { createTestRuntime } from '@/storage/testing/nodePorts';

import { ThemeProvider, useTheme } from './theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

// A change is complete the moment it is made. Its motion is tested in themeMotion.test.tsx.
const still = ({ children }: PropsWithChildren) => (
  <ThemeProvider crossfade={false}>{children}</ThemeProvider>
);
const mount = () => renderHook(() => useTheme(), { wrapper: still });
const stored = async (rt: Awaited<ReturnType<typeof createTestRuntime>>) =>
  rt.db.first<{ value: string }>(`SELECT value FROM preferences WHERE key = 'theme'`);

beforeEach(() => resetPreferences());

describe('theme preference', () => {
  it('defaults to Night, whatever the phone is set to (D-001)', async () => {
    jest.mocked(useColorScheme).mockReturnValue('light');
    const view = await mount();
    expect(view.result.current.preference).toBe('night');
    expect(view.result.current.name).toBe('night');
  });

  it('survives a restart', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    const view = await mount();
    await act(async () => view.result.current.setPreference('day'));
    expect(await stored(rt)).toEqual({ value: 'day' });

    await view.unmount();
    resetPreferences();
    const relaunched = await rt.reopen();
    await hydratePreferences(relaunched.db);
    const after = await mount();
    expect(after.result.current.preference).toBe('day');
    expect(after.result.current.name).toBe('day');
  });

  it('keeps Automatic following the system', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const view = await mount();
    await act(async () => view.result.current.setPreference('automatic'));
    expect(view.result.current.name).toBe('night');
    expect(await stored(rt)).toEqual({ value: 'automatic' });
  });

  it('falls back to Night on a stored value it does not recognise', async () => {
    const rt = await createTestRuntime();
    await rt.db.run(`INSERT INTO preferences (key, value) VALUES ('theme', 'sepia')`);
    await hydratePreferences(rt.db);
    const view = await mount();
    expect(view.result.current.preference).toBe('night');
  });

  it('writes nothing until storage is connected, as on web', async () => {
    const rt = await createTestRuntime();
    const view = await mount();
    await act(async () => view.result.current.setPreference('day'));
    expect(view.result.current.name).toBe('day');
    expect(await stored(rt)).toBeNull();
  });

  it('a failed write leaves the choice in place for this session', async () => {
    const rt = await createTestRuntime();
    await hydratePreferences(rt.db);
    const view = await mount();
    rt.db.raw.close();
    await act(async () => view.result.current.setPreference('day'));
    expect(view.result.current.name).toBe('day');
  });
});
