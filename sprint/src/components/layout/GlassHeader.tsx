import { useAppStore } from '../../store/useAppStore';
import { Timer } from '../sprint/Timer';

export function GlassHeader() {
  const savedCount = useAppStore(s => s.savedCases.length);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-5 py-3 glass"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <Timer />

      {/* One line each on a phone: the short forms, never a wrapped bar */}
      <span className="text-sm font-medium min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
        <span className="hidden sm:inline">Community </span>Top of the Prompts
      </span>

      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loved<span className="hidden sm:inline"> so far</span></span>
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
