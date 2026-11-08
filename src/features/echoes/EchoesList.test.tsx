import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/design/theme';

import { mostFadedGlass } from '@/testing/glass';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';
import type { EntrySummary } from '@/features/journal';

import { echoesCopy } from './echoesCopy';
import { EchoesList } from './EchoesList';

const realTiming = reanimatedMock.withTiming;
const delay = jest.spyOn(reanimatedMock, 'withDelay');
const timing = jest.spyOn(reanimatedMock, 'withTiming');

const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;

const AT = new Date(2026, 10, 5, 9, 41).getTime();
const row = (id: string): EntrySummary => ({
  id,
  status: 'committed',
  readable: true,
  title: `Made-up ${id}`,
  preview: 'Made-up words',
  mode: 'text',
  durationSeconds: 300,
  hasAudio: false,
  recovered: false,
  createdAt: AT,
  updatedAt: AT,
  localDay: '2026-11-05',
});

beforeEach(() => {
  delay.mockClear();
  timing.mockClear();
});
afterEach(() => {
  timing.mockImplementation(realTiming as never);
});

describe('EchoesList while a search runs', () => {
  it('says the search is running, once, and hides the rows it is not offering', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    const waiting = screen.getByLabelText(echoesCopy.searching);
    expect(waiting).toBeBusy();
    expect(screen.queryByTestId('echo-row-a')).toBeNull();
    expect(screen.getByTestId('echo-row-a', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is not labelled, and its rows are there, when no search is running', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} />);
    expect(screen.queryByLabelText(echoesCopy.searching)).toBeNull();
    expect(screen.getByTestId('echo-row-a')).toBeTruthy();
  });

  it('dims to 0.6 only after 400 ms, over 320 ms, so a quick answer never dims it', async () => {
    await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay.mock.calls[0]?.[0]).toBe(400);
    expect(timing).toHaveBeenCalledWith(0.6, expect.objectContaining({ duration: 320 }));
  });

  it('dims the rows on the glass and never the glass: a dimmed ancestor takes Android’s blur away', async () => {
    const view = await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    // Caught on the way to 0.6.
    timing.mockImplementation((() => 0.6) as never);
    await view.rerender(wrap(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />));
    expect(mostFadedGlass()).toBe(1);
  });

  it('comes back over 180 ms when the answer lands', async () => {
    const view = await render(<EchoesList rows={[row('a')]} onOpen={() => undefined} waiting />);
    timing.mockClear();
    await view.rerender(wrap(<EchoesList rows={[row('a')]} onOpen={() => undefined} />));
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
  });
});
