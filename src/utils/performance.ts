interface LazyLoadOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  onLoad?: (element: Element) => void;
}

export class LazyImageLoader {
  private observer: IntersectionObserver | null = null;

  constructor(options: LazyLoadOptions = {}) {
    if (!('IntersectionObserver' in window)) {
      this.loadAllImages();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.loadImage(entry.target as HTMLImageElement);
            this.observer?.unobserve(entry.target);
          }
        });
      },
      {
        root: options.root || null,
        rootMargin: options.rootMargin || '50px',
        threshold: options.threshold || 0.01,
      }
    );

    this.init();
  }

  private init(): void {
    const lazyImages = document.querySelectorAll('img[data-src], picture source[data-srcset]');
    lazyImages.forEach((img) => {
      this.observer?.observe(img);
    });
  }

  private loadImage(img: HTMLImageElement | HTMLSourceElement): void {
    const src = img.getAttribute('data-src');
    const srcset = img.getAttribute('data-srcset');

    if (src) {
      img.setAttribute('src', src);
      img.removeAttribute('data-src');
    }

    if (srcset) {
      img.setAttribute('srcset', srcset);
      img.removeAttribute('data-srcset');
    }

    // Add loaded class pour animations
    img.classList.add('loaded');
  }

  private loadAllImages(): void {
    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach((img) => {
      this.loadImage(img as HTMLImageElement);
    });
  }

  public destroy(): void {
    this.observer?.disconnect();
  }
}

export class ComponentLazyLoader {
  private observer: IntersectionObserver | null = null;
  private loadedComponents = new Set<string>();

  constructor() {
    if (!('IntersectionObserver' in window)) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            const componentName = element.getAttribute('data-component');
            
            if (componentName && !this.loadedComponents.has(componentName)) {
              this.loadComponent(element, componentName);
              this.observer?.unobserve(entry.target);
            }
          }
        });
      },
      {
        rootMargin: '100px',
        threshold: 0.01,
      }
    );

    this.init();
  }

  private init(): void {
    const lazyComponents = document.querySelectorAll('[data-component]');
    lazyComponents.forEach((component) => {
      this.observer?.observe(component);
    });
  }

  private async loadComponent(element: HTMLElement, componentName: string): Promise<void> {
    try {
      element.classList.add('component-loading');

      await import(`../components/${componentName}.astro`);
      
      this.loadedComponents.add(componentName);
      element.classList.remove('component-loading');
      element.classList.add('component-loaded');

      // Callback si défini
      const onLoad = element.getAttribute('data-on-load');
      if (onLoad && typeof (window as any)[onLoad] === 'function') {
        (window as any)[onLoad](element);
      }
    } catch (error) {
      console.error(`Failed to load component: ${componentName}`, error);
      element.classList.add('component-error');
    }
  }

  public destroy(): void {
    this.observer?.disconnect();
  }
}
export function preloadCriticalResources(): void {
  const criticalImages = [
    '/hero-tech.webp',
    '/logo.png',
  ];

  criticalImages.forEach((src) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  });
}

export async function loadScriptOnDemand(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export class PerformanceMonitor {
  private metrics: Map<string, number> = new Map();

  public mark(name: string): void {
    if ('performance' in window && performance.mark) {
      performance.mark(name);
    }
    this.metrics.set(name, Date.now());
  }

  public measure(name: string, startMark: string, endMark: string): number | null {
    if ('performance' in window && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const measure = performance.getEntriesByName(name)[0];
        return measure ? measure.duration : null;
      } catch (error) {
        console.error('Performance measure error:', error);
      }
    }

    const start = this.metrics.get(startMark);
    const end = this.metrics.get(endMark);
    return start && end ? end - start : null;
  }

  public getMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};
    
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (navigation) {
        metrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
        metrics.loadComplete = navigation.loadEventEnd - navigation.loadEventStart;
        metrics.domInteractive = navigation.domInteractive - navigation.fetchStart;
      }

      if ('PerformanceObserver' in window) {
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1] as any;
            metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });

          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach((entry: any) => {
              metrics.fid = entry.processingStart - entry.startTime;
            });
          }).observe({ type: 'first-input', buffered: true });

          let clsValue = 0;
          new PerformanceObserver((list) => {
            list.getEntries().forEach((entry: any) => {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            });
            metrics.cls = clsValue;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch (error) {
          console.error('PerformanceObserver error:', error);
        }
      }
    }

    return metrics;
  }

  public logMetrics(): void {
    const metrics = this.getMetrics();
    console.table(metrics);

    if (typeof window.gtag !== 'undefined' && window.gtag) {
      Object.entries(metrics).forEach(([name, value]) => {
        window.gtag!('event', 'timing_complete', {
          name,
          value: Math.round(value),
          event_category: 'Performance',
        });
      });
    }
  }
}


export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
