import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useAppStore } from './store/useAppStore';
import { LandingPage } from './components/landing/LandingPage';
import { SprintMode } from './components/sprint/SprintMode';
import { SprintResults } from './components/sprint/SprintResults';
import { CtaModal } from './components/shared/CtaModal';
import { ShareCard } from './components/sprint/ShareCard';

function App() {
  const view = useAppStore(s => s.view);

  return (
    // reducedMotion="user": people who have asked their device for less motion get none of the slides and fades.
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <main>
        <AnimatePresence mode="wait">
          {view === 'landing'  && <LandingPage    key="landing"  />}
          {view === 'sprint'   && <SprintMode      key="sprint"   />}
          {view === 'share'    && <ShareCard        key="share"    />}
          {view === 'results'  && <SprintResults   key="results"  />}
        </AnimatePresence>
      </main>

      <CtaModal />
    </div>
    </MotionConfig>
  );
}

export default App;
