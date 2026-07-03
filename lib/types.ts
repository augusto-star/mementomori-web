export type EnrichStatus = 'pending' | 'enriching' | 'done' | 'not_found' | 'error';

export interface Contact {
  name: string;
  title?: string;
  email?: string;
  linkedin?: string;
  phone?: string;
}

export interface Company {
  id: string;
  razonSocial: string;
  cuit: string;
  domain?: string;
  website?: string;
  industry?: string;
  employees?: number;
  contacts?: Contact[];
  status: EnrichStatus;
  errorMsg?: string;
}

export interface ParseResult {
  companies: Array<{ razonSocial: string; cuit: string }>;
  pages: number;
  total: number;
}

export interface EnrichResult {
  found: boolean;
  domain?: string;
  website?: string;
  industry?: string;
  employees?: number;
  contacts?: Contact[];
  error?: string;
}
