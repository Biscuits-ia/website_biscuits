export interface Partner {
  id: string;
  name: string;
  description: string;
  collaboration: string;
  logo_url: string | null;
  website_url: string | null;
  expertise: string[];
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerInput {
  name: string;
  description: string;
  collaboration: string;
  logo_url?: string;
  website_url?: string;
  expertise?: string[];
  display_order?: number;
  is_published?: boolean;
}
