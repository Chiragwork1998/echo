import {
  angleToMinutes,
  clockText,
  crossesHour,
  followTarget,
  formatTime,
  GLIDE_FROM,
  minutesToAngle,
  nearestAngle,
  parseTime,
  pointToAngle,
  snapMinutes,
  stepMinutes,
  wrapMinutes,
} from './time';

describe('wrapMinutes and snapMinutes', () => {
  it('wraps any number of minutes into one day', () => {
    expect(wrapMinutes(1440)).toBe(0);
    expect(wrapMinutes(1445)).toBe(5);
    expect(wrapMinutes(-5)).toBe(1435);
    expect(wrapMinutes(-1440 - 30)).toBe(1410);
  });

  it('snaps to the nearest 5 minutes', () => {
    expect(snapMinutes(1290)).toBe(1290);
    expect(snapMinutes(1291)).toBe(1290);
    expect(snapMinutes(1292.4)).toBe(1290);
    expect(snapMinutes(1292.6)).toBe(1295);
    expect(snapMinutes(1297)).toBe(1295);
    expect(snapMinutes(1298)).toBe(1300);
  });

  it('wraps a snap that rounds up past midnight', () => {
    expect(snapMinutes(1438)).toBe(0);
    expect(snapMinutes(1437)).toBe(1435);
    expect(snapMinutes(-2)).toBe(0);
  });
});

describe('the 24-hour face, noon at the top', () => {
  it('places noon at the top, 6 pm on the right, midnight at the bottom, 6 am on the left', () => {
    expect(minutesToAngle(12 * 60)).toBe(0);
    expect(minutesToAngle(18 * 60)).toBe(90);
    expect(minutesToAngle(0)).toBe(180);
    expect(minutesToAngle(6 * 60)).toBe(270);
  });

  it('puts 9:30 pm on the lower right', () => {
    expect(minutesToAngle(21 * 60 + 30)).toBeCloseTo(142.5, 5);
  });

  it('turns an angle back into a time, and round-trips every 5 minutes of the day', () => {
    expect(angleToMinutes(0)).toBe(720);
    expect(angleToMinutes(90)).toBe(1080);
    expect(angleToMinutes(180)).toBe(0);
    expect(angleToMinutes(270)).toBe(360);
    for (let minutes = 0; minutes < 1440; minutes += 5) {
      expect(snapMinutes(angleToMinutes(minutesToAngle(minutes)))).toBe(minutes);
    }
  });

  it('reads the angle of a touch relative to the centre', () => {
    expect(pointToAngle(0, -10)).toBe(0);
    expect(pointToAngle(10, 0)).toBe(90);
    expect(pointToAngle(0, 10)).toBe(180);
    expect(pointToAngle(-10, 0)).toBe(270);
    expect(pointToAngle(10, -10)).toBeCloseTo(45, 5);
    expect(pointToAngle(-10, -10)).toBeCloseTo(315, 5);
  });

  it('maps a drag over the bottom of the dial across midnight', () => {
    // 1.25 degrees is 5 minutes. Right of the bottom is before midnight, left of it is after.
    const step = 100 * Math.tan((1.25 * Math.PI) / 180);
    const before = snapMinutes(angleToMinutes(pointToAngle(step, 100)));
    const at = snapMinutes(angleToMinutes(pointToAngle(0, 100)));
    const after = snapMinutes(angleToMinutes(pointToAngle(-step, 100)));
    expect([before, at, after].map(formatTime)).toEqual(['23:55', '00:00', '00:05']);
  });
});

describe('followTarget', () => {
  it('puts the handle under a finger that is near it, with no glide', () => {
    expect(followTarget(142.5, 21 * 60 + 35)).toEqual({ angle: 143.75, glide: false });
    expect(followTarget(142.5, 21 * 60 + 25)).toEqual({ angle: 141.25, glide: false });
  });

  it('carries the handle round, the short way, to a finger that is far from it', () => {
    const far = followTarget(142.5, 8 * 60);
    expect(far.angle).toBe(300);
    expect(far.glide).toBe(true);
    // The other way round it would be 202.5 degrees.
    expect(Math.abs(far.angle - 142.5)).toBeLessThan(180);
  });

  it('crosses noon the short way, and without a glide when the finger is just past it', () => {
    expect(followTarget(359, 12 * 60 + 5)).toEqual({ angle: 361.25, glide: false });
    expect(followTarget(1, 11 * 60 + 55)).toEqual({ angle: -1.25, glide: false });
  });

  it('glides only past the threshold', () => {
    expect(GLIDE_FROM).toBe(20);
    expect(followTarget(0, 12 * 60 + 80).glide).toBe(false);
    expect(followTarget(0, 12 * 60 + 85).glide).toBe(true);
  });
});

describe('nearestAngle', () => {
  it('takes the short way round, so the handle never spins backwards over midnight', () => {
    expect(nearestAngle(178, 182)).toBe(182);
    expect(nearestAngle(182, 178)).toBe(178);
    expect(nearestAngle(350, 10)).toBe(370);
    expect(nearestAngle(10, 350)).toBe(-10);
  });

  it('stays continuous when the angle has already turned past a full circle', () => {
    expect(nearestAngle(370, 15)).toBe(375);
    expect(nearestAngle(-20, 345)).toBe(-15);
  });
});

describe('crossesHour', () => {
  it('is false within an hour and true between hours', () => {
    expect(crossesHour(1290, 1295)).toBe(false);
    expect(crossesHour(1259, 1260)).toBe(true);
    expect(crossesHour(1260, 1255)).toBe(true);
  });

  it('counts the step over midnight', () => {
    expect(crossesHour(1435, 0)).toBe(true);
    expect(crossesHour(0, 1435)).toBe(true);
  });
});

describe('stepMinutes', () => {
  it('moves by a step and wraps in both directions', () => {
    expect(stepMinutes(1290, 15)).toBe(1305);
    expect(stepMinutes(1435, 15)).toBe(10);
    expect(stepMinutes(0, -15)).toBe(1425);
  });
});

describe('stored time', () => {
  it('formats as 24-hour HH:mm', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(8 * 60)).toBe('08:00');
    expect(formatTime(18 * 60 + 30)).toBe('18:30');
    expect(formatTime(21 * 60 + 30)).toBe('21:30');
    expect(formatTime(1440)).toBe('00:00');
  });

  it('parses HH:mm and rejects anything else', () => {
    expect(parseTime('21:30')).toBe(1290);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
    for (const bad of ['', '9:30', '24:00', '12:60', '21:30:00', '9:30 PM', 'noon']) {
      expect(parseTime(bad)).toBeUndefined();
    }
  });
});

describe('clockText', () => {
  it('writes 9:30 PM for a 12-hour English clock, with the period apart', () => {
    const text = clockText(21 * 60 + 30, { locale: 'en-US', hour12: true });
    expect(text.main).toBe('9:30');
    expect(text.period).toBe('PM');
    expect(text.spoken).toBe('9:30 PM');
  });

  it('writes midnight and noon the way a 12-hour clock does', () => {
    expect(clockText(0, { locale: 'en-US', hour12: true }).spoken).toBe('12:00 AM');
    expect(clockText(12 * 60, { locale: 'en-US', hour12: true }).spoken).toBe('12:00 PM');
    expect(clockText(8 * 60 + 5, { locale: 'en-US', hour12: true }).main).toBe('8:05');
  });

  it('follows a 24-hour clock, with no period', () => {
    const text = clockText(21 * 60 + 30, { locale: 'en-GB', hour12: false });
    expect(text.main).toBe('21:30');
    expect(text.period).toBeUndefined();
  });

  it('wraps times outside a day', () => {
    expect(clockText(1440 + 60, { locale: 'en-US', hour12: true }).spoken).toBe('1:00 AM');
  });
});
