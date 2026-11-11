import type { ReactionKind } from '../../shared/types';

/** The three faces, in the order they are shown. Shared by the voting page and the chart. */
export const FACES: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'happy', emoji: '\u{1F600}', label: 'Loved it' },
  { kind: 'neutral', emoji: '\u{1F610}', label: "It's OK" },
  { kind: 'sad', emoji: '\u{1F641}', label: 'Not for me' },
];

/** The order of the voting buttons: the same left to right as the swipe sprint
 *  (not for me, it's OK, loved it), so nobody has to relearn it between pages. */
export const VOTE_FACES = [...FACES].reverse();
