import { ScrollTrigger } from 'gsap/ScrollTrigger';

class ScrollController {
  private triggers: Map<string, ScrollTrigger> = new Map();

  register(id: string, trigger: ScrollTrigger | null): void {
    if (trigger) {
      this.triggers.set(id, trigger);
    }
  }

  unregister(id: string): void {
    const trigger = this.triggers.get(id);
    if (trigger) {
      trigger.kill();
      this.triggers.delete(id);
    }
  }

  killAll(): void {
    this.triggers.forEach(trigger => trigger.kill());
    this.triggers.clear();
  }

  refresh(): void {
    ScrollTrigger.refresh();
  }

  getActive(): string[] {
    return Array.from(this.triggers.keys());
  }
}

export const scrollController = new ScrollController();