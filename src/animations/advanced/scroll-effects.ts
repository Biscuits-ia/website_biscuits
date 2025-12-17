import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

export interface ParallaxLayer {
  selector: string;
  speed: number; // 0.5 = moitié vitesse, 2 = double vitesse
  direction?: 'vertical' | 'horizontal';
}

export class MultiLayerParallax {
  private triggers: ScrollTrigger[] = [];

  constructor(layers: ParallaxLayer[]) {
    this.init(layers);
  }

  private init(layers: ParallaxLayer[]): void {
    const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shouldReduce) return;

    layers.forEach((layer) => {
      const elements = document.querySelectorAll(layer.selector);
      if (!elements.length) return;

      elements.forEach((element) => {
        const isHorizontal = layer.direction === 'horizontal';
        const property = isHorizontal ? 'x' : 'y';
        const distance = (isHorizontal ? window.innerWidth : window.innerHeight) * layer.speed;

        const trigger = gsap.to(element, {
          [property]: -distance,
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
        }).scrollTrigger;

        if (trigger) this.triggers.push(trigger);
      });
    });
  }

  public destroy(): void {
    this.triggers.forEach((trigger) => trigger.kill());
    this.triggers = [];
  }
}

export interface AdvancedRevealOptions {
  selector: string;
  trigger?: string;
  animation?: 'fade' | 'slide' | 'scale' | 'rotate' | 'clip';
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  duration?: number;
  stagger?: number;
  delay?: number;
  once?: boolean;
  markers?: boolean;
}

export function advancedReveal(options: AdvancedRevealOptions): ScrollTrigger | null {
  const {
    selector,
    trigger,
    animation = 'fade',
    direction = 'up',
    distance = 60,
    duration = 1,
    stagger = 0.1,
    delay = 0,
    once = true,
    markers = false,
  } = options;

  const elements = document.querySelectorAll(selector);
  if (!elements.length) return null;

  const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (shouldReduce) {
    gsap.set(elements, { opacity: 1, clearProps: 'all' });
    return null;
  }

  const initialState = getAnimationInitialState(animation, direction, distance);
  const finalState = getAnimationFinalState(animation);

  const scrollTrigger = ScrollTrigger.create({
    trigger: trigger || elements[0],
    start: 'top 80%',
    once,
    markers,
    onEnter: () => {
      gsap.fromTo(
        elements,
        initialState,
        {
          ...finalState,
          duration,
          stagger,
          delay,
          ease: 'power3.out',
          clearProps: 'all',
        }
      );
    },
  });

  return scrollTrigger;
}

function getAnimationInitialState(animation: string, direction: string, distance: number) {
  const states: Record<string, any> = {
    fade: { opacity: 0 },
    slide: {
      opacity: 0,
      y: direction === 'up' ? distance : direction === 'down' ? -distance : 0,
      x: direction === 'left' ? distance : direction === 'right' ? -distance : 0,
    },
    scale: {
      opacity: 0,
      scale: 0.8,
    },
    rotate: {
      opacity: 0,
      rotation: direction === 'right' ? 45 : -45,
    },
    clip: {
      clipPath: 'inset(0 100% 0 0)',
    },
  };

  return states[animation] || states.fade;
}

function getAnimationFinalState(animation: string) {
  const states: Record<string, any> = {
    fade: { opacity: 1 },
    slide: { opacity: 1, x: 0, y: 0 },
    scale: { opacity: 1, scale: 1 },
    rotate: { opacity: 1, rotation: 0 },
    clip: { clipPath: 'inset(0 0 0 0)' },
  };

  return states[animation] || states.fade;
}

export function smoothScrollTo(target: string | Element, offset: number = -80): void {
  gsap.to(window, {
    duration: 1,
    scrollTo: {
      y: target,
      offsetY: offset,
    },
    ease: 'power3.inOut',
  });
}

export function initSmoothScroll(): void {
  const links = document.querySelectorAll('a[href^="#"]');

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        smoothScrollTo(target);
        
        // Update URL sans reload
        history.pushState(null, '', href);
      }
    });
  });
}

export class PageTransitions {
  private isTransitioning = false;

  constructor() {
    this.init();
  }

  private init(): void {
    document.addEventListener('astro:before-preparation', () => {
      this.beforeTransition();
    });

    document.addEventListener('astro:after-swap', () => {
      this.afterTransition();
    });

    window.addEventListener('beforeunload', () => {
      this.beforeTransition();
    });
  }

  private beforeTransition(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shouldReduce) return;

    gsap.to('body', {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.inOut',
    });
  }

  private afterTransition(): void {
    this.isTransitioning = false;

    const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shouldReduce) {
      gsap.set('body', { opacity: 1 });
      return;
    }

    gsap.fromTo(
      'body',
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.inOut',
      }
    );

    ScrollTrigger.refresh();
  }
}

export function initMagneticButtons(selector: string = '[data-magnetic]'): void {
  const buttons = document.querySelectorAll(selector);

  buttons.forEach((button) => {
    const btn = button as HTMLElement;
    
    btn.addEventListener('mouseenter', () => {
      gsap.to(btn, { scale: 1.05, duration: 0.3 });
    });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { scale: 1, x: 0, y: 0, duration: 0.3 });
    });

    btn.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      gsap.to(btn, {
        x: x * 0.3,
        y: y * 0.3,
        duration: 0.3,
      });
    });
  });
}

export function animateText(selector: string): void {
  const elements = document.querySelectorAll(selector);

  elements.forEach((element) => {
    const text = element.textContent || '';
    const chars = text.split('');

    element.textContent = '';

    chars.forEach((char) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.style.display = 'inline-block';
      element.appendChild(span);
    });

    gsap.fromTo(
      element.children,
      {
        opacity: 0,
        y: 20,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.02,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 80%',
          once: true,
        },
      }
    );
  });
}

export class CustomCursor {
  private cursor: HTMLElement;
  private follower: HTMLElement;

  constructor() {
    this.cursor = this.createCursor('cursor');
    this.follower = this.createCursor('cursor-follower');
    this.init();
  }

  private createCursor(className: string): HTMLElement {
    const cursor = document.createElement('div');
    cursor.className = className;
    document.body.appendChild(cursor);
    return cursor;
  }

  private init(): void {
    document.addEventListener('mousemove', (e) => {
      gsap.to(this.cursor, {
        x: e.clientX,
        y: e.clientY,
        duration: 0.1,
      });

      gsap.to(this.follower, {
        x: e.clientX,
        y: e.clientY,
        duration: 0.3,
      });
    });

    const interactiveElements = document.querySelectorAll('a, button, [data-cursor-hover]');
    
    interactiveElements.forEach((element) => {
      element.addEventListener('mouseenter', () => {
        this.cursor.classList.add('cursor-hover');
        this.follower.classList.add('cursor-hover');
      });

      element.addEventListener('mouseleave', () => {
        this.cursor.classList.remove('cursor-hover');
        this.follower.classList.remove('cursor-hover');
      });
    });
  }

  public destroy(): void {
    this.cursor.remove();
    this.follower.remove();
  }
}

export function initAdvancedAnimations(): void {
  const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (shouldReduce) return;

  initSmoothScroll();

  new PageTransitions();

  initMagneticButtons();

  if (window.innerWidth > 1024) {
    new CustomCursor();
  }
}