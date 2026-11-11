import { deliver } from '../../shared/client';
import { COMMUNITY_LIMITS, shareProblem } from '../../shared/community';
import type { CommunityItem, ReactionKind } from '../../shared/types';
import { copyText, el, getCommunity, promptBody } from './api';
import { FACES, VOTE_FACES } from './faces';

/** This browser's own votes and copies on community prompts, so a refresh keeps them. */
function memory() {
  const KEY = 'totp-community';
  let state: { copied: number[]; votes: Record<string, ReactionKind> } = { copied: [], votes: {} };
  try { state = JSON.parse(localStorage.getItem(KEY) || '') || state; } catch { /* first visit */ }
  return { state, save: () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* fine */ } } };
}

/**
 * The Community prompts section: a two-box form (the prompt itself is optional)
 * and the shared list, best first, each with the same three faces as everywhere else.
 */
export function mountCommunity(root: HTMLElement) {
  const { state, save } = memory();
  const open = new Set<number>(); // rows the reader has opened, kept open across refreshes of the list
  const CACHE = 'totp-community-list'; // the last list seen, shown if the vote server is away
  let shown: CommunityItem[] = [];

  const purpose = el('input', { id: 'share-purpose', type: 'text', maxlength: String(COMMUNITY_LIMITS.purposeMax),
    placeholder: 'e.g. Turning my meeting notes into actions', autocomplete: 'off' });
  // No maxlength here: it would cut a pasted prompt short without a word. Too long is refused with a message.
  const prompt = el('textarea', { id: 'share-prompt', rows: '3',
    placeholder: 'Paste the prompt you use, if you have one' });
  const status = el('p', { class: 'vote-status', role: 'status', id: 'share-status' });
  const button = el('button', { class: 'btn-copy big', type: 'submit' }, 'Share it');
  const form = el('form', { class: 'share-form' },
    el('label', { for: 'share-purpose' }, 'What do you use AI for?'), purpose,
    el('label', { for: 'share-prompt' }, 'Your prompt ', el('span', { class: 'optional' }, '(optional)')), prompt,
    el('div', { class: 'action-bar' }, button,
      el('span', { class: 'instruction-tip' }, 'It appears here once a facilitator has approved it. No names or anything sensitive.')),
    status);
  const list = el('div', { class: 'community-list' });

  root.replaceChildren(
    el('div', { class: 'section-header' }, el('div', {},
      el('div', { class: 'eyebrow' }, 'Community prompts'),
      el('h2', {}, 'Share one of yours'),
      // Matt, 10 Nov 2026: make it safe to have a go.
      el('p', { class: 'share-reassure' }, 'There is no wrong answer. A rough idea or a half-finished prompt is welcome.'))),
    form, list);

  function render(items: CommunityItem[]) {
    shown = items;
    // The list is rebuilt, so remember where the keyboard was and put it back afterwards.
    const active = document.activeElement as HTMLElement | null;
    const at = active && list.contains(active)
      ? { id: active.closest('details')?.getAttribute('data-id'), what: active.dataset.kind || (active.tagName === 'SUMMARY' ? 'summary' : 'copy') }
      : null;
    if (!items.length) {
      list.replaceChildren(el('p', { class: 'muted' }, 'Nothing here yet. Yours could be the first.'));
      return;
    }
    list.replaceChildren(...items.map((item, i) => {
      const unlocked = !item.prompt || state.copied.includes(item.id); // nothing to copy means nothing to wait for
      const mine = state.votes[item.id];
      const note = el('p', { class: 'vote-status', role: 'status' }, mine ? 'Vote counted. Tap another face to change your mind.' : '');
      const faces = VOTE_FACES.map(({ kind, emoji, label }) => {
        const b = el('button', { class: 'face', type: 'button', 'data-kind': kind, 'aria-pressed': String(mine === kind) },
          el('span', { class: 'face-emoji', 'aria-hidden': 'true' }, emoji), el('span', { class: 'face-label' }, label));
        b.disabled = !unlocked;
        b.addEventListener('click', () => {
          const next = mine === kind ? null : kind; // tap the same face to take it back
          // Counted on the page at once; sent behind the scenes, or held if the server is away.
          if (next) state.votes[item.id] = next; else delete state.votes[item.id];
          save();
          render(shown.map((it) => it.id !== item.id ? it : {
            ...it,
            ...(mine ? { [mine]: Math.max(0, it[mine] - 1) } : {}),
            ...(next ? { [next]: it[next] + (mine === next ? 0 : 1) } : {}),
          }));
          deliver({ t: 'cvote', id: item.id, kind: next }).then(refresh);
        });
        return b;
      });
      const verdictLabel = el('span', { class: 'verdict-label' }, unlocked ? 'Your verdict' : 'Copy the prompt first, then vote');
      const verdict = el('div', { class: `verdict${unlocked ? '' : ' locked'}`, role: 'group', 'aria-label': 'Your verdict' }, verdictLabel, ...faces);
      const bar = el('div', { class: 'action-bar' });
      if (item.prompt) {
        const copy = el('button', { class: 'btn-copy', type: 'button' }, 'Copy Prompt');
        copy.addEventListener('click', async () => {
          if (!state.copied.includes(item.id)) { state.copied.push(item.id); save(); }
          verdict.classList.remove('locked');
          verdictLabel.textContent = 'Your verdict';
          faces.forEach((b) => { b.disabled = false; });
          const ok = await copyText(item.prompt);
          note.textContent = ok ? 'Copied. Try it in Copilot, then pick a face.' : 'Could not copy for you. Select the text and copy it yourself.';
          copy.textContent = ok ? 'Copied!' : 'Copy Prompt';
          copy.classList.toggle('success', ok);
          setTimeout(() => { copy.textContent = 'Copy Prompt'; copy.classList.remove('success'); }, 1500);
        });
        bar.append(copy);
      }
      // Your own entry is for other people to judge: no faces, and it says why.
      bar.append(item.mine ? el('span', { class: 'verdict-label own-entry' }, 'This one is yours. Other staff vote on it.') : verdict);
      const face = FACES.find((f) => f.kind === mine);
      const details = el('details', { 'data-id': String(item.id) },
        el('summary', {},
          el('span', { class: 'ex-num' }, ('0' + (i + 1)).slice(-2)),
          el('span', { class: 'sum-title' }, item.purpose),
          el('span', { class: 'tally' }, FACES.map((f) => `${f.emoji} ${item[f.kind]}`).join('  ')),
          el('span', { class: 'verdict-badge', 'aria-hidden': 'true' }, face ? face.emoji : '')),
        el('div', { class: 'details-content' },
          item.prompt ? promptBody(item.prompt) : el('p', { class: 'muted' }, 'No prompt shared, just the idea. Is it one you would use?'),
          bar, note));
      if (!item.prompt) details.classList.add('idea-only'); // nothing to "view" but the idea
      details.open = open.has(item.id);
      details.addEventListener('toggle', () => { if (details.open) open.add(item.id); else open.delete(item.id); });
      return details;
    }));
    if (at && at.id) {
      const row = list.querySelector(`details[data-id="${at.id}"]`);
      const target = row && (at.what === 'summary' ? row.querySelector('summary')
        : at.what === 'copy' ? row.querySelector('.btn-copy') : row.querySelector(`.face[data-kind="${at.what}"]`));
      if (target) (target as HTMLElement).focus();
    }
  }

  async function refresh() {
    try {
      const items = await getCommunity();
      try { localStorage.setItem(CACHE, JSON.stringify(items)); } catch { /* fine */ }
      render(items);
    } catch {
      // Vote server away: show the last list we saw, without comment.
      if (!shown.length) {
        try { render(JSON.parse(localStorage.getItem(CACHE) || '[]')); } catch { render([]); }
      }
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Checked here first, so a bad entry is refused at once, server or no server.
    const problem = shareProblem(purpose.value, prompt.value);
    if (problem) {
      status.textContent = problem;
      purpose.setAttribute('aria-invalid', 'true');
      purpose.setAttribute('aria-describedby', 'share-status');
      purpose.focus();
      return;
    }
    const job = { t: 'share' as const, purpose: purpose.value, prompt: prompt.value };
    purpose.value = '';
    prompt.value = '';
    status.textContent = 'Thank you. It will appear once a facilitator has approved it.';
    deliver(job).then((refused) => {
      if (refused) {
        // The server said no (too many this hour, say): give their words back with the reason.
        status.textContent = refused;
        if (!purpose.value && !prompt.value) { purpose.value = job.purpose; prompt.value = job.prompt; }
      }
      refresh();
    });
  });

  // An old message, such as a refusal, should not linger once they start again.
  form.addEventListener('input', () => { status.textContent = ''; purpose.removeAttribute('aria-invalid'); });

  refresh();
  // Other people's prompts and votes arrive without a page reload, unless you are mid-read.
  setInterval(() => {
    // Not while someone is in the list: rebuilding it would lose their place or their selection.
    const selection = document.getSelection();
    const reading = list.contains(document.activeElement) || Boolean(selection && !selection.isCollapsed && list.contains(selection.anchorNode));
    if (!document.hidden && !reading) refresh();
  }, 20000);
}
