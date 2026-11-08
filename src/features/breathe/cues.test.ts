import { cue } from '@/design/haptics';

import { tickFor, tickMoment } from './cues';

jest.mock('@/design/haptics');

beforeEach(() => jest.clearAllMocks());

describe('the breath cues', () => {
  it('cues breathIn as a breath in begins', () => {
    tickFor({ action: 'inhale', ms: 4000 });
    expect(jest.mocked(cue).mock.calls).toEqual([['breathIn']]);
  });

  it('cues breathOut as a breath out begins, a different cue from the one in', () => {
    tickFor({ action: 'exhale', ms: 6000 });
    expect(jest.mocked(cue).mock.calls).toEqual([['breathOut']]);
  });

  it('lets a hold pass in stillness', () => {
    tickFor({ action: 'hold', ms: 4000 });
    expect(cue).not.toHaveBeenCalled();
  });

  it('cues a moment where a bell would ring', () => {
    tickMoment();
    expect(jest.mocked(cue).mock.calls).toEqual([['moment']]);
  });
});
