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

export const getPrompts = () => fetch('prompts.json').then((r) => r.json() as Promise<Prompt[]>);

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
    stream.addEventListener('board', (e) => {
      heard = true;
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
