import { createHmac, randomBytes } from 'node:crypto';

// Rough limits per network address, so one script cannot flood the chart with made-up
// voters. A whole workshop room usually shares one address, so they are sized for a
// room, not a person. The address itself is never stored or logged: it is turned into
// a keyed hash with a secret made at start-up, held in memory only, and forgotten on restart.
const SECRET = randomBytes(32);
const keyFor = (address: string) => createHmac('sha256', SECRET).update(address).digest('base64url');

// 60 people swiping a card a second is 3,600 a minute, and after an outage every browser
// sends what it was holding at once. 900 was measured to hold votes back in a room of 45.
export const WRITES_PER_MINUTE = 6000;
export const NEW_VOTERS_PER_HOUR = 200; // more browsers than any one room holds

interface Seen { minute: number; writes: number; hour: number; voters: Set<string> }

export function createLimits(now: () => number = Date.now) {
  const seen = new Map<string, Seen>();
  return {
    /** '' if this write may go ahead, otherwise words for the person. */
    check(address: string, voter: string): string {
      const t = now();
      const minute = Math.floor(t / 60000);
      const hour = Math.floor(t / 3600000);
      if (seen.size > 5000) { // forget addresses not heard from this hour
        seen.forEach((s, k) => { if (s.hour !== hour) seen.delete(k); });
      }
      const key = keyFor(address);
      let s = seen.get(key);
      if (!s) { s = { minute, writes: 0, hour, voters: new Set() }; seen.set(key, s); }
      if (s.minute !== minute) { s.minute = minute; s.writes = 0; }
      if (s.hour !== hour) { s.hour = hour; s.voters = new Set(); }
      if (s.writes >= WRITES_PER_MINUTE) return 'Too much from this network just now. Try again in a minute.';
      if (!s.voters.has(voter) && s.voters.size >= NEW_VOTERS_PER_HOUR) return 'Too many people on this network for now. Try again later.';
      s.writes += 1;
      s.voters.add(voter);
      return '';
    },
  };
}
