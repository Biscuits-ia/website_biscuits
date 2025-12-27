import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { initGSAP } from '../core/gsap-config';
import {
  initEnhancedAnimations,
  cleanupEnhancedAnimations,
} from './enhanced-scroll-animations';
import { scrollController } from '../core/scroll-controller';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// ===== TYPES =====

interface ElementRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

function querySelectorAll<T extends Element = Element>(
  selector: string
): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

function getElementRect(element: HTMLElement): ElementRect {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top,
  };
}

function shouldReduceMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ===== MAIN INITIALIZATION =====

/**
 * Initialisation globale des animations
 */
export function initSiteAnimations(): void {
  // Configuration GSAP de base
  initGSAP();

  // Animations avancées
  initEnhancedAnimations();

  // Animation d'entrée de page
  animatePageEntry();

  // Animations spécifiques aux sections
  initSectionAnimations();

  // Boutons magnétiques
  initMagneticButtons();

  // Smooth scroll sur les ancres
  initSmoothAnchorScroll();
}

// ===== PAGE ENTRY ANIMATION =====

/**
 * Animation d'entrée de page
 */
function animatePageEntry(): void {
  if (shouldReduceMotion()) return;

  const tl = gsap.timeline({ delay: 0.2 });

  const heroSelectors = [
    '.contact-hero',
    '.tarifs-hero',
    '.quote-hero',
    '.expertise-header',
  ].join(', ');

  const heroElements = querySelectorAll<HTMLElement>(heroSelectors);

  if (heroElements.length > 0) {
    tl.from(heroElements, {
      opacity: 0,
      y: 50,
      duration: 1,
      ease: 'power3.out',
    });
  }

  const badges = querySelectorAll<HTMLElement>('.hero-badges .badge');
  if (badges.length > 0) {
    tl.from(
      badges,
      {
        opacity: 0,
        y: 20,
        stagger: 0.1,
        duration: 0.6,
      },
      '-=0.5'
    );
  }

  const gridItems = querySelectorAll<HTMLElement>('.expertise-grid > *');
  if (gridItems.length > 0) {
    tl.from(
      gridItems,
      {
        opacity: 0,
        y: 30,
        stagger: 0.08,
        duration: 0.8,
        ease: 'back.out(1.2)',
      },
      '-=0.4'
    );
  }
}

// ===== SECTION ANIMATIONS =====

/**
 * Animations spécifiques aux sections
 */
function initSectionAnimations(): void {
  if (shouldReduceMotion()) return;

  animateExpertiseCards();
  animateFormGroups();
  animateSteps();
  animatePricingCards();
  animateFaqItems();
}

function animateExpertiseCards(): void {
  const cards = querySelectorAll<HTMLElement>(
    '.expertise-grid .expertise-card'
  );

  cards.forEach((card) => {
    gsap.from(card, {
      scrollTrigger: {
        trigger: card,
        start: 'top 85%',
        end: 'top 60%',
        scrub: 1,
      },
      opacity: 0,
      y: 100,
      rotateX: 15,
      transformPerspective: 1000,
    });

    // Hover effect 3D
    const handleMouseEnter = (): void => {
      gsap.to(card, {
        z: 50,
        rotateY: 5,
        rotateX: -5,
        duration: 0.4,
        ease: 'power2.out',
      });
    };

    const handleMouseMove = (e: MouseEvent): void => {
      const rect = getElementRect(card);
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;

      gsap.to(card, {
        rotateX,
        rotateY,
        duration: 0.3,
        ease: 'power2.out',
      });
    };

    const handleMouseLeave = (): void => {
      gsap.to(card, {
        z: 0,
        rotateX: 0,
        rotateY: 0,
        duration: 0.5,
        ease: 'power2.out',
      });
    };

    card.addEventListener('mouseenter', handleMouseEnter);
    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
  });
}

function animateFormGroups(): void {
  const formGroups = querySelectorAll<HTMLElement>('.form-group');

  formGroups.forEach((group, index) => {
    gsap.from(group, {
      scrollTrigger: {
        trigger: group,
        start: 'top 90%',
      },
      opacity: 0,
      x: index % 2 === 0 ? -50 : 50,
      duration: 0.8,
      ease: 'power3.out',
      delay: index * 0.05,
    });
  });
}

function animateSteps(): void {
  const steps = querySelectorAll<HTMLElement>('.step');

  steps.forEach((step, index) => {
    gsap.from(step, {
      scrollTrigger: {
        trigger: step,
        start: 'top 85%',
      },
      opacity: 0,
      scale: 0.8,
      rotation: index % 2 === 0 ? -5 : 5,
      duration: 1,
      ease: 'elastic.out(1, 0.5)',
      delay: index * 0.1,
    });
  });
}

function animatePricingCards(): void {
  const pricingCards = querySelectorAll<HTMLElement>('.package-card');

  pricingCards.forEach((card) => {
    gsap.from(card, {
      scrollTrigger: {
        trigger: card,
        start: 'top 80%',
      },
      opacity: 0,
      y: 80,
      scale: 0.9,
      duration: 1,
      ease: 'back.out(1.4)',
    });
  });
}

function animateFaqItems(): void {
  const faqItems = querySelectorAll<HTMLElement>('.faq-item');

  faqItems.forEach((item, index) => {
    gsap.from(item, {
      scrollTrigger: {
        trigger: item,
        start: 'top 90%',
      },
      opacity: 0,
      x: -30,
      duration: 0.6,
      ease: 'power2.out',
      delay: index * 0.08,
    });
  });
}

// ===== MAGNETIC BUTTONS =====

interface MagneticButtonConfig {
  magnetStrength: number;
}

/**
 * Boutons magnétiques améliorés
 */
function initMagneticButtons(): void {
  const buttonSelectors = [
    '.btn-primary',
    '.cta-button',
    '.cta-button-enhanced',
    'button[type="submit"]',
  ].join(', ');

  const buttons = querySelectorAll<HTMLElement>(buttonSelectors);

  buttons.forEach((button) => {
    const config: MagneticButtonConfig = { magnetStrength: 0.3 };

    const handleMouseEnter = (): void => {
      gsap.to(button, {
        scale: 1.05,
        duration: 0.3,
        ease: 'power2.out',
      });
    };

    const handleMouseMove = (e: MouseEvent): void => {
      const rect = getElementRect(button);
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      gsap.to(button, {
        x: x * config.magnetStrength,
        y: y * config.magnetStrength,
        duration: 0.3,
        ease: 'power2.out',
      });
    };

    const handleMouseLeave = (): void => {
      gsap.to(button, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'elastic.out(1, 0.5)',
      });
    };

    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseleave', handleMouseLeave);
  });
}

// ===== SMOOTH SCROLL =====

/**
 * Smooth scroll sur les liens d'ancre
 */
function initSmoothAnchorScroll(): void {
  const anchors = querySelectorAll<HTMLAnchorElement>('a[href^="#"]');

  anchors.forEach((anchor) => {
    const handleClick = (e: Event): void => {
      e.preventDefault();
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector<HTMLElement>(href);
      if (target) {
        gsap.to(window, {
          duration: 1.2,
          scrollTo: {
            y: target,
            offsetY: 80,
          },
          ease: 'power3.inOut',
        });
      }
    };

    anchor.addEventListener('click', handleClick);
  });
}

// ===== CLEANUP =====

/**
 * Nettoyage lors des transitions de page (Astro)
 */
export function cleanupSiteAnimations(): void {
  cleanupEnhancedAnimations();
  scrollController.killAll();
}

// ===== AUTO-INITIALIZATION =====

/**
 * Auto-initialisation si le DOM est prêt
 */
function autoInit(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteAnimations);
  } else {
    initSiteAnimations();
  }

  // Support pour Astro View Transitions
  document.addEventListener('astro:page-load', initSiteAnimations);
  document.addEventListener('astro:before-preparation', cleanupSiteAnimations);
}

autoInit();