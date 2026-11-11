import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { buzzFor, pickUnloved } from '../../../../shared/buzz';
import type { ReactionKind } from '../../../../shared/types';
import { FACES } from '../../../../web/src/faces';
import { useAppStore } from '../../store/useAppStore';
import { Examples, PromptText } from '../shared/PromptText';
import { CATEGORY_COLOR } from '../../data/categories';
import { useHaptics } from '../../hooks/useHaptics';
import { SWIPE_VELOCITY_THRESHOLD, SWIPE_OFFSET_THRESHOLD } from '../../lib/constants';

// Where each vote sends the card: right for loved it, left for not for me, up for it's OK.
const EXIT: Record<ReactionKind, { x: number; y: number }> = {
  happy: { x: 500, y: 0 }, sad: { x: -500, y: 0 }, neutral: { x: 0, y: -500 },
};
const TINT: Record<ReactionKind, string> = {
  happy: 'rgba(52,199,89,0.5)', sad: 'rgba(255,59,48,0.5)', neutral: 'rgba(255,159,10,0.6)',
};
// The swipe and the arrow key that do the same as each face.
const HOW: Record<ReactionKind, string> = { sad: '\u2190 swipe left', neutral: '\u2191 swipe up', happy: 'swipe right \u2192' };
// On screen the faces sit in swipe order: left, up, right.
const BUTTONS = (['sad', 'neutral', 'happy'] as ReactionKind[]).map(kind => FACES.find(f => f.kind === kind)!);

/** Which vote a drag of (mx, my) is heading for, or null if it has not gone far enough. */
function leaning(mx: number, my: number, far: number): ReactionKind | null {
  if (Math.abs(mx) >= Math.abs(my)) return mx > far ? 'happy' : mx < -far ? 'sad' : null;
  return my < -far ? 'neutral' : null;
}

export function SwipeCard() {
  const { shuffledCases, currentCardIndex, vote, votes, board } = useAppStore();
  const card = shuffledCases[currentCardIndex];
  const nextCard = shuffledCases[currentCardIndex + 1];
  const { pulse } = useHaptics();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const opacity = useTransform<number, number>([x, y], ([lx, ly]) => {
    const far = Math.max(Math.abs(lx), Math.abs(ly));
    return far < 100 ? 1 : Math.max(0, 1 - (far - 100) / 100);
  });
  const borderColor = useTransform<number, string>([x, y], ([lx, ly]) => {
    const kind = leaning(lx, ly, 40);
    return kind ? TINT[kind] : 'rgba(0,0,0,0.06)';
  });
  const [isDragging, setIsDragging] = useState(false);
  const [key, setKey] = useState(0);
  const leaving = useRef(false); // a card on its way out ignores further votes
  const reduceMotion = useReducedMotion(); // the fly-out is skipped for people who asked for less motion
  // The prompt box only takes over vertical touches when it really has text to scroll;
  // otherwise an upward swipe that starts on the prompt would be swallowed as a scroll.
  const promptBox = useRef<HTMLDivElement>(null);
  const [promptScrolls, setPromptScrolls] = useState(false);
  useLayoutEffect(() => {
    const box = promptBox.current;
    setPromptScrolls(Boolean(box && box.scrollHeight > box.clientHeight + 1));
  }, [currentCardIndex]);

  const commit = (kind: ReactionKind) => {
    if (leaving.current) return;
    leaving.current = true;
    const next = () => {
      if (kind === 'happy') pulse(10);
      // Whatever goes wrong in recording the vote (browser storage full, say), the next
      // card must still come up: otherwise the screen is left blank and stuck.
      try { vote(kind); } finally {
        x.set(0);
        y.set(0);
        setKey(k => k + 1);
        // A double tap must not also vote on the card that has only just appeared:
        // nobody has read it in a quarter of a second.
        setTimeout(() => { leaving.current = false; }, 250);
      }
    };
    // No fly-out at all with reduced motion. A zero-length animation is not the same thing:
    // it lands a frame after its promise resolves, which moved the next card off screen
    // and left a blank one (the workshop of 11 Nov 2026).
    if (reduceMotion) { next(); return; }
    const out = EXIT[kind];
    Promise.all([
      animate(x, out.x, { type: 'tween', duration: 0.25 }),
      animate(y, out.y, { type: 'tween', duration: 0.25 }),
    ]).then(next);
  };

  const bind = useDrag(
    ({ movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], last }) => {
      if (leaving.current) return;
      if (!last) { x.set(mx); y.set(Math.min(my, 0)); setIsDragging(true); return; }
      setIsDragging(false);
      // A flick counts only if it was still heading the way the card had gone: dragging right
      // and then flicking back left is a change of mind, not a "Loved it".
      const flicked = Math.abs(mx) >= Math.abs(my)
        ? vx > SWIPE_VELOCITY_THRESHOLD && Math.sign(dx) === Math.sign(mx)
        : vy > SWIPE_VELOCITY_THRESHOLD && dy < 0;
      const kind = leaning(mx, my, flicked ? 20 : SWIPE_OFFSET_THRESHOLD);
      if (kind) {
        commit(kind);
      } else {
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
        animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
      }
    },
    { filterTaps: true }
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Not a held-down key (which would vote on card after card), not a browser shortcut
      // such as Alt+Left for Back, and not while the keyboard is scrolling the prompt text.
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target instanceof Element && e.target.closest('[data-scroll]')) return;
      if (e.key === 'ArrowRight') commit('happy');
      if (e.key === 'ArrowLeft') commit('sad');
      if (e.key === 'ArrowUp') { e.preventDefault(); commit('neutral'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit reads only refs and motion values
  }, [currentCardIndex]);

  if (!card) return null;

  const catColor = CATEGORY_COLOR[card.cat];
  const earlier = FACES.find(f => f.kind === votes[card.id]);
  // What is left, said so that it adds up for someone coming back: new ones first, then
  // the ones they voted on before, which they can leave as they are or change.
  const left = shuffledCases.slice(currentCardIndex);
  const newLeft = left.filter(c => !votes[c.id]).length;
  const toGo = newLeft > 0
    ? (newLeft === left.length ? `${left.length} to go` : `${newLeft} new to go, then ${left.length - newLeft} you've seen`)
    : `Seen before: ${left.length} to go`;

  // How this prompt is doing in the room, using the same rules as the try-it page.
  let tag: { emoji: string; label: string } | null = null;
  if (board && board.session && Array.isArray(board.rows) && !board.session.hidden) { // a reply that is not a board must not blank the page
    const row = board.rows.find(r => r.id === card.id);
    const buzz = row ? buzzFor(row, board.voters) : null;
    if (buzz && buzz.key === 'unloved') {
      const unloved = board.rows.filter(r => buzzFor(r, board.voters)?.key === 'unloved').map(r => r.id);
      tag = pickUnloved(unloved, Date.now()).includes(card.id) ? buzz : null;
    } else {
      tag = buzz;
    }
  }

  // Layout: everything sits in one screen, from the top, and nothing needs scrolling.
  // The card takes whatever height is left after the question and the vote buttons, so
  // the buttons can never fall off the bottom. The breakpoints are in em, which follow
  // the reader's own text size: with larger text or zoom the screen is "shorter", and
  // the least important parts step aside (the hints first, then the examples).
  return (
    <div className="flex flex-col gap-3 w-full max-w-sm md:max-w-2xl lg:max-w-3xl mx-auto flex-1 min-h-0">
      {/* For screen readers: each new card is read out, since nothing else says it has changed */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {card.title}. {card.desc} {toGo}.
      </p>

      {/* The question being asked of every card, and how many are left */}
      <div className="flex items-baseline justify-between gap-3 shrink-0 px-1">
        <h1 className="text-base md:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Would you use this prompt?
        </h1>
        <p className="text-xs md:text-sm whitespace-nowrap" style={{ color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {toGo}
        </p>
      </div>

      {/* The card: as tall as the screen allows, up to a comfortable maximum */}
      <div className="relative w-full flex-1 min-h-0" style={{ maxHeight: '32rem' }}>
        {/* Next card shadow */}
        {nextCard && (
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-card)',
              transform: 'scale(0.95) translateY(10px)',
              opacity: 0.6,
            }}
          />
        )}

        {/* Main swipe card */}
        <motion.div
          key={key}
          {...(bind() as object)}
          style={{
            x,
            y,
            rotate,
            opacity,
            borderColor,
            borderWidth: isDragging ? '2px' : '1px',
            borderStyle: 'solid',
            background: 'var(--bg-card)',
            boxShadow: isDragging ? 'none' : 'var(--shadow-card-hover)',
            // The card takes every drag, including upwards, so the page must not scroll under it.
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          className="absolute inset-0 rounded-2xl p-5 md:p-8 [@media(max-height:46em)]:p-5 flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Section, and how it is doing in the room */}
          <div className="flex items-center justify-between gap-2 mb-3 shrink-0 [@media(max-height:36em)]:hidden">
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: `${catColor}18`, color: 'var(--text-primary)', border: `1px solid ${catColor}66` }}
            >
              {card.cat}
            </span>
            <div className="flex items-center gap-1.5">
              {tag && (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: '#fff4e5', color: '#9a4d00' }}
                >
                  {tag.emoji} {tag.label}
                </span>
              )}
              {earlier && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: 'var(--bg-page)', color: 'var(--text-secondary)' }}
                >
                  You said {earlier.emoji}
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h2
            className="text-xl md:text-3xl [@media(max-height:46em)]:text-2xl font-bold mb-1.5 leading-tight shrink-0"
            style={{ color: 'var(--text-primary)', textWrap: 'balance' }}
          >
            {card.title}
          </h2>

          {/* Description */}
          <p className="text-sm md:text-base mb-4 [@media(max-height:46em)]:mb-3 shrink-0" style={{ color: 'var(--text-secondary)', textWrap: 'balance' }}>
            {card.desc}
          </p>

          {/* The prompt, with the part to change in bold. The box fills the rest of the card,
              so it is the same size on every card; a short prompt sits in the middle of it
              and a long one scrolls. */}
          <div
            ref={promptBox}
            tabIndex={0} role="group" aria-label="Prompt text" data-scroll
            className="rounded-xl px-4 py-3 md:px-6 md:py-5 flex-1 min-h-0 overflow-auto flex flex-col focus-visible:outline-2 focus-visible:outline-[#0071e3]"
            style={{ background: 'var(--bg-page)', touchAction: promptScrolls ? 'pan-y' : 'none' }}
          >
            <p
              className="my-auto text-sm md:text-lg [@media(max-height:46em)]:text-base leading-relaxed whitespace-pre-line"
              style={{ color: 'var(--text-primary)', textWrap: 'pretty' }}
            >
              <PromptText text={card.prompt} />
            </p>
          </div>

          {/* What the bold part could be instead: two is enough on a card. With an
              "or upload" tag there is room for one example beside it. */}
          {(card.examples.length > 0 || card.upload) && (
            <div className="mt-4 shrink-0 [@media(max-height:46em)]:mt-3 [@media(max-height:36em)]:hidden">
              <Examples items={card.examples.slice(0, card.upload ? 1 : 2)} upload={card.upload} />
            </div>
          )}

          {/* A caveat or a hint the person needs, such as "not legal advice" */}
          {card.note && (
            <p className="mt-2 text-xs md:text-sm shrink-0 [@media(max-height:36em)]:hidden" style={{ color: 'var(--text-secondary)' }}>
              {card.note}
            </p>
          )}
        </motion.div>
      </div>

      {/* How to answer: three buttons the width of the card. Each shows the swipe that does the same. */}
      <div className="grid grid-cols-3 gap-3 w-full shrink-0">
        {BUTTONS.map(face => (
          <motion.button
            key={face.kind}
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -2 }}
            onClick={() => commit(face.kind)}
            aria-label={face.label}
            className="flex items-center justify-center gap-2.5 rounded-2xl px-3 py-2.5 md:py-3 transition-colors"
            style={{ background: 'var(--bg-card)', border: `2px solid ${TINT[face.kind]}`, color: 'var(--text-primary)', boxShadow: 'var(--shadow-card)' }}
          >
            <span className="text-2xl md:text-3xl leading-none" aria-hidden="true">{face.emoji}</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm md:text-base font-semibold">{face.label}</span>
              <span className="text-[11px] md:text-xs [@media(max-height:46em)]:hidden" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true">
                {HOW[face.kind]}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
      <p className="text-xs text-center shrink-0 [@media(max-height:46em)]:hidden" style={{ color: 'var(--text-tertiary)' }}>
        Tap a face, swipe the card, or use the arrow keys.
      </p>
    </div>
  );
}
