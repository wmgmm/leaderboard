import { API, getBoard } from '../../shared/client';
import type { Board, Prompt } from '../../shared/types';

export {
  API, getBoard, getCommunity, getMyVotes, getSession, sendCommunityReaction, sendReaction, shareCommunity, voterId,
} from '../../shared/client';

// Older browsers on locked-down laptops lack replaceChildren; without it the page would stay blank.
if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function replaceChildren(this: Element, ...nodes: (Node | string)[]) {
    while (this.lastChild) this.removeChild(this.lastChild);
    this.append(...nodes);
  };
}

/** The prompts, tried a few times with a time limit each: one dropped request must not leave an empty page. */
export async function getPrompts(): Promise<Prompt[]> {
  for (let attempt = 0; ; attempt++) {
    const abort = 'AbortController' in window ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), 8000) : 0;
    try {
      const r = await fetch('prompts.json', abort ? { signal: abort.signal } : undefined);
      if (r.ok) return await r.json();
    } catch { /* try again */ } finally { clearTimeout(timer); }
    if (attempt >= 2) throw new Error('The prompts did not load.');
    await new Promise((done) => setTimeout(done, 700 * (attempt + 1)));
  }
}

/**
 * Calls onBoard with every new board, for the projector. Uses a live stream, and
 * switches to asking every 1.5 seconds if the network will not hold a stream open.
 *
 * A browser allows only about six connections to one site, and an open stream uses
 * one for as long as it lives. So the stream is dropped while the tab is hidden, and
 * only the projector uses this at all: the attendee page asks for the board instead.
 */
export function watchBoard(code: string, onBoard: (board: Board) => void, onMode?: (mode: 'live' | 'polling') => void) {
  let source: EventSource | null = null;
  let polling = false;
  const ask = () => getBoard(code).then(onBoard).catch(() => {});
  const poll = () => {
    if (polling) return;
    polling = true;
    onMode?.('polling');
    ask();
    setInterval(() => { if (!document.hidden) ask(); }, 1500);
  };
  const open = () => {
    if (polling || source) return;
    if (!('EventSource' in window)) return poll();
    const stream = new EventSource(`${API}/api/sessions/${encodeURIComponent(code)}/stream`);
    source = stream;
    let heard = false;
    // The server sends a board on every vote and a ping every 20 seconds. Nothing at all for
    // 45 seconds means the link has died without saying so (a Wi-Fi blip): start again.
    let last = Date.now();
    stream.addEventListener('ping', () => { last = Date.now(); });
    const watchdog = setInterval(() => {
      if (source !== stream) return clearInterval(watchdog);
      if (Date.now() - last < 45000) return;
      clearInterval(watchdog);
      stream.close();
      source = null;
      open();
    }, 5000);
    stream.addEventListener('board', (e) => {
      heard = true;
      last = Date.now();
      onMode?.('live');
      onBoard(JSON.parse((e as MessageEvent).data));
    });
    // A stream that the server ends for good (a restart answered with an error page) does
    // not come back by itself, and would leave the chart frozen. Ask every 1.5 seconds instead.
    stream.addEventListener('error', () => {
      if (stream.readyState === 2 && source === stream) { source = null; poll(); }
    });
    // A proxy that buffers the stream never delivers the first board: give it 4 seconds.
    setTimeout(() => {
      if (source === stream && !heard) { stream.close(); source = null; poll(); }
    }, 4000);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return open(); // the stream sends the current board as it connects
    if (source) { source.close(); source = null; }
  });
  if (document.hidden) ask(); else open();
}

/** Small DOM helper: el('div', {class: 'x'}, child, 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const k of Object.keys(attrs)) node.setAttribute(k, attrs[k]);
  for (const child of children) node.append(child);
  return node;
}

/** The [bracketed] part is the bit to swap, so it is shown in bold, as on the workshop page. */
export function promptBody(text: string): HTMLElement {
  const box = el('div', { class: 'prompt-box' });
  for (const part of text.split(/(\[[^\]]*\])/)) {
    box.append(part.startsWith('[') ? el('strong', {}, part) : part);
  }
  return box;
}

/** True if the text reached the clipboard. Never hangs: some browsers leave the request pending. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(reject, 800)),
    ]);
    return true;
  } catch { /* older browser, blocked, or no answer: try the old way */ }
  const area = el('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
  area.remove();
  return ok;
}
