import { useState } from 'react';
import { motion } from 'framer-motion';
import { deliver } from '../../../../shared/client';
import { COMMUNITY_LIMITS, shareProblem } from '../../../../shared/community';
import { useAppStore } from '../../store/useAppStore';
import { GlassHeader } from '../layout/GlassHeader';

/**
 * The one card where they give rather than vote: "Tell us how you use AI". It is the last
 * card of every sprint, shown when the deck or the clock runs out, and leads to the
 * results. What they write joins Community prompts for other staff to vote on. It is a
 * screen of its own, not a swipe card, because a swipe card swallows typing and arrow keys.
 * The first screen's "Share a useful prompt" opens the same card with no sprint behind it.
 */
export function ShareCard({ standalone = false }: { standalone?: boolean }) {
  const finishSprint = useAppStore(s => s.finishSprint);
  // Opened from the first screen there is no sprint to go back to, and no clock to mention.
  const fromHome = useAppStore(s => s.shareFromHome);
  const closeShare = useAppStore(s => s.closeShare);
  const [purpose, setPurpose] = useState('');
  const [prompt, setPrompt] = useState('');
  const [problem, setProblem] = useState('');
  // On its own page there is nowhere to go next, so the card itself says thank you.
  const [sending, setSending] = useState(false);
  const [thanked, setThanked] = useState(false);

  const suggest = (e: React.FormEvent) => {
    e.preventDefault();
    // Checked here, so a bad entry is refused at once, whether or not the server is there.
    const wrong = shareProblem(purpose, prompt);
    if (wrong) { setProblem(wrong); return; }
    // Sent behind the scenes, or held until the server is back. Nobody waits for it.
    if (standalone) {
      // Wait for the server here: someone who came from an email will close the tab next.
      // If the server is away the entry is kept in this browser and sent when it is back.
      setSending(true);
      deliver({ t: 'share', purpose, prompt }).then(refused => {
        setSending(false);
        if (refused) { setProblem(refused); return; }
        setPurpose(''); setPrompt(''); setThanked(true);
      });
      return;
    }
    deliver({ t: 'share', purpose, prompt });
    if (fromHome) closeShare(true); else finishSprint(true);
  };

  const field = {
    background: 'var(--bg-page)', border: '1.5px solid #86868b', color: 'var(--text-primary)', // an edge you can see
  };

  if (standalone && thanked) {
    return (
      <div className="flex flex-col min-h-screen px-5 pb-6" style={{ background: 'var(--bg-page)', paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 3.75rem)' }}>
        <div
          role="status"
          className="w-full max-w-sm md:max-w-2xl lg:max-w-3xl mx-auto rounded-2xl p-5 md:p-8 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card-hover)', marginTop: '2.5rem' }}
        >
          <p className="text-4xl mb-3" aria-hidden="true">🎉</p>
          <h2 className="text-xl md:text-3xl font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Thank you</h2>
          <p className="text-sm md:text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
            Other staff will see your answer once a facilitator has approved it.
          </p>
          <button type="button" onClick={() => setThanked(false)} className="btn-secondary px-6 py-3 text-sm md:text-base">
            Add another
          </button>
        </div>
        <p className="text-xs text-center mt-auto pt-8" style={{ color: 'var(--text-tertiary)' }}>
          Created by Dr. Matt Mort & Mr. Matt Hayden · Cardiff University
        </p>
      </div>
    );
  }

  return (
    // Laid out like a sprint card: the same top bar, the same place on the screen and the
    // same width, so it reads as one more card in the deck rather than a pop-up.
    <motion.div
      key="share"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col min-h-screen"
      style={{ background: 'var(--bg-page)' }}
    >
      {!fromHome && !standalone && <GlassHeader />}

      <div className="flex-1 flex flex-col px-5 pb-6" style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 3.75rem)' }}>
        <form
          onSubmit={suggest}
          className="w-full max-w-sm md:max-w-2xl lg:max-w-3xl mx-auto rounded-2xl p-5 md:p-8 flex flex-col"
          // The top margin stands in for the "Would you use this prompt?" line above a sprint card.
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card-hover)', marginTop: '2.5rem' }}
        >
          {standalone && (
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--apple-blue-dark)' }}>
              The Community Approach to AI
            </p>
          )}
          <h2 className="text-xl md:text-3xl font-bold mb-1.5 leading-tight" style={{ color: 'var(--text-primary)', textWrap: 'balance' }}>
            Tell us how you use AI 💡
          </h2>
          <p id="share-help" className="text-sm md:text-base mb-5" style={{ color: 'var(--text-secondary)' }}>
            There is no wrong answer. Add what you use AI for and help other staff get ideas!
          </p>

          <label htmlFor="share-purpose" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            What do you use AI for?
          </label>
          <input
            id="share-purpose" type="text" autoComplete="off" autoFocus
            value={purpose} maxLength={COMMUNITY_LIMITS.purposeMax}
            onChange={e => { setPurpose(e.target.value); setProblem(''); }}
            placeholder="e.g. Turning my meeting notes into actions"
            aria-invalid={problem ? true : undefined} aria-describedby="share-help share-problem"
            className="w-full rounded-xl px-4 py-3 md:px-6 text-sm md:text-lg mb-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]" style={field}
          />

          <label htmlFor="share-prompt" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            The prompt you use <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>(optional)</span>
          </label>
          {/* The same box a sprint card shows its prompt in: same shape, padding and type size */}
          <textarea
            id="share-prompt" rows={5}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setProblem(''); }}
            placeholder="Paste it here if you have one"
            className="w-full rounded-xl px-4 py-3 md:px-6 md:py-5 text-sm md:text-lg leading-relaxed mb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] resize-y" style={field}
          />

          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            It appears once a facilitator has approved it. No names or anything sensitive.
          </p>
          <p id="share-problem" role="alert" className="text-sm mb-3 min-h-[1.25rem]" style={{ color: 'var(--apple-red-text)' }}>{problem}</p>

          <div className="flex gap-3">
            <button type="submit" disabled={sending} className="btn-primary px-6 py-3 text-sm md:text-base flex-1">
              {sending ? 'Sending...' : 'Submit'}
            </button>
            {!standalone && (
              <button type="button" onClick={fromHome ? () => closeShare(false) : () => finishSprint(false)} className="btn-secondary px-6 py-3 text-sm md:text-base">
                {fromHome ? 'Back' : 'See results'}
              </button>
            )}
          </div>
        </form>
        {standalone && (
          <p className="text-xs text-center mt-auto pt-8" style={{ color: 'var(--text-tertiary)' }}>
            Created by Dr. Matt Mort & Mr. Matt Hayden · Cardiff University
          </p>
        )}
      </div>
    </motion.div>
  );
}
