import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import type { Company } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { companies } = await req.json() as { companies: Company[] };

  const rows: Record<string, string>[] = [];

  for (const co of companies) {
    if (!co.contacts || co.contacts.length === 0) {
      rows.push({
        'Razón Social': co.razonSocial,
        CUIT: co.cuit,
        Sitio: co.website ?? '',
        Dominio: co.domain ?? '',
        Industria: co.industry ?? '',
        Empleados: co.employees?.toString() ?? '',
        Contacto: '',
        Cargo: '',
        Email: '',
        LinkedIn: '',
        Teléfono: '',
      });
    } else {
      for (const c of co.contacts) {
        rows.push({
          'Razón Social': co.razonSocial,
          CUIT: co.cuit,
          Sitio: co.website ?? '',
          Dominio: co.domain ?? '',
          Industria: co.industry ?? '',
          Empleados: co.employees?.toString() ?? '',
          Contacto: c.name ?? '',
          Cargo: c.title ?? '',
          Email: c.email ?? '',
          LinkedIn: c.linkedin ?? '',
          Teléfono: c.phone ?? '',
        });
      }
    }
  }

  const csv = Papa.unparse(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="prospectos.csv"',
    },
  });
}
