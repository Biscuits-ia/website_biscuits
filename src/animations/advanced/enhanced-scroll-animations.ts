import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animateIfAllowed } from '../utils/accessibility';

gsap.registerPlugin(ScrollTrigger);

// ===== TYPES & INTERFACES =====

interface HorizontalScrollOptions {
  container: string;
  sections: string;
  speed?: number;
}

interface ParallaxLayer {
  selector: string;
  speed: number;
  direction?: 'x' | 'y';
}

interface AdvancedParallaxOptions {
  layers: ParallaxLayer[];
}

interface CounterOptions {
  selector: string;
  duration?: number;
}

interface SplitSectionOptions {
  container: string;
  leftPanel: string;
  rightPanel: string;
}

interface AnimatedScrollLineOptions {
  lineSelector: string;
  color?: string;
}

function querySelector<T extends Element = Element>(
  selector: string
): T | null {
  return document.querySelector<T>(selector);
}

function querySelectorAll<T extends Element = Element>(
  selector: string
): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function createHorizontalScroll(
  options: HorizontalScrollOptions
): ScrollTrigger | null {
  const { container, sections, speed = 1 } = options;

  const containerEl = querySelector<HTMLElement>(container);
  const sectionsEl = querySelectorAll<HTMLElement>(sections);

  if (!containerEl || sectionsEl.length === 0) return null;

  let trigger: ScrollTrigger | null = null;

  animateIfAllowed(() => {
    const totalWidth = sectionsEl.reduce((acc, section) => {
      return acc + section.offsetWidth;
    }, 0);

    const animation = gsap.to(sectionsEl, {
      xPercent: -100 * (sectionsEl.length - 1),
      ease: 'none',
      scrollTrigger: {
        trigger: containerEl,
        pin: true,
        scrub: speed,
        snap: 1 / (sectionsEl.length - 1),
        end: () => `+=${totalWidth}`,
        invalidateOnRefresh: true,
      },
    });

    trigger = animation.scrollTrigger ?? null;
  });

  return trigger;
}

/**
 * Animation de texte qui se révèle lettre par lettre
 */
export function animateTextReveal(selector: string): void {
  const elements = querySelectorAll<HTMLElement>(selector);

  elements.forEach((element) => {
    animateIfAllowed(() => {
      const text = element.textContent ?? '';
      element.innerHTML = text
        .split('')
        .map((char) => {
          const safeChar = char === ' ' ? '&nbsp;' : char;
          return `<span style="display:inline-block;opacity:0">${safeChar}</span>`;
        })
        .join('');

      const children = Array.from(element.children) as HTMLElement[];

      gsap.to(children, {
        opacity: 1,
        y: 0,
        duration: 0.05,
        stagger: 0.03,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      });
    });
  });
}

/**
 * Effet de morphing sur les cartes au scroll
 */
export function cardMorphEffect(selector: string): void {
  const cards = querySelectorAll<HTMLElement>(selector);

  cards.forEach((card) => {
    animateIfAllowed(() => {
      gsap.fromTo(
        card,
        {
          scale: 0.8,
          opacity: 0,
          rotateY: -15,
          z: -100,
        },
        {
          scale: 1,
          opacity: 1,
          rotateY: 0,
          z: 0,
          duration: 1.2,
          ease: 'back.out(1.2)',
          scrollTrigger: {
            trigger: card,
            start: 'top 80%',
            end: 'top 40%',
            scrub: 1,
          },
        }
      );

      // Effet parallaxe léger au survol
      const handleMouseEnter = (): void => {
        gsap.to(card, {
          y: -10,
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          duration: 0.3,
        });
      };

      const handleMouseLeave = (): void => {
        gsap.to(card, {
          y: 0,
          boxShadow: 'none',
          duration: 0.3,
        });
      };

      card.addEventListener('mouseenter', handleMouseEnter);
      card.addEventListener('mouseleave', handleMouseLeave);
    });
  });
}

/**
 * Parallaxe multi-couches avancé
 */
export function advancedParallax(options: AdvancedParallaxOptions): void {
  const { layers } = options;

  layers.forEach(({ selector, speed, direction = 'y' }) => {
    const elements = querySelectorAll<HTMLElement>(selector);

    elements.forEach((element) => {
      animateIfAllowed(() => {
        gsap.to(element, {
          [direction]: () => window.innerHeight * speed,
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      });
    });
  });
}

/**
 * Animation de compteur progressif
 */
export function animateCounter(options: CounterOptions): void {
  const { selector, duration = 2 } = options;
  const elements = querySelectorAll<HTMLElement>(selector);

  elements.forEach((element) => {
    animateIfAllowed(() => {
      const target = parseFloat(element.textContent ?? '0');
      const obj: { value: number } = { value: 0 };

      ScrollTrigger.create({
        trigger: element,
        start: 'top 80%',
        onEnter: () => {
          gsap.to(obj, {
            value: target,
            duration,
            ease: 'power2.out',
            onUpdate: () => {
              element.textContent = Math.round(obj.value).toString();
            },
          });
        },
      });
    });
  });
}

/**
 * Effet de clip path révélation
 */
export function clipPathReveal(selector: string): void {
  const elements = querySelectorAll<HTMLElement>(selector);

  elements.forEach((element) => {
    animateIfAllowed(() => {
      gsap.fromTo(
        element,
        {
          clipPath: 'polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)',
        },
        {
          clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
          duration: 1.5,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });
  });
}

/**
 * Section qui se divise en deux au scroll
 */
export function splitSectionEffect(options: SplitSectionOptions): void {
  const { container, leftPanel, rightPanel } = options;

  const containerEl = querySelector<HTMLElement>(container);
  const leftEl = querySelector<HTMLElement>(leftPanel);
  const rightEl = querySelector<HTMLElement>(rightPanel);

  if (!containerEl || !leftEl || !rightEl) return;

  animateIfAllowed(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerEl,
        start: 'top center',
        end: 'bottom center',
        scrub: 1,
      },
    });

    tl.to(leftEl, { xPercent: -20, ease: 'none' }, 0).to(
      rightEl,
      { xPercent: 20, ease: 'none' },
      0
    );
  });
}

/**
 * Effet de perspective 3D au scroll
 */
export function perspective3DScroll(selector: string): void {
  const elements = querySelectorAll<HTMLElement>(selector);

  elements.forEach((element) => {
    animateIfAllowed(() => {
      gsap.set(element, { transformPerspective: 1000 });

      gsap.fromTo(
        element,
        {
          rotateX: 20,
          opacity: 0,
          y: 100,
        },
        {
          rotateX: 0,
          opacity: 1,
          y: 0,
          duration: 1.5,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 80%',
            end: 'top 30%',
            scrub: 1,
          },
        }
      );
    });
  });
}

/**
 * Ligne animée qui suit le scroll
 */
export function animatedScrollLine(options: AnimatedScrollLineOptions): void {
  const { lineSelector, color = '#38bdf8' } = options;

  const line = querySelector<HTMLElement>(lineSelector);
  if (!line) return;

  animateIfAllowed(() => {
    line.style.position = 'fixed';
    line.style.left = '50%';
    line.style.transform = 'translateX(-50%)';
    line.style.width = '2px';
    line.style.background = color;
    line.style.zIndex = '999';

    gsap.to(line, {
      height: '100vh',
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
      },
    });
  });
}

/**
 * Effet de zoom progressif sur images
 */
export function imageZoomScroll(selector: string): void {
  const images = querySelectorAll<HTMLElement>(selector);

  images.forEach((img) => {
    animateIfAllowed(() => {
      gsap.fromTo(
        img,
        { scale: 1.3, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: img,
            start: 'top 85%',
            end: 'top 40%',
            scrub: 1,
          },
        }
      );
    });
  });
}

/**
 * Initialisation complète des animations
 */
export function initEnhancedAnimations(): void {
  const shouldReduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
  if (shouldReduce) return;

  // Animations de texte
  animateTextReveal('h1, h2.animate-text');

  // Cartes avec effet morph
  cardMorphEffect('.expertise-card, .service-card, .package-card');

  // Parallaxe multi-couches
  advancedParallax({
    layers: [
      { selector: '[data-parallax="slow"]', speed: 0.3 },
      { selector: '[data-parallax="medium"]', speed: 0.5 },
      { selector: '[data-parallax="fast"]', speed: 0.8 },
    ],
  });

  // Compteurs
  animateCounter({ selector: '[data-counter]' });

  // Révélations par clip
  clipPathReveal('[data-clip-reveal]');

  // Perspective 3D
  perspective3DScroll('.step, .note-card, .faq-item');

  // Zoom sur images
  imageZoomScroll('img[data-zoom]');

  // Refresh après chargement des fonts
  document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}

/**
 * Nettoyage de toutes les animations
 */
export function cleanupEnhancedAnimations(): void {
  ScrollTrigger.getAll().forEach((st) => st.kill());
  gsap.globalTimeline.clear();
}