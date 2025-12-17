export function shouldReduceMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Usage: animateIfAllowed(() => gsap.to(...))
 */
export function animateIfAllowed(animationFn: () => void): void {
  if (!shouldReduceMotion()) {
    animationFn();
  }
}

export function watchMotionPreference(callback: (reduced: boolean) => void): void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
  } else {
    // Fallback Safari < 14
    mediaQuery.addListener(handler);
  }
}