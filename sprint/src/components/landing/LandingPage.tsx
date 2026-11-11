import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { useCases } from '../../data/useCases';
import { TRY_IT_URL } from '../../lib/session';

export function LandingPage() {
  const { initSprint, setView, savedCases, syncVotes, openShare, justShared, hasSprinted, votes } = useAppStore();
  // A first visit shows two choices only. The rest appear once they have sprinted or voted.
  const returning = hasSprinted || Object.keys(votes).length > 0;
  const rated = useCases.filter(c => votes[c.id]).length;
  useEffect(() => { syncVotes(); }, [syncVotes]);

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col min-h-screen px-6"
      style={{ background: 'var(--bg-page)' }}
    >
      {/* Centred content grows to fill available space */}
      <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
        {/* The same blue banner as the top of the workshop page, which links here. */}
        <div className="top-banner">
          <div className="glass-row">
            <div className="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" />
                <path d="M5.6 5.6l2.8 2.8" /><path d="M15.6 15.6l2.8 2.8" /><path d="M5.6 18.4l2.8-2.8" /><path d="M15.6 8.4l2.8-2.8" />
              </svg>
            </div>
            <div className="words">
              <span className="eyebrow">Workshop Activity · 5 min</span>
              <h1>Community Top of the Prompts</h1>
              <span className="desc">Find your next experiment and share what is useful.</span>
            </div>
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-lg max-w-md lg:max-w-none lg:whitespace-nowrap mb-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {rated === 0
            ? 'You will browse some prompts and just think "Could this be useful?"'
            : `You've rated ${rated === useCases.length ? 'all ' + rated : rated + ' of ' + useCases.length}. Now please share a useful prompt that helped you!`}
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-sm max-w-sm lg:max-w-md mb-14"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Vote for prompts and share prompts that are useful. Your votes are anonymous.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-4"
        >
          {/* A red arrow points at the button to press next: the sprint on a first visit,
              sharing a prompt of their own once they have done a sprint. */}
          <div className="relative flex flex-col">
            {!returning && (
              <svg className="start-arrow" viewBox="0 0 24 32" aria-hidden="true">
                <path d="M12 2v24M3 18l9 10 9-10" />
              </svg>
            )}
            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => initSprint(true)}
              // The solid blue button is the one the arrow points at: the sprint first, sharing after.
              className={`${returning ? 'btn-secondary' : 'btn-primary'} px-8 py-3.5 text-sm`}
              style={returning ? undefined : { boxShadow: '0 2px 12px rgba(0, 113, 227, 0.35)' }}
            >
              Start 5-Minute Sprint
            </motion.button>
          </div>

          {/* Share a prompt of their own straight away, without doing the sprint first */}
          <div className="relative flex flex-col">
            {returning && (
              <svg className="start-arrow" viewBox="0 0 24 32" aria-hidden="true">
                <path d="M12 2v24M3 18l9 10 9-10" />
              </svg>
            )}
            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={openShare}
              className={`${returning ? 'btn-primary' : 'btn-secondary'} px-8 py-3.5 text-sm`}
              style={returning ? { boxShadow: '0 2px 12px rgba(0, 113, 227, 0.35)' } : undefined}
            >
              Share a useful prompt 💡
            </motion.button>
          </div>

          {returning && (
            <motion.a
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              href={TRY_IT_URL}
              className="btn-secondary px-8 py-3.5 text-sm"
            >
              View all the prompts
            </motion.a>
          )}

          {returning && savedCases.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setView('results')}
              className="btn-secondary px-8 py-3.5 text-sm"
            >
              View my {savedCases.length} loved prompt{savedCases.length === 1 ? '' : 's'}
            </motion.button>
          )}
        </motion.div>

        <p role="status" className="text-sm mt-4 min-h-[1.25rem]" style={{ color: 'var(--text-secondary)' }}>
          {justShared ? 'Shared. Thank you.' : ''}
        </p>
      </div>

      {/* Footer sits naturally below content - never overlaps */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="text-xs text-center pb-8"
        style={{
          color: 'var(--text-tertiary)',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}
      >
        Created by Dr. Matt Mort & Mr. Matt Hayden · Cardiff University
      </motion.p>
    </motion.div>
  );
}
