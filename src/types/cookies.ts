export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

export interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface CookieConsentData extends CookiePreferences {
  date: string;
}

export interface CookieConsentProps {
  defaultPreferences?: Partial<CookiePreferences>;
}
