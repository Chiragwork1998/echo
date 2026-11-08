// Which helplines the support panel lists. Where the person is matters for a helpline, so the phone's
// time zone decides when it lies in a country the panel has lines for, whatever language the phone is
// set to. Seen on a release walk: a phone in India, set to American English, offered only 988.
import { deviceRegion } from './deviceRegion';
import {
  regionForTimeZone,
  SUPPORT_LINES,
  SUPPORT_TIME_ZONES,
  supportLinesFor,
} from './supportResources';

let mockRegion: string | null = 'US';
let mockZone: string | null = 'Asia/Kolkata';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', regionCode: mockRegion }],
  getCalendars: () => [{ calendar: 'gregory', timeZone: mockZone }],
}));

afterEach(() => jest.restoreAllMocks());

const lineNames = () => supportLinesFor(deviceRegion()).map((line) => line.name);

describe('the country the support panel lists helplines for', () => {
  it('is India for a phone in India set to American English', () => {
    mockRegion = 'US';
    mockZone = 'Asia/Kolkata';
    expect(deviceRegion()).toBe('IN');
    expect(lineNames()).toEqual(['Tele-MANAS']);
  });

  it('knows India by the older zone name some phones still report', () => {
    mockRegion = 'US';
    mockZone = 'Asia/Calcutta';
    expect(deviceRegion()).toBe('IN');
  });

  it('follows the zone to any other country with lines, over the language', () => {
    mockRegion = 'IN';
    mockZone = 'America/Toronto';
    expect(deviceRegion()).toBe('CA');
    mockZone = 'Europe/London';
    expect(deviceRegion()).toBe('GB');
  });

  it('falls back to the language settings for a zone in a country without lines', () => {
    mockRegion = 'GB';
    mockZone = 'Europe/Berlin';
    expect(deviceRegion()).toBe('GB');
    expect(lineNames()).toEqual(['Samaritans']);
  });

  it('falls back to the language settings when the zone is unknown or missing', () => {
    mockRegion = 'IN';
    mockZone = 'Mars/Olympus_Mons';
    expect(deviceRegion()).toBe('IN');
    mockZone = null;
    expect(deviceRegion()).toBe('IN');
  });

  it('then does what it did before: the runtime’s own locale, and otherwise no country', () => {
    mockRegion = null;
    mockZone = 'Europe/Berlin';
    const locale = (value: string) =>
      jest
        .spyOn(Intl, 'DateTimeFormat')
        .mockImplementation(
          () => ({ resolvedOptions: () => ({ locale: value }) }) as unknown as Intl.DateTimeFormat,
        );
    locale('en-NZ');
    expect(deviceRegion()).toBe('NZ');
    locale('en');
    expect(deviceRegion()).toBeNull();
    expect(lineNames()).toEqual([]);
  });
});

describe('a time zone', () => {
  it('names a country only by its exact name', () => {
    expect(regionForTimeZone('Asia/Kolkata')).toBe('IN');
    expect(regionForTimeZone('asia/kolkata')).toBeNull();
    expect(regionForTimeZone(' Asia/Kolkata')).toBeNull();
    expect(regionForTimeZone('Asia/')).toBeNull();
    expect(regionForTimeZone('')).toBeNull();
    expect(regionForTimeZone(null)).toBeNull();
    expect(regionForTimeZone(undefined)).toBeNull();
  });

  it('never names a country for a zone it shares with another, or one without lines', () => {
    // The Bahamas keep Toronto's clock, and the Crown Dependencies London's, but they are not
    // Canada or the United Kingdom.
    for (const zone of [
      'America/Nassau',
      'Europe/Jersey',
      'Europe/Guernsey',
      'Europe/Isle_of_Man',
    ]) {
      expect(regionForTimeZone(zone)).toBeNull();
    }
    for (const zone of ['Asia/Dhaka', 'Asia/Karachi', 'America/Mexico_City', 'Etc/UTC', 'UTC']) {
      expect(regionForTimeZone(zone)).toBeNull();
    }
  });

  it('is mapped only for countries the panel has lines for, each zone once', () => {
    const zones = Object.values(SUPPORT_TIME_ZONES).flat();
    expect(new Set(zones).size).toBe(zones.length);
    for (const country of Object.keys(SUPPORT_TIME_ZONES)) {
      expect(SUPPORT_LINES[country]?.length).toBeGreaterThan(0);
    }
    for (const country of Object.keys(SUPPORT_LINES)) {
      expect(SUPPORT_TIME_ZONES[country]?.length).toBeGreaterThan(0);
    }
  });
});
