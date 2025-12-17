import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animateIfAllowed } from '../utils/accessibility';

export interface ParallaxOptions {
  target: string | HTMLElement;
  speed?: number;
  container?: string | HTMLElement;
}

export function createParallax(options: ParallaxOptions): ScrollTrigger | null {
  const { target, speed = 0.5, container } = options;

  const element = typeof target === 'string' 
    ? document.querySelector(target) 
    : target;

  if (!element) return null;

  let trigger: ScrollTrigger | null = null;

  animateIfAllowed(() => {
    const triggerConfig: ScrollTrigger.Vars = {
      trigger: element,
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1,
    };

    if (container) {
      const containerEl = typeof container === 'string'
        ? document.querySelector(container)
        : container;
      
      if (containerEl) {
        triggerConfig.trigger = containerEl;
      }
    }

    const tween = gsap.to(element, {
      y: () => {
        const distance = window.innerHeight * speed;
        return -distance;
      },
      ease: 'none',
      scrollTrigger: triggerConfig,
    });

    trigger = tween.scrollTrigger ?? null;
  });

  return trigger;
}