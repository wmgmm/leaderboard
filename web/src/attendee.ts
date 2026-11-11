import { buzzFor, pickUnloved } from '../../shared/buzz';
import type { Board, Prompt, ReactionKind, SessionInfo } from '../../shared/types';
import { Offline, deliver, keepDelivering, waitingVotes } from '../../shared/client';
import { copyText, el, getBoard, getMyVotes, getPrompts, getSession, promptBody } from './api';
import { mountCommunity } from './community';
import { FACES } from './faces';

const main = document.getElementById('main')!;
const params = new URLSearchParams(location.search);

/** What this browser has done in this session, so a refresh keeps the state. */
function memory(code: string) {
  const key = `totp-${code}`;
  let state: { copied: string[]; votes: Record<string, ReactionKind> } = { copied: [], votes: {} };
  try { state = JSON.parse(localStorage.getItem(key) || '') || state; } catch { /* first visit */ }
  return { state, save: () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* fine */ } } };
}

/**
 * What the prompt does for you, then up to three things the bracket could be.
 * Everything sits above the prompt, so only the buttons follow it.
 */
function describe(prompt: Prompt): HTMLElement {
  if (!prompt.about) { // no short description yet: fall back to the workshop page's text
    return el('div', { class: 'exercise-note' }, prompt.application,
      prompt.tip ? el('p', { class: 'tip' }, prompt.tip) : '');
  }
  const note = el('div', { class: 'exercise-note' }, el('p', { class: 'about' }, prompt.about));
  // "or upload a photo" sits on the Try row as its last tag, with an icon.
  const upload = prompt.upload
    ? el('span', { class: 'example upload' },
        el('span', { 'aria-hidden': 'true' }, ({ photo: '📷', file: '📎', sheet: '📊', mic: '🎤' })[prompt.upload.icon]),
        ` ${prompt.upload.text.charAt(0).toLowerCase()}${prompt.upload.text.slice(1)}`)
    : '';
  if (prompt.examples.length || upload) {
    note.append(el('p', { class: 'examples' }, el('span', { class: 'examples-label' }, 'Try'),
      ...prompt.examples.map((example) => el('span', { class: 'example' }, example)), upload));
  }
  if (prompt.note) note.append(el('p', { class: 'tip' }, prompt.note));
  return note;
}

function showSession(session: SessionInfo, prompts: Prompt[], mine: Record<string, ReactionKind> | null) {
  const { state, save } = memory(session.code);
  // What the server says this browser has voted, on this page or in the swipe sprint.
  if (mine) state.votes = mine;
  // Votes cast while the server was away are still on their way: they count as cast.
  const waiting = waitingVotes(session.code);
  for (const id of Object.keys(waiting)) {
    const kind = waiting[id];
    if (kind) state.votes[id] = kind; else delete state.votes[id];
  }
  save();
  const byId = new Map(prompts.map((p) => [p.id, p] as const));
  const inSession = session.promptIds.filter((id) => byId.has(id));
  const progress = el('p', { class: 'progress', role: 'status' });
  const buzzEls = new Map<string, HTMLElement>();
  const paintProgress = () => {
    const done = inSession.filter((id) => state.votes[id]).length;
    progress.textContent = done === inSession.length
      ? `All ${done} rated. The chart thanks you.`
      : `You have rated ${done} of ${inSession.length}.`;
  };

  const copilot = el('a', { class: 'copilot-card', href: 'https://m365copilot.com/', target: '_blank', rel: 'noopener' },
    el('img', { src: 'CopilotLogo.png', alt: '', class: 'copilot-logo' }),
    el('span', { class: 'copilot-card-text' },
      el('span', { class: 'copilot-label' }, 'Click to open Copilot'),
      el('span', { class: 'copilot-url' }, 'm365copilot.com ↗')));
  const card = el('section', { class: 'section-card' },
    el('div', { class: 'section-header' }, el('div', {}, el('h2', {}, session.name))),
    el('div', { class: 'library-instructions' }, copilot,
      el('div', { class: 'instruction-text' },
        el('strong', {}, '1. Copy'), ' a prompt.  ',
        el('strong', {}, '2. Try'), ' it in Copilot.  ',
        el('strong', {}, '3. Pick a face'), ' to vote.',
        el('span', { class: 'instruction-tip' }, 'Using your own text? Leave out names and anything sensitive.'))),
    progress);

  let refreshTags = () => {}; // set once the tags exist; called after each of your own votes
  let section = '';
  inSession.forEach((id, i) => {
    const prompt = byId.get(id)!;
    // Section headings as on the workshop page, shown when the session spans several.
    if (prompt.category !== section) {
      section = prompt.category;
      card.append(el('h3', { class: 'eyebrow section-label' }, section));
    }
    const text = prompt.prompts[0].text;
    const badge = el('span', { class: 'verdict-badge', 'aria-hidden': 'true' });
    const buzzTag = el('span', { class: 'buzz' });
    buzzEls.set(id, buzzTag);
    const copy = el('button', { class: 'btn-copy', type: 'button' }, 'Copy Prompt');
    const status = el('p', { class: 'vote-status', role: 'status' });
    let note = ''; // one-off message, such as a failed copy or a server error
    const faces = FACES.map(({ kind, emoji, label }) => {
      const b = el('button', { class: 'face', type: 'button', 'data-kind': kind },
        el('span', { class: 'face-emoji', 'aria-hidden': 'true' }, emoji),
        el('span', { class: 'face-label' }, label));
      b.addEventListener('click', () => {
        const before = state.votes[id];
        const next = before === kind ? null : kind; // tap the same face to take it back
        // Counted on the page at once. If the vote server is away the vote waits in the
        // outbox and nothing is said; only a refusal from the server itself is shown.
        if (next) state.votes[id] = next; else delete state.votes[id];
        save();
        note = next ? '' : 'Vote removed.';
        deliver({ t: 'vote', code: session.code, id, kind: next }).then((refused) => {
          if (refused) {
            if (before) state.votes[id] = before; else delete state.votes[id];
            save();
            note = refused;
            paint();
          } else {
            refreshTags();
          }
        });
        paint();
      });
      return b;
    });
    // The verdict sits on the same row as Copy Prompt: copy, try, pick a face.
    const verdictLabel = el('span', { class: 'verdict-label' });
    const verdict = el('div', { class: 'verdict', role: 'group', 'aria-label': 'Your verdict' }, verdictLabel, ...faces);
    const paint = () => {
      const mine = state.votes[id];
      // Copy unlocks voting. So does a vote already cast, for instance in the swipe sprint.
      const unlocked = state.copied.includes(id) || Boolean(mine);
      verdict.classList.toggle('locked', !unlocked);
      faces.forEach((b) => {
        b.disabled = !unlocked;
        b.setAttribute('aria-pressed', String(mine === b.dataset.kind));
      });
      const face = FACES.find((f) => f.kind === mine);
      badge.textContent = face ? face.emoji : '';
      // The reason the faces are locked is said in words, where everyone can read it.
      verdictLabel.textContent = unlocked ? 'Your verdict' : 'Copy the prompt first, then vote';
      status.textContent = note || (mine ? 'Vote counted. Tap another face to change your mind.' : '');
      note = '';
      paintProgress();
    };
    copy.addEventListener('click', async () => {
      // Unlock first: voting must not wait on the clipboard.
      if (!state.copied.includes(id)) { state.copied.push(id); save(); }
      paint();
      const ok = await copyText(text);
      note = ok ? 'Copied. Try it in Copilot, then pick a face.' : 'Could not copy for you. Select the text and copy it yourself.';
      paint();
      copy.textContent = ok ? 'Copied!' : 'Copy Prompt';
      copy.classList.toggle('success', ok);
      setTimeout(() => { copy.textContent = 'Copy Prompt'; copy.classList.remove('success'); }, 1500);
    });
    paint();

    const details = el('details', {},
      el('summary', {},
        el('span', { class: 'ex-num' }, ('0' + (i + 1)).slice(-2)),
        el('span', { class: 'sum-title' }, prompt.title, buzzTag),
        badge),
      el('div', { class: 'details-content' },
        describe(prompt),
        promptBody(text),
        el('div', { class: 'action-bar' }, copy, verdict),
        status));
    if (i === 0) details.open = true;
    card.append(details);
  });
  main.replaceChildren(card);

  // Live tags: how each prompt is doing in the room right now.
  const onBoard = (board: Board) => {
    const hidden = board.session.hidden; // the facilitator is saving the result for the reveal
    const tags = new Map(board.rows.map((row) => [row.id, hidden ? null : buzzFor(row, board.voters)] as const));
    const unloved = board.rows.filter((row) => tags.get(row.id)?.key === 'unloved').map((row) => row.id);
    const wearing = pickUnloved(unloved, Date.now());
    for (const row of board.rows) {
      const tag = buzzEls.get(row.id);
      if (!tag) continue;
      const buzz = tags.get(row.id) ?? null;
      const show = buzz && (buzz.key !== 'unloved' || wearing.includes(row.id)) ? buzz : null;
      const was = tag.dataset.key || '';
      tag.textContent = show ? `${show.emoji} ${show.label}` : '';
      tag.dataset.key = show ? show.key : '';
      if (show && was !== show.key) { // a new tag pops in
        tag.classList.remove('pop');
        void tag.offsetWidth;
        tag.classList.add('pop');
      }
    }
  };
  // Ask for the board every few seconds rather than hold a stream open: a browser allows
  // only about six connections to one site, and a held stream on every tab used them up.
  refreshTags = () => { getBoard(session.code).then(onBoard).catch(() => {}); };
  refreshTags();
  setInterval(() => { if (!document.hidden) refreshTags(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshTags(); });
}

async function start() {
  keepDelivering(); // anything that could not be sent last time goes now
  mountCommunity(document.getElementById('community')!);
  const prompts = await getPrompts(); // served with the page, so it is there whatever the vote server is doing
  // There are no room codes for now: everyone votes in the one standing session. A code
  // in the address (?code=ABCD) is still honoured, for testing and for later.
  const ready = prompts.filter((p) => p.ready).map((p) => p.id);
  const code = (params.get('code') || 'OPEN').toUpperCase();
  const everyone: SessionInfo = { code: 'OPEN', name: 'Experiment and Share what you thought!', promptIds: ready, open: true, hidden: false };
  // If the server is away, votes are still held for the session that was asked for.
  let session: SessionInfo = { ...everyone, code };
  let mine: Record<string, ReactionKind> | null = null;
  try {
    [session, mine] = await Promise.all([getSession(code), getMyVotes(code)]);
  } catch (err) {
    // Vote server away, or an unknown code: carry on with the standing session. With the
    // server away the page still lists, copies and takes votes; they are sent when it is back.
    if (!(err instanceof Offline)) session = everyone;
    if (!(err instanceof Offline) && code !== 'OPEN') {
      [session, mine] = await Promise.all([getSession('OPEN'), getMyVotes('OPEN')]).catch(() => [everyone, null] as const);
    }
  }
  showSession(session, prompts, mine);
}
start();
