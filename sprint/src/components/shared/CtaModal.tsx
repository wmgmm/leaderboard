import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { CTA_CONTENT } from '../../data/ctaContent';

export function CtaModal() {
  const { showCtaModal, setShowCtaModal } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCtaModal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setShowCtaModal]);

  return (
    <AnimatePresence>
      {showCtaModal && (
        <>
          <motion.div
            key="cta-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCtaModal(false)}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />

          <motion.div
            key="cta-modal"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg z-50 rounded-2xl p-6 overflow-y-auto"
            style={{
              background: 'var(--bg-card)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              bottom: 'max(16px, env(safe-area-inset-bottom))',
              maxHeight: 'calc(100dvh - 48px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cta-heading"
          >
            <button
              autoFocus
              onClick={() => setShowCtaModal(false)}
              aria-label="Close"
              className="absolute top-4 right-4 transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}
            >
              ✕
            </button>

            <h2 id="cta-heading" className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {CTA_CONTENT.heading}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{CTA_CONTENT.intro}</p>

            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                📣 {CTA_CONTENT.shareWorkshop.title}
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{CTA_CONTENT.shareWorkshop.body}</p>
              <a href={CTA_CONTENT.shareWorkshop.linkHref} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium" style={{ color: 'var(--apple-blue)', textDecoration: 'none' }}>
                {CTA_CONTENT.shareWorkshop.linkLabel} →
              </a>
            </div>

            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                🎓 {CTA_CONTENT.trainTheTrainer.title}
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{CTA_CONTENT.trainTheTrainer.body}</p>
              <a href={CTA_CONTENT.trainTheTrainer.linkHref} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium" style={{ color: 'var(--apple-blue)', textDecoration: 'none' }}>
                {CTA_CONTENT.trainTheTrainer.linkLabel} →
              </a>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                🛡️ {CTA_CONTENT.governance.title}
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{CTA_CONTENT.governance.body}</p>
              <a href={CTA_CONTENT.governance.linkHref} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium" style={{ color: 'var(--apple-blue)', textDecoration: 'none' }}>
                {CTA_CONTENT.governance.linkLabel} →
              </a>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-tertiary)' }}>
                {CTA_CONTENT.contact.heading}
              </h3>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{CTA_CONTENT.contact.intro}</p>
              {CTA_CONTENT.contact.people.map(p => (
                <div key={p.email} className="text-xs mb-1">
                  <span style={{ color: 'var(--text-secondary)' }}>{p.name}: </span>
                  <a href={`mailto:${p.email}`} style={{ color: 'var(--apple-blue)', textDecoration: 'none' }}>{p.email}</a>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
