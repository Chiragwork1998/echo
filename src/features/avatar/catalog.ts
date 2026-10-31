export type AvatarId =
  | 'none'
  | 'codex'
  | 'dewey'
  | 'fireball'
  | 'hoots'
  | 'rocky'
  | 'seedy'
  | 'stacky'
  | 'bsod'
  | 'null-signal';

export type EchoAvatar = {
  id: AvatarId;
  name: string;
  description: string;
  color: string;
};

/** Original native vector companions inspired by the owner's supplied reference. */
export const AVATARS: readonly EchoAvatar[] = [
  { id: 'none', name: 'None', description: 'A quiet space, just you.', color: '#AEB7C5' },
  { id: 'codex', name: 'Codex', description: 'A curious little guide for untangling thoughts.', color: '#7297FF' },
  { id: 'dewey', name: 'Dewey', description: 'Soft company for slower, quieter moments.', color: '#55D9EF' },
  { id: 'fireball', name: 'Fireball', description: 'A warm spark when you need a little lift.', color: '#FFAF58' },
  { id: 'hoots', name: 'Hoots', description: 'A thoughtful listener with a fresh perspective.', color: '#E6A94D' },
  { id: 'rocky', name: 'Rocky', description: 'Steady company for a full or difficult day.', color: '#BFB196' },
  { id: 'seedy', name: 'Seedy', description: 'Small encouragement for new beginnings.', color: '#B3CE72' },
  { id: 'stacky', name: 'Stacky', description: 'One thought at a time, at your pace.', color: '#A08DC6' },
  { id: 'bsod', name: 'BSOD', description: 'A playful pause when your mind needs a reset.', color: '#65BFFF' },
  { id: 'null-signal', name: 'Null Signal', description: 'Quiet company. Room for the words to come.', color: '#9A8EAE' },
];

export function getAvatar(id: string | null | undefined): EchoAvatar {
  return AVATARS.find(avatar => avatar.id === id) ?? AVATARS[0]!;
}
