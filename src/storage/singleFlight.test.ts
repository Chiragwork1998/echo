import { singleFlight, type Flight } from './singleFlight';

const empty = <T>(): Flight<T> => ({ current: null });

describe('singleFlight', () => {
  it('runs again after a task that finished without ever yielding', async () => {
    const flight = empty<number>();
    let runs = 0;
    const task = async () => (runs += 1);

    expect(await singleFlight(flight, task)).toBe(1);
    expect(await singleFlight(flight, task)).toBe(2);
    expect(runs).toBe(2);
  });

  it('joins the run in progress', async () => {
    const flight = empty<string>();
    let finish = (_value: string) => undefined as void;
    const task = jest.fn(() => new Promise<string>((resolve) => (finish = resolve)));

    const first = singleFlight(flight, task);
    const second = singleFlight(flight, task);
    finish('done');

    expect(await Promise.all([first, second])).toEqual(['done', 'done']);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('exposes the run while it is in progress, and nothing once it ends', async () => {
    const flight = empty<void>();
    const run = singleFlight(flight, () => Promise.resolve());
    expect(flight.current).toBe(run);
    await run;
    expect(flight.current).toBeNull();
  });

  it('runs again after a task that rejected', async () => {
    const flight = empty<number>();
    await expect(singleFlight(flight, () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(await singleFlight(flight, () => Promise.resolve(2))).toBe(2);
  });
});
