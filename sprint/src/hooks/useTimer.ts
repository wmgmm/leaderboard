import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useTimer() {
  const isTimerRunning = useAppStore(s => s.isTimerRunning);
  const tickTimer = useAppStore(s => s.tickTimer);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isTimerRunning) {
      intervalRef.current = setInterval(tickTimer, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTimerRunning, tickTimer]);
}
