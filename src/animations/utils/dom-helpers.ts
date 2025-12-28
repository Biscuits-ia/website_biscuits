/**
 * Helpers DOM typés pour éviter les erreurs strictNullChecks
 */

// ===== TYPES =====

interface DatasetHelper {
  get<T extends string = string>(
    element: HTMLElement,
    key: string,
    fallback?: T
  ): T;
  getNumber(element: HTMLElement, key: string, fallback?: number): number;
  getBoolean(element: HTMLElement, key: string, fallback?: boolean): boolean;
}

// ===== DATASET HELPERS =====

/**
 * Récupère une valeur dataset de manière type-safe
 */
export const dataset: DatasetHelper = {
  get<T extends string = string>(
    element: HTMLElement,
    key: string,
    fallback?: T
  ): T {
    const value = element.dataset[key];
    return (value ?? fallback ?? '') as T;
  },

  getNumber(element: HTMLElement, key: string, fallback: number = 0): number {
    const value = element.dataset[key];
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  },

  getBoolean(
    element: HTMLElement,
    key: string,
    fallback: boolean = false
  ): boolean {
    const value = element.dataset[key];
    if (value === undefined) return fallback;
    return value === 'true' || value === '1' || value === '';
  },
};

// ===== QUERY SELECTORS =====

/**
 * querySelector avec type guard
 */
export function query<T extends Element = HTMLElement>(
  selector: string,
  parent: Document | Element = document
): T | null {
  return parent.querySelector<T>(selector);
}

/**
 * querySelector qui throw si l'élément n'existe pas
 */
export function queryRequired<T extends Element = HTMLElement>(
  selector: string,
  parent: Document | Element = document
): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

/**
 * querySelectorAll avec typage
 */
export function queryAll<T extends Element = HTMLElement>(
  selector: string,
  parent: Document | Element = document
): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

// ===== CANVAS HELPERS =====

/**
 * Récupère un context 2D de manière type-safe
 */
export function getCanvas2DContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }
  return ctx;
}

/**
 * Récupère un context 2D ou null (pas de throw)
 */
export function tryGetCanvas2DContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', options);
}

// ===== ATTRIBUTE HELPERS =====

/**
 * Récupère un attribut de manière type-safe
 */
export function getAttribute(
  element: Element,
  name: string,
  fallback: string = ''
): string {
  return element.getAttribute(name) ?? fallback;
}

/**
 * Récupère un attribut numérique
 */
export function getNumberAttribute(
  element: Element,
  name: string,
  fallback: number = 0
): number {
  const value = element.getAttribute(name);
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

// ===== CLASS HELPERS =====

/**
 * Ajoute des classes de manière chainable
 */
export function addClass(element: Element, ...classes: string[]): Element {
  element.classList.add(...classes);
  return element;
}

/**
 * Retire des classes de manière chainable
 */
export function removeClass(element: Element, ...classes: string[]): Element {
  element.classList.remove(...classes);
  return element;
}

/**
 * Toggle une classe
 */
export function toggleClass(
  element: Element,
  className: string,
  force?: boolean
): boolean {
  return element.classList.toggle(className, force);
}

// ===== STYLE HELPERS =====

/**
 * Définit plusieurs styles en une fois
 */
export function setStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
): HTMLElement {
  Object.assign(element.style, styles);
  return element;
}

/**
 * Récupère une valeur CSS computed
 */
export function getComputedStyle(
  element: Element,
  property: keyof CSSStyleDeclaration
): string {
  return window.getComputedStyle(element)[property] as string;
}

// ===== EVENT HELPERS =====

/**
 * Ajoute un event listener avec cleanup automatique
 */
export function addEventListener<K extends keyof WindowEventMap>(
  element: Window,
  type: K,
  listener: (this: Window, ev: WindowEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;

export function addEventListener<K extends keyof DocumentEventMap>(
  element: Document,
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;

export function addEventListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;

export function addEventListener(
  element: EventTarget,
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void {
  element.addEventListener(type, listener, options);
  return () => element.removeEventListener(type, listener);
}

// ===== VALIDATION HELPERS =====

/**
 * Vérifie si un élément existe
 */
export function exists(element: Element | null | undefined): element is Element {
  return element !== null && element !== undefined;
}

/**
 * Vérifie si un élément est un HTMLElement
 */
export function isHTMLElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement;
}

/**
 * Vérifie si un élément est visible
 */
export function isVisible(element: HTMLElement): boolean {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

// ===== RECT HELPERS =====

/**
 * Récupère les dimensions d'un élément de manière type-safe
 */
export function getRect(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

/**
 * Récupère les dimensions avec valeurs par défaut
 */
export function getRectSafe(element: Element | null): {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (!element) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
  }
  return element.getBoundingClientRect();
}

// ===== VIEWPORT HELPERS =====

/**
 * Vérifie si un élément est dans le viewport
 */
export function isInViewport(
  element: Element,
  offset: number = 0
): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= -offset &&
    rect.left >= -offset &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + offset &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + offset
  );
}

/**
 * Scroll vers un élément de manière fluide
 */
export function scrollToElement(
  element: Element,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'start' }
): void {
  element.scrollIntoView(options);
}

// ===== CREATION HELPERS =====

/**
 * Crée un élément avec attributs et classes
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: {
    classes?: string[];
    attributes?: Record<string, string>;
    styles?: Partial<CSSStyleDeclaration>;
    textContent?: string;
    innerHTML?: string;
  }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (options?.classes) {
    element.classList.add(...options.classes);
  }

  if (options?.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  if (options?.styles) {
    Object.assign(element.style, options.styles);
  }

  if (options?.textContent) {
    element.textContent = options.textContent;
  }

  if (options?.innerHTML) {
    element.innerHTML = options.innerHTML;
  }

  return element;
}

// ===== EXPORT ALL =====

export default {
  dataset,
  query,
  queryRequired,
  queryAll,
  getCanvas2DContext,
  tryGetCanvas2DContext,
  getAttribute,
  getNumberAttribute,
  addClass,
  removeClass,
  toggleClass,
  setStyles,
  getComputedStyle,
  addEventListener,
  exists,
  isHTMLElement,
  isVisible,
  getRect,
  getRectSafe,
  isInViewport,
  scrollToElement,
  createElement,
};