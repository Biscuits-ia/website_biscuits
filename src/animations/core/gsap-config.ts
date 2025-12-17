import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initGSAP(): void {
  gsap.registerPlugin(ScrollTrigger);

  gsap.defaults({
    ease: 'power3.out',
    duration: 1,
  });

  ScrollTrigger.config({
    limitCallbacks: true,
    ignoreMobileResize: true,
  });

  ScrollTrigger.normalizeScroll(false);

  document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}

export function killAllAnimations(): void {
  ScrollTrigger.getAll().forEach(st => st.kill());
  gsap.globalTimeline.clear();
}