import { PLATE_SCALE, plateScale, plateStep, setPlateFlowStep, usePlateFlow } from './plateMotion';

describe('plateStep', () => {
  it('numbers Landing 0 and the eight steps after it', () => {
    expect(plateStep('landing')).toBe(0);
    expect(plateStep('intent')).toBe(1);
    expect(plateStep('rhythm')).toBe(4);
    expect(plateStep('first-echo')).toBe(7);
    expect(plateStep('completion')).toBe(8);
  });

  it('leaves Home out of the journey', () => {
    expect(plateStep('home')).toBeNull();
  });
});

describe('plateScale', () => {
  it('rests at 1.00 on the current screen', () => {
    expect(plateScale(3, 3)).toBe(1);
  });

  it('drifts the plate that has been left to 1.025, and holds the next one at 0.985', () => {
    expect(plateScale(3, 4)).toBe(1.025);
    expect(plateScale(4, 3)).toBe(0.985);
  });

  it('plays forward as old 1.000 to 1.025 and new 0.985 to 1.000', () => {
    // From Rhythm (4) to Privacy (5).
    expect([plateScale(4, 4), plateScale(5, 4)]).toEqual([1, 0.985]);
    expect([plateScale(4, 5), plateScale(5, 5)]).toEqual([1.025, 1]);
  });

  it('plays back as the same motion reversed', () => {
    // From Privacy (5) back to Rhythm (4): Rhythm returns from 1.025, Privacy shrinks to 0.985.
    expect([plateScale(4, 5), plateScale(5, 5)]).toEqual([1.025, 1]);
    expect([plateScale(4, 4), plateScale(5, 4)]).toEqual([1, 0.985]);
  });

  it('never moves a plate away from the journey, or while nothing is current', () => {
    expect(plateScale(null, 3)).toBe(1);
    expect(plateScale(3, null)).toBe(1);
  });

  it('keeps the spec’s three scales', () => {
    expect(PLATE_SCALE).toEqual({ behind: 1.025, current: 1, ahead: 0.985 });
  });
});

describe('the flow store', () => {
  it('holds the current step, and only announces a change', () => {
    const seen = jest.fn();
    const stop = usePlateFlow.subscribe(seen);
    setPlateFlowStep(2);
    setPlateFlowStep(2);
    setPlateFlowStep(null);
    stop();
    expect(seen).toHaveBeenCalledTimes(2);
    expect(usePlateFlow.getState().step).toBeNull();
  });
});
