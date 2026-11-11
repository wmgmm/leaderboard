import { applyFilter } from '../../shared/filters';
import { lovedPercent } from '../../shared/ranking';
import type { FilterKey } from '../../shared/filters';
import type { Board, CommunityItem, Prompt } from '../../shared/types';
import { el, getCommunity, getPrompts, watchBoard } from './api';
import { FACES } from './faces';

const chart = document.getElementById('chart')!;
const meta = document.getElementById('meta')!;
const filters = document.getElementById('filters')!;
// No room codes for now: the chart is the standing one for everyone. ?code= is still honoured.
const code = (new URLSearchParams(location.search).get('code') || 'OPEN').toUpperCase();
const CACHE = `totp-board-${code}`; // the last chart seen, shown at once and if the server is away

// The views, in the order of their buttons, with what to say when a view is empty.
const VIEWS: { key: FilterKey; label: string; empty: string }[] = [
  { key: 'all', label: 'The chart', empty: 'No prompts on the chart yet.' },
  { key: 'today', label: '\u{1F4C5} Today', empty: 'No votes yet today. Somebody go first.' },
  { key: 'loved', label: '\u{1F600} Loved', empty: 'No clear favourites yet. Give it a minute.' },
  { key: 'marmite', label: '\u{1F937} Marmite', empty: 'Nothing is splitting the room yet.' },
  { key: 'disliked', label: '\u{1F641} Not landing', empty: 'Nothing disliked yet. Suspiciously polite.' },
  { key: 'unrated', label: '\u{1F97A} No votes yet', empty: 'Every prompt has had a vote. Good work, everyone.' },
  { key: 'community', label: '\u{1F4A1} Community prompts', empty: 'No community prompts yet. Somebody go first.' },
];

/** One row as drawn: a prompt on the chart, or a prompt staff added themselves. */
interface Shown { id: string; pos: number; title: string; score: number | null; happy: number; neutral: number; sad: number }

let view: FilterKey = VIEWS.some((v) => '#' + v.key === location.hash) ? (location.hash.slice(1) as FilterKey) : 'all';
let board: Board | null = null;
let community: CommunityItem[] = [];
let titles = new Map<string, string>();

const rowEls = new Map<string, HTMLElement>();
const emptyNote = el('li', { class: 'chart-empty' });

/** Only prompts that still exist: a saved chart can hold one that has since been removed. */
const chartRows = () => (board ? board.rows.filter((row) => titles.has(row.id)) : []);
/** Today's chart: its own scores and positions, from today's votes alone. */
const todayRows = () => (board?.today ? board.today.rows.filter((row) => titles.has(row.id)) : []);
const countOf = (key: FilterKey, rows: ReturnType<typeof chartRows>) =>
  key === 'community' ? community.length : key === 'today' ? todayRows().length : applyFilter(key, rows).length;

function rowsToShow(): Shown[] {
  if (view === 'community') {
    return community.map((c, i) => ({ id: `c${c.id}`, pos: i + 1, title: c.purpose, score: c.score ?? null, happy: c.happy, neutral: c.neutral, sad: c.sad }));
  }
  return (view === 'today' ? todayRows() : applyFilter(view, chartRows())).map((r) => ({ id: r.id, pos: r.rank, title: titles.get(r.id)!, score: r.score ?? null, happy: r.happy, neutral: r.neutral, sad: r.sad }));
}

// The buttons are made once and then only updated: rebuilding them on every chart update
// would take the keyboard's place away from whoever is using them.
const filterButtons = new Map<FilterKey, { button: HTMLButtonElement; count: HTMLElement }>();
function drawFilters() {
  if (!filterButtons.size) {
    for (const v of VIEWS) {
      const count = el('span', { class: 'filter-count' });
      const button = el('button', { type: 'button', class: 'filter' }, v.label, count);
      button.addEventListener('click', () => {
        view = v.key;
        history.replaceState(null, '', v.key === 'all' ? location.pathname + location.search : '#' + v.key);
        if (view === 'community') refreshCommunity();
        draw();
      });
      filterButtons.set(v.key, { button, count });
      filters.append(button);
    }
  }
  const rows = chartRows();
  for (const v of VIEWS) {
    const { button, count } = filterButtons.get(v.key)!;
    button.setAttribute('aria-pressed', String(v.key === view));
    count.textContent = String(countOf(v.key, rows));
  }
}

function draw() {
  drawFilters();
  const rows = rowsToShow();

  const current = new Set(rows.map((row) => row.id));
  rowEls.forEach((node, id) => {
    if (!current.has(id)) { node.remove(); rowEls.delete(id); }
  });
  // FLIP: note where each row is, reorder, then slide each from its old place.
  const firstTop = new Map<string, number>();
  rowEls.forEach((node, id) => firstTop.set(id, node.getBoundingClientRect().top));

  emptyNote.remove();
  if (!rows.length) {
    emptyNote.textContent = view === 'community' || board ? VIEWS.find((v) => v.key === view)!.empty : 'Waiting for the vote server. The chart will appear here by itself.';
    chart.append(emptyNote);
  }

  for (const row of rows) {
    let node = rowEls.get(row.id);
    if (!node) {
      node = el('li', { class: 'chart-row' },
        el('span', { class: 'bar', 'aria-hidden': 'true' }, ...FACES.map((f) => el('span', { class: 'seg', 'data-kind': f.kind }))),
        el('span', { class: 'pos' }), el('span', { class: 'title' }, row.title),
        el('span', { class: 'tally' }, ...FACES.map((f) => el('span', { 'data-kind': f.kind }))),
        el('span', { class: 'pct' }),
        el('span', { class: 'pts' }));
      rowEls.set(row.id, node);
    }
    node.querySelector('.pos')!.textContent = String(row.pos);
    // The bar's length is the score, so the bars step down with the chart. Its colours are
    // the split of the votes: green loved it, orange it's OK, red not for me.
    const votes = row.happy + row.neutral + row.sad;
    for (const f of FACES) {
      node.querySelector<HTMLElement>(`.seg[data-kind="${f.kind}"]`)!.style.width = votes ? `${(row[f.kind] / votes) * (row.score ?? 0) * 10}%` : '0';
    }
    // Three things per row: the faces counted, how many loved it, and the score it is ranked by.
    for (const f of FACES) node.querySelector(`.tally [data-kind="${f.kind}"]`)!.textContent = `${f.emoji} ${row[f.kind]}`;
    const loved = lovedPercent(row);
    node.querySelector('.pct')!.textContent = loved === null ? '' : `${loved}% loved`;
    node.querySelector('.pts')!.textContent = !votes ? 'No votes yet' : typeof row.score !== 'number' ? '' : `Score ${row.score.toFixed(1)}`;
    chart.append(node); // appending in order reorders the list
  }

  // People who have asked their device for less motion get the new order without the slide.
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  rowEls.forEach((node, id) => {
    const before = firstTop.get(id);
    if (still || before === undefined) return;
    const delta = before - node.getBoundingClientRect().top;
    if (!delta) return;
    node.style.transition = 'none';
    node.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)';
      node.style.transform = '';
    }));
  });

  if (board) {
    const voters = view === 'today' ? board.today?.voters ?? 0 : board.voters;
    meta.textContent = `${voters} ${voters === 1 ? 'voter' : 'voters'}${view === 'today' ? ' today' : ''}`;
  }
}

function refreshCommunity() {
  getCommunity().then((items) => {
    if (!Array.isArray(items)) return;
    community = items.filter(Boolean);
    if (view === 'community') draw(); else drawFilters();
  }).catch(() => { /* vote server away: keep what is on screen */ });
}

// The chart is sized from the window, and plain vh and vw units undo the browser's zoom
// (Ctrl and plus or minus). So the units are worked out here with the zoom put back in:
// outerWidth ignores zoom, innerWidth does not, so their ratio is the zoom level.
function sizeToWindow() {
  let zoom = window.outerWidth / window.innerWidth;
  if (!(zoom > 0.2 && zoom < 6) || window.top !== window) zoom = 1;
  if (Math.abs(zoom - 1) < 0.04) zoom = 1; // window borders, not zoom
  document.documentElement.style.setProperty('--pvh', `${(window.innerHeight * zoom) / 100}px`);
  document.documentElement.style.setProperty('--pvw', `${(window.innerWidth * zoom) / 100}px`);
}
sizeToWindow();
window.addEventListener('resize', sizeToWindow);

const isBoard = (b: unknown): b is Board => {
  const x = b as Board | null;
  const rows = (list: unknown) => Array.isArray(list) && list.every((r) => r && typeof r.id === 'string');
  return Boolean(x && x.session && rows(x.rows) && (x.today === undefined || (x.today && rows(x.today.rows))));
};

async function start() {
  const prompts: Prompt[] = await getPrompts();
  titles = new Map(prompts.map((p) => [p.id, p.title] as const));
  try { const last = localStorage.getItem(CACHE); if (last) board = JSON.parse(last); } catch { /* no saved chart */ }
  if (!isBoard(board)) board = null; // a damaged saved chart must not stop the live one
  draw();
  watchBoard(code, (latest) => {
    if (!isBoard(latest)) return; // not a chart: keep what is on screen
    board = latest;
    try { localStorage.setItem(CACHE, JSON.stringify(latest)); } catch { /* fine */ }
    draw();
  }, (mode) => document.body.setAttribute('data-feed', mode));
  // Community prompts are not part of the live stream, so they are asked for: often
  // while that view is on screen, now and then otherwise to keep its count right.
  refreshCommunity();
  setInterval(() => { if (!document.hidden && view === 'community') refreshCommunity(); }, 5000);
  setInterval(() => { if (!document.hidden && view !== 'community') refreshCommunity(); }, 30000);
}
start().catch(() => { meta.textContent = 'The chart did not load. Refresh the page.'; setTimeout(() => location.reload(), 15000); });
