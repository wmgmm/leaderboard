import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { GlassHeader } from '../layout/GlassHeader';
import { SwipeCard } from './SwipeCard';
import { useTimer } from '../../hooks/useTimer';

export function SprintMode() {
  useTimer();
  const { shuffledCases, currentCardIndex, refreshBoard } = useAppStore();

  // The tags on the cards come from the room's chart. It is asked for now and then,
  // never held open as a stream: a browser allows only about six connections per site.
  useEffect(() => {
    refreshBoard();
    const timer = setInterval(() => { if (!document.hidden) refreshBoard(); }, 10000);
    return () => clearInterval(timer);
  }, [refreshBoard]);

  const remaining = shuffledCases.length - currentCardIndex;

  return (
    // Exactly one screen tall, so nothing scrolls: the card sizes itself to what is left.
    // Below 30em of height (very large text on a small screen) the page scrolls instead,
    // because cutting things off would be worse.
    <motion.div
      key="sprint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col select-none"
      style={{ background: 'var(--bg-page)', height: '100dvh', minHeight: '30em', WebkitUserSelect: 'none' }}
    >
      <GlassHeader />

      {/* Starts just under the top bar; no centring, so the vote buttons stay on screen */}
      <div className="flex-1 min-h-0 flex flex-col px-5 pb-4" style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 3.75rem)' }}>
        {remaining > 0 ? (
          <SwipeCard />
        ) : (
          <div className="text-center m-auto" style={{ color: 'var(--text-secondary)' }}>
            <p className="text-4xl mb-3">✓</p>
            <p>All cards reviewed!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
