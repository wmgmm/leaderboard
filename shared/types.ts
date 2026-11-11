// Types shared by the server and the browser pages.

// The three faces an attendee can give a prompt.
export type ReactionKind = 'happy' | 'neutral' | 'sad';
export const REACTION_KINDS: ReactionKind[] = ['happy', 'neutral', 'sad'];

export interface Reaction {
  voter: string;
  promptId: string;
  kind: ReactionKind;
  recent?: boolean; // cast or changed in the last few minutes
}

export interface SessionInfo {
  code: string;
  name: string;
  promptIds: string[];
  open: boolean;
  hidden: boolean;
}

export interface BoardRow {
  id: string;
  rank: number; // chart position, 1 = top
  points: number;
  score?: number | null; // out of 10, what the chart ranks by; null with no votes (see shared/ranking.ts). A chart saved by an older page has none.
  happy: number;
  neutral: number;
  sad: number;
  recent: number; // votes cast or changed in the last few minutes
}

export interface Board {
  session: SessionInfo;
  voters: number;
  rows: BoardRow[];
}

/** A prompt a member of staff has shared in the Community prompts section. */
export interface CommunityItem {
  id: number;
  purpose: string; // "what I use it for": always given, shown as the title
  prompt: string; // optional, so may be empty
  points: number;
  score?: number | null; // as on the chart
  happy: number;
  neutral: number;
  sad: number;
  /** True when the browser asking is the one that shared it. Nobody votes on their own. */
  mine?: boolean;
}

export interface PromptText {
  html_id: string;
  label: string;
  text: string;
}

export interface Prompt {
  id: string;
  title: string;
  category: string;
  application: string; // the workshop page's own description
  about: string; // short description for the leaderboard; empty if none written yet
  examples: string[]; // up to three things the bracket could be
  note: string; // one optional line the attendee needs
  /** A short "or upload this instead" hint, drawn with a camera, paperclip or chart icon. */
  upload?: { icon: 'photo' | 'file' | 'sheet' | 'mic'; text: string } | null;
  emoji: string; // shown beside the title on the swipe cards; empty for prompts that are not ready
  prompts: PromptText[];
  tip: string;
  ready: boolean;
  why_not: string;
  turns: 'single' | 'multi';
}
