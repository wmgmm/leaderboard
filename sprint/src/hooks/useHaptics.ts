/** Trigger a short haptic pulse if supported (Android Chrome) */
export function useHaptics() {
  const pulse = (ms = 10) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  };
  return { pulse };
}
