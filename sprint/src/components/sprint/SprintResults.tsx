import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { CATEGORY_COLOR } from '../../data/categories';
import { useCases } from '../../data/useCases';
import { flushOutbox } from '../../../../shared/client';
import { copyText } from '../../../../web/src/api';
import { ExportButton } from '../shared/ExportButton';
import { PromptText } from '../shared/PromptText';
import { CHART_URL, TRY_IT_URL, WORKSHOP_URL } from '../../lib/session';

export function SprintResults() {
  const { savedCases, votes, setView, setShowCtaModal, initSprint, clearPicks } = useAppStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const voted = Object.keys(votes).length;
  // Picks are saved as whole cards; show today's wording for each, not the wording saved with it.
  const loved = savedCases.map(saved => useCases.find(c => c.id === saved.id) ?? saved);

  // Any vote that could not be sent during the sprint gets another go now, quietly.
  useEffect(() => { flushOutbox(); }, []);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const topCat = savedCases.length > 0
    ? Object.entries(
        savedCases.reduce((acc, uc) => { acc[uc.cat] = (acc[uc.cat] || 0) + 1; return acc; }, {} as Record<string, number>)
      ).sort(([, a], [, b]) => b - a)[0]?.[0]
    : null;

  // The same careful copy as the try-it page: it copes with a blocked clipboard and says so.
  const [copyFailed, setCopyFailed] = useState(false);
  const copyPrompt = async (id: string, prompt: string) => {
    const ok = await copyText(prompt);
    setCopyFailed(!ok);
    if (!ok) return;
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Arriving here is a change of screen, sometimes unprompted (the clock ran out), so the
  // heading takes focus: keyboard and screen reader users start from the top of the results.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen px-5 py-8"
      style={{ background: 'var(--bg-page)', paddingTop: 'max(32px, env(safe-area-inset-top))' }}
    >
      {/* As wide as the list on the "View ALL the prompts" page (its 1080px container less padding) */}
      <div className="max-w-[1036px] mx-auto">
        <div className="max-w-lg lg:max-w-xl mx-auto">
        {/* Stats */}
        <div className="text-center mb-8">
          <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold mb-1 outline-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Sprint complete!
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your votes are on the chart. Here are the prompts you loved.
          </p>

          <div className="flex justify-center gap-4 mt-6">
            <div className="card px-6 py-4 text-center">
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{savedCases.length}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Loved</p>
            </div>
            <div className="card px-6 py-4 text-center">
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{voted}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Voted on</p>
            </div>
            {topCat && (
              <div className="card px-6 py-4 text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)', borderBottom: `3px solid ${CATEGORY_COLOR[topCat as keyof typeof CATEGORY_COLOR]}` }}>
                  {topCat}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Top section</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          <ExportButton />
          <button
            onClick={() => initSprint(true)}
            className="flex-1 rounded-full py-3 text-sm font-semibold transition-colors"
            style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            Sprint Again
          </button>
        </div>

        {/* Where to go next: each choice says what it is, so nobody has to guess */}
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>What next?</h2>
        <div className="flex flex-col gap-2 mb-8">
          <a href={TRY_IT_URL} className="next-step">
            <span className="icon" aria-hidden="true">📋</span>
            <span>
              <span className="what">View ALL the prompts</span>
              <span className="why">Every prompt in one list, each with a Copy button to try it in Copilot.</span>
            </span>
            <span className="go" aria-hidden="true">→</span>
          </a>
          <a href={CHART_URL} className="next-step">
            <span className="icon" aria-hidden="true">🏆</span>
            <span>
              <span className="what">See the live chart</span>
              <span className="why">How everyone has voted so far, updating as votes come in.</span>
            </span>
            <span className="go" aria-hidden="true">→</span>
          </a>
          <a href={WORKSHOP_URL} className="next-step">
            <span className="icon" aria-hidden="true">🎓</span>
            <span>
              <span className="what">Go to the workshop website</span>
              <span className="why">The full AI in the Workplace workshop, to work through in your own time.</span>
            </span>
            <span className="go" aria-hidden="true">→</span>
          </a>
        </div>

        </div>

        {copyFailed && (
          <p role="status" className="text-sm text-center mb-4" style={{ color: 'var(--text-secondary)' }}>
            Could not copy for you. Select the text and copy it yourself.
          </p>
        )}

        {/* Loved list */}
        {savedCases.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <p className="text-4xl mb-3">🌱</p>
            <p>Nothing loved this time. Tough crowd.</p>
          </div>
        ) : (
          // The same rows as the "View ALL the prompts" page, holding only the ones they loved.
          <section className="loved-card">
            <h2>The prompts you loved</h2>
            {loved.map((uc, i) => (
              <details key={uc.id}>
                <summary>
                  <span className="ex-num">{i + 1}</span>
                  <span className="sum-title">{uc.title}</span>
                  <span className="verdict-badge" aria-hidden="true">😀</span>
                </summary>
                <div className="details-content">
                  <div className="exercise-note">
                    <p className="about">{uc.desc}</p>
                    {(uc.examples.length > 0 || uc.upload) && (
                      <p className="examples">
                        <span className="examples-label">Try</span>
                        {uc.examples.map(example => <span key={example} className="example">{example}</span>)}
                        {uc.upload && (
                          <span className="example upload">
                            <span aria-hidden="true">{({ photo: '📷', file: '📎', sheet: '📊', mic: '🎤' })[uc.upload.icon]}</span>{' '}
                            {uc.upload.text.charAt(0).toLowerCase() + uc.upload.text.slice(1)}
                          </span>
                        )}
                      </p>
                    )}
                    {uc.note && <p className="tip">{uc.note}</p>}
                  </div>
                  <div className="prompt-box"><PromptText text={uc.prompt} /></div>
                  <button
                    type="button"
                    onClick={() => copyPrompt(uc.id, uc.prompt)}
                    className={`btn-copy${copiedId === uc.id ? ' success' : ''}`}
                  >
                    {copiedId === uc.id ? 'Copied!' : 'Copy Prompt'}
                  </button>
                </div>
              </details>
            ))}
          </section>
        )}

        {/* Footer */}
        <div className="text-center mt-10 mb-4">
          <button
            onClick={() => setShowCtaModal(true)}
            className="text-xs underline transition-colors"
            style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            About The Matts / Train Your Team
          </button>
        </div>
        <button
          onClick={() => setView('landing')}
          className="w-full py-3 text-xs transition-colors"
          style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Back to home
        </button>

        {savedCases.length > 0 && (
          <div className="text-center mt-2 mb-4">
            {confirmingClear ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Clear all {savedCases.length} picks?
                </span>
                <button
                  onClick={() => { clearPicks(); setConfirmingClear(false); setView('landing'); }}
                  className="text-xs font-semibold transition-colors"
                  style={{ color: 'var(--apple-red-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Yes, clear
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                className="text-xs underline transition-colors"
                style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear my picks / Start fresh
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
