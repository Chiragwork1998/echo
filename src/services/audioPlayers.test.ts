import { stopAndRelease } from './audioPlayers';

describe('stopAndRelease', () => {
  it('silences the player first, then frees the native player', () => {
    const calls: string[] = [];
    const player = {
      pause: jest.fn(() => void calls.push('pause')),
      release: jest.fn(() => void calls.push('release')),
      remove: jest.fn(() => void calls.push('remove')),
    };
    stopAndRelease(player);
    // remove() alone would leave an Android player sounding until garbage collection.
    expect(calls).toEqual(['pause', 'release']);
  });

  it('falls back to remove() where a player has no release()', () => {
    const player = { pause: jest.fn(), remove: jest.fn() };
    stopAndRelease(player);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.remove).toHaveBeenCalledTimes(1);
  });

  it('still frees a player whose pause throws, and never throws itself', () => {
    const player = {
      pause: jest.fn(() => {
        throw new Error('already released');
      }),
      release: jest.fn(() => {
        throw new Error('already released');
      }),
    };
    expect(() => stopAndRelease(player)).not.toThrow();
    expect(player.release).toHaveBeenCalledTimes(1);
    expect(() => stopAndRelease(null)).not.toThrow();
    expect(() => stopAndRelease(undefined)).not.toThrow();
  });
});
