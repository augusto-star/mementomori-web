'use client';

import { useState, useCallback, useRef } from 'react';
import type { Company, EnrichResult, ParseResult } from '@/lib/types';

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

type Tab = 'todas' | 'enriquecidas' | 'no_encontradas';

export default function Home() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [uploading, setUploading] = useState(false);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [tab, setTab] = useState<Tab>('todas');
  const [pdfInfo, setPdfInfo] = useState<{ pages: number; total: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    setCompanies([]);
    setPdfInfo(null);

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd });
    const data: ParseResult = await res.json();

    if (!res.ok) {
      alert('Error al parsear PDF: ' + (data as unknown as { error: string }).error);
      setUploading(false);
      return;
    }

    setCompanies(
      data.companies.map((c) => ({ ...c, id: nanoid(), status: 'pending' }))
    );
    setPdfInfo({ pages: data.pages, total: data.total });
    setUploading(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const enrichOne = useCallback(async (id: string) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'enriching' } : c))
    );

    const company = companies.find((c) => c.id === id);
    if (!company) return;

    const res = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: company.razonSocial }),
    });

    const data: EnrichResult = await res.json();

    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (!data.found) {
          return { ...c, status: 'not_found', errorMsg: data.error };
        }
        return {
          ...c,
          status: 'done',
          domain: data.domain,
          website: data.website,
          industry: data.industry,
          employees: data.employees,
          contacts: data.contacts ?? [],
        };
      })
    );
  }, [companies]);

  const enrichAll = useCallback(async () => {
    setEnrichingAll(true);
    const pending = companies.filter((c) => c.status === 'pending');

    for (const co of pending) {
      await enrichOne(co.id);
      // Small delay to avoid hammering Apollo rate limits
      await new Promise((r) => setTimeout(r, 400));
    }

    setEnrichingAll(false);
  }, [companies, enrichOne]);

  const exportCsv = useCallback(async () => {
    const done = companies.filter((c) => c.status === 'done');
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies: done }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prospectos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [companies]);

  const filtered = companies.filter((c) => {
    if (tab === 'enriquecidas') return c.status === 'done';
    if (tab === 'no_encontradas') return c.status === 'not_found';
    return true;
  });

  const counts = {
    done: companies.filter((c) => c.status === 'done').length,
    not_found: companies.filter((c) => c.status === 'not_found').length,
    pending: companies.filter((c) => c.status === 'pending').length,
    enriching: companies.filter((c) => c.status === 'enriching').length,
  };

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-wide text-cream">Prospector AR</h1>
        <p className="text-sm text-cream/40 mt-1">
          Subí el PDF de la ronda de negocios → extraemos empresas → enriquecemos con Apollo
        </p>
      </div>

      {/* Upload zone */}
      {companies.length === 0 && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-gold/60 rounded-xl p-16 text-center cursor-pointer transition-colors group"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {uploading ? (
            <div className="space-y-3">
              <Spinner />
              <p className="text-cream/60">Procesando PDF…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-5xl group-hover:scale-110 transition-transform">📄</div>
              <p className="text-cream font-medium">Arrastrá el PDF acá o hacé clic para seleccionarlo</p>
              <p className="text-cream/40 text-sm">Formato: Ronda de negocios con Razón Social + CUIT</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {companies.length > 0 && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="bg-panel rounded-lg px-4 py-2 border border-border">
              <span className="text-cream/40 text-xs">PDF</span>
              <span className="ml-2 text-cream text-sm">{pdfInfo?.pages} páginas</span>
            </div>
            <div className="bg-panel rounded-lg px-4 py-2 border border-border">
              <span className="text-cream/40 text-xs">Extraídas</span>
              <span className="ml-2 text-cream text-sm">{pdfInfo?.total}</span>
            </div>
            <div className="bg-panel rounded-lg px-4 py-2 border border-border">
              <span className="text-cream/40 text-xs">Enriquecidas</span>
              <span className="ml-2 text-gold text-sm font-medium">{counts.done}</span>
            </div>
            <div className="bg-panel rounded-lg px-4 py-2 border border-border">
              <span className="text-cream/40 text-xs">No encontradas</span>
              <span className="ml-2 text-red-400 text-sm">{counts.not_found}</span>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => { setCompanies([]); setPdfInfo(null); }}
              className="text-cream/40 hover:text-cream text-sm transition-colors"
            >
              ↩ Nuevo PDF
            </button>

            <button
              onClick={enrichAll}
              disabled={enrichingAll || counts.pending === 0}
              className="px-4 py-2 rounded-lg border border-gold text-gold hover:bg-gold hover:text-surface transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enrichingAll
                ? `Enriqueciendo… (${counts.enriching > 0 ? 'procesando' : `${counts.pending} restantes`})`
                : `Enriquecer todas (${counts.pending})`}
            </button>

            <button
              onClick={exportCsv}
              disabled={counts.done === 0}
              className="px-4 py-2 rounded-lg bg-gold text-surface text-sm font-medium hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Exportar CSV ({counts.done})
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(['todas', 'enriquecidas', 'no_encontradas'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-gold text-gold'
                    : 'border-transparent text-cream/40 hover:text-cream'
                }`}
              >
                {t === 'todas' ? `Todas (${companies.length})` : null}
                {t === 'enriquecidas' ? `Enriquecidas (${counts.done})` : null}
                {t === 'no_encontradas' ? `No encontradas (${counts.not_found})` : null}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel border-b border-border">
                  <th className="text-left px-4 py-3 text-cream/40 font-normal w-8">#</th>
                  <th className="text-left px-4 py-3 text-cream/40 font-normal">Razón Social</th>
                  <th className="text-left px-4 py-3 text-cream/40 font-normal">CUIT</th>
                  <th className="text-left px-4 py-3 text-cream/40 font-normal">Sitio / Industria</th>
                  <th className="text-left px-4 py-3 text-cream/40 font-normal">Contactos</th>
                  <th className="text-left px-4 py-3 text-cream/40 font-normal w-28">Estado</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((co, i) => (
                  <>
                    <tr
                      key={co.id}
                      className="border-b border-border/50 hover:bg-panel/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-cream/30">{i + 1}</td>
                      <td className="px-4 py-3 text-cream font-medium">{co.razonSocial}</td>
                      <td className="px-4 py-3 text-cream/60 font-mono text-xs">{co.cuit}</td>
                      <td className="px-4 py-3">
                        {co.website ? (
                          <a
                            href={co.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold hover:underline text-xs"
                          >
                            {co.domain}
                          </a>
                        ) : (
                          <span className="text-cream/20 text-xs">—</span>
                        )}
                        {co.industry && (
                          <div className="text-cream/40 text-xs mt-0.5">{co.industry}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {co.contacts && co.contacts.length > 0 ? (
                          <button
                            onClick={() => setExpandedId(expandedId === co.id ? null : co.id)}
                            className="text-gold hover:underline text-xs"
                          >
                            {co.contacts.length} contacto{co.contacts.length !== 1 ? 's' : ''}{' '}
                            {expandedId === co.id ? '▲' : '▼'}
                          </button>
                        ) : (
                          <span className="text-cream/20 text-xs">
                            {co.status === 'done' ? 'Sin contactos' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={co.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {co.status === 'pending' && (
                          <button
                            onClick={() => enrichOne(co.id)}
                            className="text-xs px-3 py-1 border border-border rounded hover:border-gold hover:text-gold transition-colors text-cream/60"
                          >
                            Enriquecer
                          </button>
                        )}
                        {co.status === 'enriching' && <Spinner small />}
                        {co.status === 'not_found' && (
                          <button
                            onClick={() => enrichOne(co.id)}
                            className="text-xs px-3 py-1 border border-border rounded hover:border-gold hover:text-gold transition-colors text-cream/30"
                          >
                            Reintentar
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded contacts */}
                    {expandedId === co.id && co.contacts && co.contacts.length > 0 && (
                      <tr key={`${co.id}-contacts`} className="bg-panel/40">
                        <td colSpan={7} className="px-8 py-3">
                          <div className="space-y-2">
                            {co.contacts.map((c, ci) => (
                              <div key={ci} className="flex gap-6 text-xs">
                                <span className="text-cream font-medium w-40 truncate">{c.name}</span>
                                <span className="text-cream/50 w-40 truncate">{c.title ?? '—'}</span>
                                <span className="text-gold w-48 truncate">{c.email ?? '—'}</span>
                                {c.linkedin && (
                                  <a
                                    href={c.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline"
                                  >
                                    LinkedIn
                                  </a>
                                )}
                                {c.phone && (
                                  <span className="text-cream/50">{c.phone}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-cream/30">No hay empresas en esta vista</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: Company['status'] }) {
  const map: Record<Company['status'], { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'text-cream/30 bg-panel' },
    enriching: { label: 'Buscando…', className: 'text-gold bg-gold/10' },
    done: { label: 'Listo', className: 'text-green-400 bg-green-400/10' },
    not_found: { label: 'No encontrada', className: 'text-red-400 bg-red-400/10' },
    error: { label: 'Error', className: 'text-red-400 bg-red-400/10' },
  };

  const { label, className } = map[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>{label}</span>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`border-2 border-gold/20 border-t-gold rounded-full animate-spin ${
        small ? 'w-4 h-4' : 'w-8 h-8 mx-auto'
      }`}
    />
  );
}
