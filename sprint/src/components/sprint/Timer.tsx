import { useAppStore } from '../../store/useAppStore';
import { SPRINT_DURATION_SECONDS } from '../../lib/constants';

export function Timer() {
  const timerSeconds = useAppStore(s => s.timerSeconds);
  const timed = useAppStore(s => s.timed);
  if (!timed) return <div className="w-12 h-12" aria-hidden="true" />; // no clock in this sprint; keep the bar's shape

  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const display = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const progress = timerSeconds / SPRINT_DURATION_SECONDS;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  const isUrgent = timerSeconds <= 30;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
          <circle
            cx="25" cy="25" r={radius}
            fill="none"
            stroke={isUrgent ? 'var(--apple-red)' : 'var(--apple-blue)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold"
          style={{ color: isUrgent ? 'var(--apple-red-text)' : 'var(--text-primary)' }}
        >
          {display}
        </span>
      </div>
    </div>
  );
}
