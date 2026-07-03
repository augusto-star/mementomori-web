import type { Contact } from './types';

const BASE = 'https://api.apollo.io/api/v1';

function apiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY no configurada');
  return key;
}

async function post(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ api_key: apiKey(), ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo ${endpoint} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface ApolloOrg {
  name: string;
  website_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  id?: string;
}

export async function enrichOrg(name: string): Promise<ApolloOrg | null> {
  const data = await post('/organizations/enrich', {
    name,
    country: 'Argentina',
  });
  return data.organization ?? null;
}

export interface ApolloPerson {
  name: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  phone_numbers?: Array<{ sanitized_number: string }>;
}

export async function searchPeople(domain: string): Promise<Contact[]> {
  const data = await post('/mixed_people/search', {
    q_organization_domains: [domain],
    per_page: 5,
    page: 1,
    person_seniorities: ['c_suite', 'vp', 'director', 'manager', 'owner', 'founder'],
    person_locations: ['Argentina'],
  });

  const people: ApolloPerson[] = data.people ?? [];
  return people.map((p) => ({
    name: p.name,
    title: p.title,
    email: p.email,
    linkedin: p.linkedin_url,
    phone: p.phone_numbers?.[0]?.sanitized_number,
  }));
}
