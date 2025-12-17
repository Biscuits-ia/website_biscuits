import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animateIfAllowed } from '../utils/accessibility';

export interface StickyTimelineOptions {
  container: string | HTMLElement;
  timeline: Array<{
    target: string | HTMLElement;
    from?: gsap.TweenVars;
    to: gsap.TweenVars;
    position?: string | number;
  }>;
  pinSpacing?: number;
}

export function createStickyTimeline(options: StickyTimelineOptions): ScrollTrigger | null {
  const { container, timeline: steps, pinSpacing = 300 } = options;

  const containerEl = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!containerEl) return null;

  let trigger: ScrollTrigger | null = null;

  animateIfAllowed(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerEl,
        start: 'top top',
        end: `+=${pinSpacing}%`,
        pin: true,
        scrub: 1,
        anticipatePin: 1,
      },
    });

    steps.forEach((step) => {
      const el = typeof step.target === 'string'
        ? document.querySelector(step.target)
        : step.target;

      if (!el) return;

      if (step.from) {
        tl.fromTo(el, step.from, step.to, step.position || '+=0');
      } else {
        tl.to(el, step.to, step.position || '+=0');
      }
    });

    trigger = tl.scrollTrigger ?? null;
  });

  return trigger;
}