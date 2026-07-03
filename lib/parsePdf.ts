export interface ExtractedCompany {
  razonSocial: string;
  cuit: string;
}

// CUIT argentino: XX-XXXXXXXX-X
const CUIT_RE = /\((\d{2}-\d{8}-\d)\)/g;

export function extractCompanies(text: string): ExtractedCompany[] {
  const seen = new Set<string>();
  const results: ExtractedCompany[] = [];

  const lines = text.split('\n');

  for (const line of lines) {
    const matches = Array.from(line.matchAll(CUIT_RE));
    for (const match of matches) {
      const cuit = match[1];
      if (seen.has(cuit)) continue;

      const before = line.slice(0, match.index).trim();
      const name = cleanName(before);
      if (!name) continue;

      seen.add(cuit);
      results.push({ razonSocial: name, cuit });
    }
  }

  return results;
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[\d\s]+/, '')         // leading table numbers (mesa #)
    .replace(/^Solicitante:\s*/i, '') // "Solicitante: "
    .replace(/[^\w\s,._()\-&+/ÁÉÍÓÚÜÑáéíóúüñ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
