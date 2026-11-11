import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { useCases } from '../../data/useCases';
import { flushOutbox } from '../../../../shared/client';
import { copyText } from '../../../../web/src/api';
import { ExportButton } from '../shared/ExportButton';
import { PromptText } from '../shared/PromptText';
import { CHART_URL, TRY_IT_URL } from '../../lib/session';

export function SprintResults() {
  const { savedCases, votes, initSprint, sharedInSprint } = useAppStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const voted = Object.keys(votes).length;
  // Picks are saved as whole cards; show today's wording for each, not the wording saved with it.
  const loved = savedCases.map(saved => useCases.find(c => c.id === saved.id) ?? saved);

  // Any vote that could not be sent during the sprint gets another go now, quietly.
  useEffect(() => { flushOutbox(); }, []);

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
            You loved {savedCases.length} of {voted}. Your votes are on the chart.
          </p>
          {sharedInSprint && (
            <p role="status" className="text-sm font-semibold mt-2" style={{ color: '#1d7a3e' }}>
              ✓ Thank you. Your answer will appear once a facilitator has approved it.
            </p>
          )}

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
            <p className="how-to">
              <strong>1. Copy</strong> a prompt. <strong>2. Paste</strong> it into Copilot. <strong>3. Swap</strong> the bold [bracket] for your own words.{' '}
              <a href="https://m365copilot.com/" target="_blank" rel="noopener">Open Copilot ↗</a>
            </p>
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

        {/* Less is more (Matt, 11 Nov 2026): the loved prompts first, then two buttons and two links */}
        <div className="max-w-lg lg:max-w-xl mx-auto mt-8">
          <div className="flex gap-3 mb-6">
            <ExportButton />
            <button
              onClick={() => initSprint(true)}
              className="flex-1 rounded-full py-3 text-sm font-semibold transition-colors"
              style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              Sprint Again
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <a href={TRY_IT_URL} className="next-step">
              <span className="icon" aria-hidden="true">📋</span>
              <span><span className="what">View all the prompts</span></span>
              <span className="go" aria-hidden="true">→</span>
            </a>
            <a href={CHART_URL} className="next-step">
              <span className="icon" aria-hidden="true">🏆</span>
              <span><span className="what">See the live chart</span></span>
              <span className="go" aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
