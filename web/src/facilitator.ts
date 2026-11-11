import { API } from '../../shared/client';
import type { CommunityItem } from '../../shared/types';
import { el } from './api';
import { FACES } from './faces';

// The facilitator's page: approve or turn down a community prompt, take one down, undo a
// flood, clear votes.
// Everything here needs the passphrase, which the server checks on every request.
// It is kept for this browser tab only (sessionStorage), never saved to the device.

const main = document.getElementById('main')!;
const KEY = 'totp-facilitator';
let passphrase = '';
try { passphrase = sessionStorage.getItem(KEY) || ''; } catch { /* storage blocked: ask each time */ }

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  const res = await fetch(API + path, {
    signal: abort.signal,
    method,
    headers: { 'x-facilitator-key': passphrase, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => { throw new Error('The vote server did not answer. Try again in a moment.'); }).finally(() => clearTimeout(timer));
  if (res.status === 401) throw new Error('That passphrase was not accepted.');
  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    throw new Error((problem && problem.error) || 'The vote server did not answer. Try again in a moment.');
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/**
 * A button that asks once more before doing something that cannot be undone:
 * the first press changes its wording, the second within a few seconds does it.
 */
function careful(label: string, sure: string, act: () => Promise<string>, report: (text: string) => void) {
  const button = el('button', { type: 'button', class: 'btn-copy danger' }, label);
  let armed = 0;
  button.addEventListener('click', async () => {
    if (!armed) {
      button.textContent = sure;
      armed = window.setTimeout(() => { armed = 0; button.textContent = label; }, 5000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    button.textContent = label;
    button.disabled = true;
    try { report(await act()); } catch (err) { report((err as Error).message); }
    button.disabled = false;
  });
  return button;
}

function showSignIn(message = '') {
  const input = el('input', { type: 'password', id: 'passphrase', autocomplete: 'off', class: 'wide-input' });
  const form = el('form', { class: 'section-card share-form-plain' },
    el('div', { class: 'eyebrow' }, 'Facilitators only'),
    el('h2', {}, 'Passphrase'),
    el('label', { for: 'passphrase' }, 'The facilitator passphrase set on the vote server'),
    input,
    el('div', { class: 'action-bar' }, el('button', { class: 'btn-copy big', type: 'submit' }, 'Open')),
    el('p', { class: 'error', role: 'alert' }, message));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    passphrase = input.value;
    try {
      await call('/api/facilitator/check');
      try { sessionStorage.setItem(KEY, passphrase); } catch { /* fine */ }
      showTools();
    } catch (err) {
      passphrase = '';
      showSignIn((err as Error).message);
    }
  });
  main.replaceChildren(form);
  input.focus();
}

function showTools() {
  const said = el('p', { class: 'vote-status', role: 'status' });
  const report = (text: string) => { said.textContent = text; refresh(); };
  const list = el('div', {});
  const waitingList = el('div', {});
  const minutesBox = (id: string) => el('input', { type: 'number', id, min: '1', max: '1440', value: '15', class: 'minutes' });
  const minutesOf = (box: HTMLInputElement) => Math.min(1440, Math.max(1, Math.round(Number(box.value) || 15)));

  const floodMinutes = minutesBox('flood-minutes');
  const voteMinutes = minutesBox('vote-minutes');

  const remove = (item: CommunityItem) => careful('Remove', 'Sure? Remove', async () => {
    await call(`/api/community/${item.id}`, 'DELETE');
    return `Removed: "${item.purpose}". Its words are wiped from the database.`;
  }, report);

  // Nothing an attendee shares is shown to anyone until it is approved here.
  async function refreshWaiting() {
    let items: CommunityItem[];
    try { items = await call<CommunityItem[]>('/api/community/waiting'); } catch { return; } // keep what is showing
    if (!items.length) {
      waitingList.replaceChildren(el('p', { class: 'muted' }, 'Nothing is waiting.'));
      return;
    }
    waitingList.replaceChildren(...items.map((item) => {
      const approve = el('button', { type: 'button', class: 'btn-copy' }, 'Approve');
      approve.addEventListener('click', async () => {
        approve.disabled = true;
        try {
          await call(`/api/community/${item.id}/approve`, 'POST');
          report(`Approved: "${item.purpose}". It is now on the pages.`);
        } catch (err) { report((err as Error).message); }
      });
      return el('div', { class: 'facilitator-row' },
        el('div', { class: 'facilitator-text' },
          el('strong', {}, item.purpose),
          item.prompt ? el('p', { class: 'muted' }, item.prompt) : ''),
        approve, remove(item));
    }));
  }

  // The whole database as one file, saved by the browser. Nothing in it is personal.
  const backup = el('button', { type: 'button', class: 'btn-copy' }, 'Download backup');
  backup.addEventListener('click', async () => {
    backup.disabled = true;
    try {
      const all = await call<{ exported_at: string; reactions: unknown[]; reactions_archive: unknown[] }>('/api/facilitator/export');
      const link = el('a', {
        href: URL.createObjectURL(new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' })),
        download: `leaderboard-backup-${all.exported_at.slice(0, 16).replace(/[:T]/g, '-')}.json`,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      said.textContent = `Backup downloaded: ${all.reactions.length} votes on the chart, ${all.reactions_archive.length} cleared.`;
    } catch (err) { said.textContent = (err as Error).message; }
    backup.disabled = false;
  });

  async function refresh() {
    refreshWaiting();
    let items: CommunityItem[] = [];
    try { items = await fetch(API + '/api/community').then((r) => r.json()); } catch { /* shown as none */ }
    if (!items.length) {
      list.replaceChildren(el('p', { class: 'muted' }, 'No community prompts are showing.'));
      return;
    }
    list.replaceChildren(...items.map((item) => el('div', { class: 'facilitator-row' },
      el('div', { class: 'facilitator-text' },
        el('strong', {}, item.purpose),
        item.prompt ? el('p', { class: 'muted' }, item.prompt) : '',
        el('p', { class: 'tally' }, FACES.map((f) => `${f.emoji} ${item[f.kind]}`).join('  '))),
      remove(item))));
  }

  main.replaceChildren(
    el('section', { class: 'section-card' },
      el('div', { class: 'eyebrow' }, 'Community prompts'),
      el('h2', {}, 'Waiting for your approval'),
      el('p', { class: 'muted' }, 'Nobody else sees these until you approve them. Removing is for good: the words are wiped.'),
      said, waitingList),
    el('section', { class: 'section-card' },
      el('div', { class: 'eyebrow' }, 'Community prompts'),
      el('h2', {}, 'Take something down'),
      el('p', { class: 'muted' }, 'These are approved and showing. Removing is for good: the entry leaves every page and its words are wiped. Page viewers see it go within 20 seconds.'),
      list,
      el('div', { class: 'facilitator-bulk' },
        el('label', { for: 'flood-minutes' }, 'A flood? Remove everything added in the last'), floodMinutes, el('span', {}, 'minutes'),
        careful('Remove them all', 'Sure? Remove them all', async () => {
          const out = await call<{ removed: number }>('/api/community/remove-recent', 'POST', { minutes: minutesOf(floodMinutes) });
          return `Removed ${out.removed} ${out.removed === 1 ? 'entry' : 'entries'}.`;
        }, report))),
    el('section', { class: 'section-card' },
      el('div', { class: 'eyebrow' }, 'The chart'),
      el('h2', {}, 'Clear votes'),
      el('p', { class: 'muted' }, 'For undoing a burst of fake votes. Cleared votes leave the chart for good, but they are kept in an archive and are in the backup below. There is no need to clear the chart between workshops.'),
      el('div', { class: 'facilitator-bulk' },
        el('label', { for: 'vote-minutes' }, 'Clear votes cast in the last'), voteMinutes, el('span', {}, 'minutes'),
        careful('Clear those votes', 'Sure? Clear them', async () => {
          const out = await call<{ cleared: number }>('/api/sessions/OPEN/clear-votes', 'POST', { minutes: minutesOf(voteMinutes) });
          return `Cleared ${out.cleared} ${out.cleared === 1 ? 'vote' : 'votes'}.`;
        }, report)),
      el('div', { class: 'facilitator-bulk' },
        el('span', {}, 'Or wipe the chart completely:'),
        careful('Clear every vote', 'Sure? Every vote goes', async () => {
          const out = await call<{ cleared: number }>('/api/sessions/OPEN/clear-votes', 'POST', {});
          return `Cleared all ${out.cleared} votes. The chart is empty; the votes are kept in the archive.`;
        }, report))),
    el('section', { class: 'section-card' },
      el('div', { class: 'eyebrow' }, 'Safe keeping'),
      el('h2', {}, 'Download a backup'),
      el('p', { class: 'muted' }, 'Every vote (including cleared ones) and every community prompt, as one file. Take one after each workshop.'),
      el('div', { class: 'action-bar' }, backup)),
    el('p', { class: 'muted', style: 'text-align:center' },
      el('button', { type: 'button', class: 'linkish', id: 'sign-out' }, 'Lock this page')));
  document.getElementById('sign-out')!.addEventListener('click', () => {
    passphrase = '';
    try { sessionStorage.removeItem(KEY); } catch { /* fine */ }
    showSignIn();
  });
  refresh();
  setInterval(() => { if (!document.hidden && !main.contains(document.activeElement)) refresh(); }, 15000);
}

// A passphrase kept from earlier in this tab is checked again before anything is shown.
if (passphrase) call('/api/facilitator/check').then(showTools, () => { passphrase = ''; showSignIn(); });
else showSignIn();
