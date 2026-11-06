// The volumes of the ECHO shelf, brought across from the earlier branch (D-004). Names, cloth, foil
// and cover art are the originals; the studio colour behind the shelf follows whichever is centred.

export type VolumeArt =
  'contours' | 'horizon' | 'orbit' | 'peaks' | 'portal' | 'rhythm' | 'signal' | 'tides';

export type VolumeId =
  'horizon' | 'return' | 'stillness' | 'signal' | 'orbit' | 'your-echo' | 'rhythm' | 'tides';

export type Volume = {
  id: VolumeId;
  title: string;
  subtitle: string;
  cloth: string;
  foil: string;
  /** Studio colour behind the shelf while this volume is centred. */
  scene: string;
  art: VolumeArt;
  height: number;
};

export const VOLUMES: readonly Volume[] = [
  {
    id: 'horizon',
    title: 'Horizon',
    subtitle: 'QUIET MEASURE',
    cloth: '#A9C6DA',
    foil: '#294763',
    scene: '#5D84A1',
    art: 'horizon',
    height: 200,
  },
  {
    id: 'return',
    title: 'Return',
    subtitle: 'COMING BACK',
    cloth: '#273A5E',
    foil: '#E0925A',
    scene: '#1B2944',
    art: 'portal',
    height: 196,
  },
  {
    id: 'stillness',
    title: 'Stillness',
    subtitle: 'SLOW ATTENTION',
    cloth: '#E8763A',
    foil: '#FBE3C4',
    scene: '#B4502A',
    art: 'contours',
    height: 212,
  },
  {
    id: 'signal',
    title: 'Signal',
    subtitle: 'WHAT RETURNS',
    cloth: '#D8DC5C',
    foil: '#1F2119',
    scene: '#8C9030',
    art: 'signal',
    height: 194,
  },
  {
    id: 'orbit',
    title: 'Orbit',
    subtitle: 'WIDER CIRCLES',
    cloth: '#2747C4',
    foil: '#EEF1F8',
    scene: '#1C3191',
    art: 'orbit',
    height: 206,
  },
  {
    id: 'your-echo',
    title: 'Your Echo',
    subtitle: 'A PRIVATE JOURNAL',
    cloth: '#1E2C47',
    foil: '#E6B57A',
    scene: '#131D30',
    art: 'peaks',
    height: 214,
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    subtitle: 'DAILY PRACTICE',
    cloth: '#E2553F',
    foil: '#FBE6D6',
    scene: '#A83A28',
    art: 'rhythm',
    height: 198,
  },
  {
    id: 'tides',
    title: 'Tides',
    subtitle: 'EBB AND FLOW',
    cloth: '#2F7F8C',
    foil: '#EADBC1',
    scene: '#1F5862',
    art: 'tides',
    height: 204,
  },
];

/** The journal itself: where the shelf settles, and the book a person has not chosen away from. */
export const DEFAULT_VOLUME: VolumeId = 'your-echo';

export const BOOK_W = 150;
export const STEP = 164;

export function volumeIndex(id: string | undefined): number {
  const found = VOLUMES.findIndex((volume) => volume.id === id);
  return found >= 0 ? found : VOLUMES.findIndex((volume) => volume.id === DEFAULT_VOLUME);
}

export function volumeById(id: string | undefined): Volume {
  return VOLUMES[volumeIndex(id)] ?? VOLUMES[0]!;
}

/** Row offset that puts volume `index` in the centre of a `width` screen. */
export const centred = (index: number, width: number) => width / 2 - (index * STEP + BOOK_W / 2);
