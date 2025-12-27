import type { ScrollTrigger as GSAPScrollTrigger } from 'gsap/ScrollTrigger';

export type GSAPElement = Element | HTMLElement;
export type GSAPTarget = GSAPElement | GSAPElement[];
export type GSAPSelector = string;

export interface GSAPTweenVars {
  [key: string]: any;
}

// ===== SCROLL TRIGGER =====

export type ScrollTriggerInstance = GSAPScrollTrigger | null;

export interface ScrollTriggerConfig {
  trigger: GSAPElement | string;
  start?: string;
  end?: string;
  scrub?: boolean | number;
  pin?: boolean;
  markers?: boolean;
  toggleActions?: string;
  once?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
  onEnterBack?: () => void;
  onLeaveBack?: () => void;
}

// ===== ANIMATION OPTIONS =====

export interface BaseAnimationOptions {
  selector: string;
  duration?: number;
  ease?: string;
  delay?: number;
}

export interface HorizontalScrollOptions {
  container: string;
  sections: string;
  speed?: number;
  snap?: boolean;
}

export interface ParallaxLayer {
  selector: string;
  speed: number;
  direction?: 'x' | 'y';
}

export interface AdvancedParallaxOptions {
  layers: ParallaxLayer[];
}

export interface RevealOptions extends BaseAnimationOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  stagger?: number;
  triggerStart?: string;
}

export interface CounterOptions {
  selector: string;
  duration?: number;
  ease?: string;
  startValue?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}

export interface SplitSectionOptions {
  container: string;
  leftPanel: string;
  rightPanel: string;
  distance?: number;
}

export interface AnimatedScrollLineOptions {
  lineSelector: string;
  color?: string;
  width?: string;
  opacity?: number;
}

export interface MorphOptions extends BaseAnimationOptions {
  scale?: number;
  rotation?: number;
  transformPerspective?: number;
}

export interface TextRevealOptions {
  selector: string;
  stagger?: number;
  duration?: number;
  triggerStart?: string;
  splitBy?: 'chars' | 'words' | 'lines';
}

// ===== MAGNETIC BUTTON =====

export interface MagneticButtonConfig {
  magnetStrength?: number;
  scaleOnHover?: number;
  duration?: number;
  ease?: string;
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface ElementBounds {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ===== TIMELINE =====

export interface TimelineStep {
  target: GSAPSelector;
  from?: GSAPTweenVars;
  to: GSAPTweenVars;
  position?: string | number;
  duration?: number;
}

export interface StickyTimelineOptions {
  container: string;
  timeline: TimelineStep[];
  pinSpacing?: number | string;
  scrub?: boolean | number;
}

// ===== SCROLL CONTROLLER =====

export interface ScrollControllerRegistration {
  id: string;
  trigger: ScrollTriggerInstance;
  cleanup?: () => void;
}

export interface ScrollControllerState {
  triggers: Map<string, GSAPScrollTrigger>;
  isEnabled: boolean;
}

// ===== ACCESSIBILITY =====

export interface AccessibilityConfig {
  respectReducedMotion: boolean;
  fallbackDuration?: number;
  disableParallax?: boolean;
}

export interface MotionPreferences {
  prefersReducedMotion: boolean;
  prefersReducedTransparency?: boolean;
}

// ===== UTILITY TYPES =====

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

// ===== ANIMATION STATE =====

export interface AnimationState {
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  duration: number;
}

export interface AnimationRegistration {
  id: string;
  element: HTMLElement;
  animation: gsap.core.Tween | gsap.core.Timeline;
  state: AnimationState;
}

export interface ColorPalette {
  primary: string;
  primaryDark: string;
  secondary: string;
  first: string;
  primaryLight: string;
}

export const DEFAULT_COLORS: Readonly<ColorPalette> = {
  primary: 'oklch(60.201% 0.11053 58.986)',
  primaryDark: 'oklch(37.619% 0.07877 44.64)',
  secondary: 'oklch(65.92% 0.153 34.70)',
  first: 'oklch(67.081% 0.13582 82.641)',
  primaryLight: 'oklch(95% 0.05 250)',
} as const;


export enum Breakpoint {
  Mobile = 768,
  Tablet = 1024,
  Desktop = 1280,
  Wide = 1536,
}

export interface ResponsiveConfig<T> {
  mobile?: T;
  tablet?: T;
  desktop?: T;
  default: T;
}

export class AnimationError extends Error {
  constructor(
    message: string,
    public readonly element?: GSAPElement,
    public readonly animationType?: string
  ) {
    super(message);
    this.name = 'AnimationError';
  }
}

export function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

export function isScrollTrigger(
  trigger: any
): trigger is GSAPScrollTrigger {
  return trigger && typeof trigger.kill === 'function';
}

export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}