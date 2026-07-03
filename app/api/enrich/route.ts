import { NextRequest, NextResponse } from 'next/server';
import { enrichOrg, searchPeople } from '@/lib/apollo';
import type { EnrichResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { name } = await req.json() as { name: string };

  if (!name) {
    return NextResponse.json({ found: false, error: 'name requerido' }, { status: 400 });
  }

  if (!process.env.APOLLO_API_KEY) {
    return NextResponse.json({ found: false, error: 'APOLLO_API_KEY no configurada en el servidor' }, { status: 500 });
  }

  try {
    const org = await enrichOrg(name);

    if (!org) {
      const result: EnrichResult = { found: false };
      return NextResponse.json(result);
    }

    const domain =
      org.primary_domain ||
      (org.website_url ? org.website_url.replace(/^https?:\/\//, '').split('/')[0] : undefined);

    let contacts: import('@/lib/types').Contact[] = [];
    if (domain) {
      contacts = await searchPeople(domain);
    }

    const result: EnrichResult = {
      found: true,
      domain,
      website: org.website_url,
      industry: org.industry,
      employees: org.estimated_num_employees,
      contacts,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const result: EnrichResult = { found: false, error: msg };
    return NextResponse.json(result, { status: 500 });
  }
}
