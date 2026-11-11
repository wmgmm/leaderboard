// The checks on a community prompt. Shared, so the browser can refuse a bad entry at
// once without asking the server, and the server applies exactly the same rules.

export const COMMUNITY_LIMITS = { purposeMin: 3, purposeMax: 120, promptMax: 1500 };

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_NUMBER = /(?:\d[\s-]?){9,}/; // phone, account or reference numbers

// Characters that are not text: a database refuses some of them, and none belong in a prompt.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** The purpose as it will be stored: one line, single spaces. */
export const tidyPurpose = (purpose: string) => purpose.replace(CONTROL, '').replace(/\s+/g, ' ').trim();

/** The prompt as it will be stored: its own line breaks kept, nothing else unusual. */
export const tidyPrompt = (prompt: string) => prompt.replace(CONTROL, '').trim();

/** Why this entry cannot be published, in words for the person who typed it, or ''. */
export function shareProblem(purpose: string, prompt: string): string {
  const p = tidyPurpose(purpose);
  if (p.length < COMMUNITY_LIMITS.purposeMin) return 'Say what you use it for, in a few words.';
  if (p.length > COMMUNITY_LIMITS.purposeMax || tidyPrompt(prompt).length > COMMUNITY_LIMITS.promptMax) {
    return 'That is too long. Trim it and try again.';
  }
  const text = `${p} ${prompt}`;
  if (EMAIL.test(text)) return 'Take out the email address first. Everyone can see this.';
  if (LONG_NUMBER.test(text)) return 'Take out the phone or reference number first. Everyone can see this.';
  return '';
}
