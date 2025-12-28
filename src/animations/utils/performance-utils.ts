interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: ThrottleOptions = {}
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  let previous = 0;
  const { leading = true, trailing = true } = options;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (!previous && !leading) previous = now;
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout && trailing) {
      timeout = window.setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Debounce - Retarde l'exécution jusqu'à la fin des appels
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: DebounceOptions = {}
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  let lastCallTime = 0;
  const { leading = false, trailing = true, maxWait } = options;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    const later = () => {
      timeout = null;
      if (trailing) {
        func.apply(this, args);
      }
    };

    const shouldCallNow = leading && !timeout;

    if (timeout) clearTimeout(timeout);
    
    if (maxWait && timeSinceLastCall >= maxWait) {
      func.apply(this, args);
      lastCallTime = now;
    } else {
      timeout = window.setTimeout(later, wait);
      lastCallTime = now;
    }

    if (shouldCallNow) {
      func.apply(this, args);
    }
  };
}

// ===== REQUESTANIMATIONFRAME OPTIMIZATIONS =====

/**
 * Utilise requestAnimationFrame pour optimiser les callbacks
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  callback: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs) {
          callback.apply(this, lastArgs);
          lastArgs = null;
        }
        rafId = null;
      });
    }
  };
}

/**
 * Planifie une callback pour le prochain frame
 */
export function nextFrame(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

// ===== INTERSECTION OBSERVER =====

/**
 * Observer optimisé pour les animations au scroll
 */
export class LazyAnimationObserver {
  private observer: IntersectionObserver;
  private callbacks: Map<Element, () => void> = new Map();

  constructor(options: IntersectionObserverInit = {}) {
    const defaultOptions: IntersectionObserverInit = {
      rootMargin: '50px',
      threshold: 0.1,
      ...options,
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const callback = this.callbacks.get(entry.target);
          if (callback) {
            callback();
            this.unobserve(entry.target);
          }
        }
      });
    }, defaultOptions);
  }

  observe(element: Element, callback: () => void): void {
    this.callbacks.set(element, callback);
    this.observer.observe(element);
  }

  unobserve(element: Element): void {
    this.observer.unobserve(element);
    this.callbacks.delete(element);
  }

  disconnect(): void {
    this.observer.disconnect();
    this.callbacks.clear();
  }
}

// ===== PERFORMANCE MONITORING =====

/**
 * Vérifie si le device est bas de gamme
 */
export function isLowEndDevice(): boolean {
  // Check CPU cores
  const cores = navigator.hardwareConcurrency || 4;
  if (cores < 4) return true;

  // Check memory (si disponible)
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 4) return true;

  // Check connection
  const connection = (navigator as any).connection;
  if (connection) {
    const effectiveType = connection.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
      return true;
    }
    if (connection.saveData) return true;
  }

  return false;
}

/**
 * Vérifie si on est sur mobile
 */
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Détecte si les animations doivent être réduites
 */
export function shouldReduceAnimations(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    isLowEndDevice() ||
    isMobile()
  );
}

// ===== WILL-CHANGE OPTIMIZATION =====

/**
 * Gère le will-change de manière optimale
 */
export class WillChangeManager {
  private elements: Map<Element, NodeJS.Timeout> = new Map();
  private readonly CLEANUP_DELAY = 1000;

  add(element: Element, properties: string): void {
    // Clear timeout existant
    const existingTimeout = this.elements.get(element);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Ajoute will-change
    (element as HTMLElement).style.willChange = properties;

    // Programme le nettoyage
    const timeout = setTimeout(() => {
      this.remove(element);
    }, this.CLEANUP_DELAY);

    this.elements.set(element, timeout);
  }

  remove(element: Element): void {
    const timeout = this.elements.get(element);
    if (timeout) {
      clearTimeout(timeout);
    }
    (element as HTMLElement).style.willChange = 'auto';
    this.elements.delete(element);
  }

  clear(): void {
    this.elements.forEach((timeout, element) => {
      clearTimeout(timeout);
      (element as HTMLElement).style.willChange = 'auto';
    });
    this.elements.clear();
  }
}

export const willChangeManager = new WillChangeManager();

// ===== RESOURCE HINTS =====

/**
 * Précharge les ressources critiques
 */
export function preloadCriticalResources(): void {
  // Preconnect to CDNs
  const cdnDomains = ['cdnjs.cloudflare.com'];
  
  cdnDomains.forEach((domain) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = `https://${domain}`;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

// ===== MEMORY MANAGEMENT =====

/**
 * Pool d'objets réutilisables pour éviter les allocations
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize: number = 100) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool = [];
  }
}

// ===== PASSIVE EVENT LISTENERS =====

/**
 * Ajoute un event listener passif pour de meilleures performances
 */
export function addPassiveEventListener(
  element: Element | Window,
  event: string,
  handler: EventListener
): () => void {
  element.addEventListener(event, handler, { passive: true });
  
  return () => {
    element.removeEventListener(event, handler);
  };
}

// ===== FPS MONITORING =====

/**
 * Monitore le FPS et ajuste la qualité des animations
 */
export class FPSMonitor {
  private fps = 60;
  private lastTime = performance.now();
  private frames = 0;
  private rafId: number | null = null;

  start(): void {
    const loop = (time: number) => {
      this.frames++;
      const delta = time - this.lastTime;

      if (delta >= 1000) {
        this.fps = Math.round((this.frames * 1000) / delta);
        this.frames = 0;
        this.lastTime = time;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFPS(): number {
    return this.fps;
  }

  isPerformant(): boolean {
    return this.fps >= 50;
  }
}

// ===== CSS CONTAINMENT =====

/**
 * Applique le CSS containment pour optimiser le rendering
 */
export function applyContainment(element: HTMLElement): void {
  element.style.contain = 'layout style paint';
}

// ===== BATCH DOM OPERATIONS =====

/**
 * Regroupe les opérations DOM pour minimiser les reflows
 */
export class DOMBatcher {
  private readCallbacks: Array<() => void> = [];
  private writeCallbacks: Array<() => void> = [];
  private rafId: number | null = null;

  read(callback: () => void): void {
    this.readCallbacks.push(callback);
    this.schedule();
  }

  write(callback: () => void): void {
    this.writeCallbacks.push(callback);
    this.schedule();
  }

  private schedule(): void {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      // Phase de lecture
      const reads = this.readCallbacks.slice();
      this.readCallbacks = [];
      reads.forEach((callback) => callback());

      // Phase d'écriture
      const writes = this.writeCallbacks.slice();
      this.writeCallbacks = [];
      writes.forEach((callback) => callback());

      this.rafId = null;
    });
  }

  clear(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.readCallbacks = [];
    this.writeCallbacks = [];
  }
}

export const domBatcher = new DOMBatcher();

// ===== EXPORT ALL =====

export default {
  throttle,
  debounce,
  rafThrottle,
  nextFrame,
  LazyAnimationObserver,
  isLowEndDevice,
  isMobile,
  shouldReduceAnimations,
  WillChangeManager,
  willChangeManager,
  preloadCriticalResources,
  ObjectPool,
  addPassiveEventListener,
  FPSMonitor,
  applyContainment,
  DOMBatcher,
  domBatcher,
};