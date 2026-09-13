// Persistencia en localStorage y helpers de exportación/importación.
// Nada de lógica de torneo acá: solo guardar y leer.

export const CLAVE = 'recreo_v1';

/** Devuelve el estado guardado o null si no hay nada (o está roto). */
export function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const estado = JSON.parse(crudo);
    if (!estado || typeof estado !== 'object' || !estado.torneo || !Array.isArray(estado.equipos)) {
      return null;
    }
    return estado;
  } catch (err) {
    console.warn('No se pudo leer el estado guardado', err);
    return null;
  }
}

/**
 * Guarda el estado. Devuelve { ok: true } o { ok: false, motivo }.
 * Si el navegador no tiene lugar (fotos muy pesadas), intenta guardar una copia
 * sin las fotos en data: para no perder el resto del torneo.
 */
export function guardar(state) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    console.warn('No se pudo guardar el estado', err);
    const esCuota = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
    if (esCuota) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify(sinFotosPesadas(state)));
        return { ok: false, motivo: 'cuota', mensaje: 'No hay lugar para guardar la foto. El torneo se guardó igual, pero la foto solo queda en memoria.' };
      } catch (err2) {
        return { ok: false, motivo: 'cuota', mensaje: 'No hay lugar en el celular para guardar. El torneo queda en memoria mientras no cierres la pestaña.' };
      }
    }
    return { ok: false, motivo: 'error', mensaje: 'No se pudo guardar el torneo en este navegador. Queda en memoria.' };
  }
}

/** Borra el estado guardado. */
export function limpiar() {
  try {
    localStorage.removeItem(CLAVE);
  } catch (err) {
    console.warn('No se pudo borrar el estado', err);
  }
}

/** Copia del estado con las fotos data: reemplazadas por null (las de img/ se conservan). */
function sinFotosPesadas(state) {
  return {
    ...state,
    equipos: (state.equipos || []).map((e) => ({
      ...e,
      foto: typeof e.foto === 'string' && e.foto.startsWith('data:') ? null : e.foto,
    })),
  };
}

/** JSON legible para exportar (con fotos incluidas). */
export function exportarJSON(state) {
  return JSON.stringify(state, null, 2);
}

/** Parsea un JSON pegado por el usuario. Lanza Error con mensaje amigable. */
export function importarJSON(str) {
  let datos;
  try {
    datos = JSON.parse(String(str || '').trim());
  } catch (err) {
    throw new Error('El texto no es un JSON válido. Fijate que esté completo.');
  }
  if (!datos || typeof datos !== 'object' || !datos.torneo || !Array.isArray(datos.equipos) || !Array.isArray(datos.partidos)) {
    throw new Error('El JSON no parece un torneo de Recreo.');
  }
  return datos;
}
