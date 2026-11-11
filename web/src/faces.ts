import type { ReactionKind } from '../../shared/types';

/** The three faces, in the order they are shown. Shared by the voting page and the chart. */
export const FACES: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'happy', emoji: '\u{1F600}', label: 'Loved it' },
  { kind: 'neutral', emoji: '\u{1F610}', label: "It's OK" },
  { kind: 'sad', emoji: '\u{1F641}', label: 'Not for me' },
];
