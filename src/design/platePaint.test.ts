import {
  lastShownPlate,
  noteShownPlate,
  releaseShownPlate,
  resetPlatesForTests,
} from './platePaint';

/** A release is settled once the screens that are going have all gone: a microtask later. */
const settled = () => Promise.resolve().then(() => undefined);

beforeEach(() => resetPlatesForTests());

describe('the plate that is on show beneath every screen', () => {
  it('is nothing until a plate has been drawn', () => {
    expect(lastShownPlate()).toBeNull();
  });

  it('is the plate that was most recently wholly up', () => {
    noteShownPlate('home', 'night', 'home');
    noteShownPlate('completion', 'night', 'completion');
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'completion' });
  });

  it('falls back to the plate still on show when the one above it is gone', async () => {
    noteShownPlate('home', 'night', 'home');
    noteShownPlate('completion', 'night', 'completion');
    releaseShownPlate('completion');
    await settled();
    // Completion has been left, and it is Home's photograph that is beneath it again: not Completion's.
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'home' });
  });

  it('keeps a plate that is released from under another one', async () => {
    noteShownPlate('home', 'night', 'home');
    noteShownPlate('completion', 'night', 'completion');
    releaseShownPlate('home');
    await settled();
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'completion' });
  });

  it('keeps the last plate when every screen has gone at once, whichever order they went in', async () => {
    noteShownPlate('landing', 'night', 'landing');
    noteShownPlate('intent', 'night', 'intent');
    noteShownPlate('completion', 'night', 'completion');
    // A whole stack unmounts (onboarding is replaced by Home). What was on show was Completion's.
    releaseShownPlate('completion');
    releaseShownPlate('intent');
    releaseShownPlate('landing');
    await settled();
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'completion' });
    // And a different order of going gives the same answer.
    noteShownPlate('a', 'night', 'privacy');
    noteShownPlate('b', 'night', 'arrival');
    releaseShownPlate('a');
    releaseShownPlate('b');
    await settled();
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'arrival' });
  });

  it('follows the theme: a plate that is drawn again in the other theme is the plate on show', () => {
    noteShownPlate('home', 'night', 'home');
    noteShownPlate('home', 'day', 'home');
    expect(lastShownPlate()).toEqual({ theme: 'day', screen: 'home' });
  });

  it('is the newest plate when one screen goes as another arrives', async () => {
    noteShownPlate('a', 'night', 'intent');
    releaseShownPlate('a');
    noteShownPlate('b', 'night', 'horizon');
    await settled();
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'horizon' });
  });

  it('ignores the release of a plate that was never drawn', async () => {
    noteShownPlate('a', 'night', 'intent');
    releaseShownPlate('never');
    await settled();
    expect(lastShownPlate()).toEqual({ theme: 'night', screen: 'intent' });
  });
});
