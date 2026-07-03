import { NextRequest, NextResponse } from 'next/server';
import { extractCompanies } from '@/lib/parsePdf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
  }

  if (!file.name.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Dynamic import to avoid pdf-parse loading test files at module init
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);

  const companies = extractCompanies(data.text);

  return NextResponse.json({
    companies,
    pages: data.numpages,
    total: companies.length,
  });
}
