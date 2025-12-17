import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animateIfAllowed } from '../utils/accessibility';

export interface RevealOptions {
  target: string | HTMLElement;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  duration?: number;
  stagger?: number;
  triggerStart?: string;
}

export function revealOnScroll(options: RevealOptions): ScrollTrigger | null {
  const {
    target,
    direction = 'up',
    distance = 60,
    duration = 1,
    stagger = 0.1,
    triggerStart = 'top 80%',
  } = options;

  const elements = typeof target === 'string' 
    ? document.querySelectorAll(target) 
    : [target];

  if (!elements.length) return null;

  const initialState = getInitialState(direction, distance);

  let trigger: ScrollTrigger | null = null;

  animateIfAllowed(() => {
    trigger = ScrollTrigger.create({
      trigger: elements[0],
      start: triggerStart,
      once: true,
      onEnter: () => {
        gsap.fromTo(
          elements,
          {
            ...initialState,
            willChange: 'transform, opacity',
          },
          {
            y: 0,
            x: 0,
            opacity: 1,
            duration,
            stagger,
            ease: 'power3.out',
            clearProps: 'willChange',
          }
        );
      },
    });
  });

  return trigger;
}

function getInitialState(direction: string, distance: number) {
  switch (direction) {
    case 'up':
      return { y: distance, opacity: 0 };
    case 'down':
      return { y: -distance, opacity: 0 };
    case 'left':
      return { x: distance, opacity: 0 };
    case 'right':
      return { x: -distance, opacity: 0 };
    default:
      return { y: distance, opacity: 0 };
  }
}