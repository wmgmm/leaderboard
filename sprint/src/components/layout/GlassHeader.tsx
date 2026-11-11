import { useAppStore } from '../../store/useAppStore';
import { Timer } from '../sprint/Timer';

export function GlassHeader() {
  const savedCount = useAppStore(s => s.savedCases.length);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3 glass"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <Timer />

      <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Community Top of the Prompts
      </span>

      <div className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loved so far</span>
        <span
          className="font-bold text-lg min-w-[1.5rem] text-right"
          style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
        >
          {savedCount}
        </span>
      </div>
    </div>
  );
}
