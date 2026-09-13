/**
 * tournament.js — lógica pura del torneo de beer pong.
 *
 * Todas las funciones reciben un estado y devuelven uno NUEVO (nunca mutan el
 * que les pasaron). No tocan el DOM ni dependen de nada externo, así que se
 * pueden testear con `node --test`.
 *
 * El contrato del estado está en ../PLAN.md.
 */

export const VERSION = 1;

export const FORMATOS = ['liga', 'eliminacion'];
export const ESTADOS = ['inscripcion', 'en_juego', 'finalizado'];

export const REGLAS_DEFAULT = [
  '10 vasos por lado, acomodados en triángulo. Cada equipo tira desde su punta de la mesa.',
  'Cada integrante tira una pelotita por turno; después le toca al otro equipo.',
  'Re-rack (reacomodar los vasos) cuando quedan 6 y cuando quedan 3. Se pide antes de tirar.',
  'Tiro con pique vale doble, pero el equipo rival puede bloquear la pelotita después del pique.',
  'Si la pelotita vuelve para tu lado sin tocar el piso, podés hacer un tiro trick (de espaldas, con la otra mano, etc.).',
  'Redención: cuando te embocan el último vaso, tenés una chance de embocar todos los que te quedan al rival. Si lo lográs, se va a muerte súbita.',
  'El codo siempre atrás del borde de la mesa. Si se pasa, el tiro no vale.',
  'El equipo que pierde toma lo que queda en los vasos del ganador.',
];

const EQUIPOS_EJEMPLO = [
  { id: 'e1', nombre: 'Los del Quincho', integrantes: ['', '', ''], foto: 'img/equipo-1.jpg' },
  { id: 'e2', nombre: 'Los de la Pileta', integrantes: ['', '', ''], foto: 'img/equipo-2.jpg' },
];

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function clonar(state) {
  return structuredClone(state);
}

/** Fecha de hoy en formato ISO yyyy-mm-dd, en hora local. */
function hoyISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Próximo id con un prefijo dado: máximo numérico existente + 1 (nunca colisiona tras borrar). */
function proximoId(prefijo, items) {
  let max = 0;
  for (const it of items) {
    const m = typeof it.id === 'string' && it.id.match(new RegExp(`^${prefijo}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefijo}${max + 1}`;
}

function normalizarIntegrantes(integrantes) {
  if (integrantes == null) return ['', '', ''];
  if (!Array.isArray(integrantes)) throw new Error('Los integrantes tienen que ser una lista de nombres.');
  return integrantes.map((n) => (n == null ? '' : String(n).trim()));
}

function normalizarFoto(foto) {
  if (foto == null || foto === '') return null;
  if (typeof foto !== 'string') throw new Error('La foto tiene que ser una URL o un data URI.');
  return foto;
}

function normalizarNombre(nombre) {
  const n = nombre == null ? '' : String(nombre).trim();
  if (!n) throw new Error('El equipo necesita un nombre.');
  return n;
}

function exigirEstado(state, estado, mensaje) {
  if (state.torneo.estado !== estado) throw new Error(mensaje);
}

function buscarPartido(state, partidoId) {
  const p = state.partidos.find((x) => x.id === partidoId);
  if (!p) throw new Error(`No existe el partido "${partidoId}".`);
  return p;
}

function totalRondas(state) {
  return state.partidos.reduce((max, p) => Math.max(max, p.ronda), 0);
}

function ordenarPartidos(partidos) {
  return [...partidos].sort((a, b) => a.ronda - b.ronda || a.orden - b.orden);
}

function nuevoPartido(id, ronda, orden) {
  return {
    id,
    ronda,
    orden,
    localId: null,
    visitanteId: null,
    vasosLocal: null,
    vasosVisitante: null,
    ganadorId: null,
    jugado: false,
    bye: false,
    siguiente: null,
  };
}

// ---------------------------------------------------------------------------
// Estado inicial y gestión de equipos / configuración
// ---------------------------------------------------------------------------

export function crearEstadoInicial() {
  return {
    version: VERSION,
    torneo: {
      nombre: 'Recreo Beer Pong',
      fecha: hoyISO(),
      formato: 'liga',
      vasosPorLado: 10,
      estado: 'inscripcion',
      campeonId: null,
    },
    equipos: structuredClone(EQUIPOS_EJEMPLO),
    partidos: [],
    reglas: [...REGLAS_DEFAULT],
  };
}

export function agregarEquipo(state, { nombre, integrantes, foto } = {}) {
  exigirEstado(state, 'inscripcion', 'No se pueden agregar equipos con el fixture ya generado. Reiniciá el torneo primero.');
  const s = clonar(state);
  s.equipos.push({
    id: proximoId('e', s.equipos),
    nombre: normalizarNombre(nombre),
    integrantes: normalizarIntegrantes(integrantes),
    foto: normalizarFoto(foto),
  });
  return s;
}

export function editarEquipo(state, id, cambios = {}) {
  const s = clonar(state);
  const eq = s.equipos.find((e) => e.id === id);
  if (!eq) throw new Error(`No existe el equipo "${id}".`);
  if ('nombre' in cambios) eq.nombre = normalizarNombre(cambios.nombre);
  if ('integrantes' in cambios) eq.integrantes = normalizarIntegrantes(cambios.integrantes);
  if ('foto' in cambios) eq.foto = normalizarFoto(cambios.foto);
  return s;
}

export function eliminarEquipo(state, id) {
  exigirEstado(state, 'inscripcion', 'No se pueden eliminar equipos con el fixture ya generado. Reiniciá el torneo primero.');
  if (!state.equipos.some((e) => e.id === id)) throw new Error(`No existe el equipo "${id}".`);
  const s = clonar(state);
  s.equipos = s.equipos.filter((e) => e.id !== id);
  return s;
}

export function configurarTorneo(state, cambios = {}) {
  exigirEstado(state, 'inscripcion', 'No se puede cambiar la configuración con el fixture ya generado. Reiniciá el torneo primero.');
  const s = clonar(state);
  const t = s.torneo;
  if ('nombre' in cambios) {
    const n = cambios.nombre == null ? '' : String(cambios.nombre).trim();
    if (!n) throw new Error('El torneo necesita un nombre.');
    t.nombre = n;
  }
  if ('fecha' in cambios) {
    const f = cambios.fecha == null ? '' : String(cambios.fecha).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error('La fecha tiene que tener formato yyyy-mm-dd.');
    t.fecha = f;
  }
  if ('formato' in cambios) {
    if (!FORMATOS.includes(cambios.formato)) throw new Error(`Formato inválido: "${cambios.formato}". Tiene que ser liga o eliminacion.`);
    t.formato = cambios.formato;
  }
  if ('vasosPorLado' in cambios) {
    const v = Number(cambios.vasosPorLado);
    if (!Number.isInteger(v) || v < 1) throw new Error('Los vasos por lado tienen que ser un número entero mayor a 0.');
    t.vasosPorLado = v;
  }
  return s;
}

export function editarReglas(state, reglas) {
  if (!Array.isArray(reglas)) throw new Error('Las reglas tienen que ser una lista de textos.');
  const s = clonar(state);
  s.reglas = reglas.map((r) => (r == null ? '' : String(r).trim())).filter((r) => r !== '');
  return s;
}

export function reiniciarTorneo(state) {
  const s = clonar(state);
  s.partidos = [];
  s.torneo.estado = 'inscripcion';
  s.torneo.campeonId = null;
  return s;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * Liga: método del círculo. Con cantidad impar se agrega un "libre" (null):
 * el partido contra el libre no se crea, así que ese equipo descansa esa fecha.
 */
function generarLiga(equipos) {
  const ids = equipos.map((e) => e.id);
  if (ids.length % 2 === 1) ids.push(null);
  const m = ids.length;
  const fechas = m - 1;
  const partidos = [];
  let contador = 1;

  let rueda = ids.slice();
  for (let f = 1; f <= fechas; f++) {
    let orden = 1;
    for (let i = 0; i < m / 2; i++) {
      const a = rueda[i];
      const b = rueda[m - 1 - i];
      if (a === null || b === null) continue; // libre
      const p = nuevoPartido(`p${contador++}`, f, orden++);
      // alternamos la localía para que no sea siempre el mismo el local
      if (f % 2 === 0) {
        p.localId = b;
        p.visitanteId = a;
      } else {
        p.localId = a;
        p.visitanteId = b;
      }
      partidos.push(p);
    }
    // rotación: el primero queda fijo, el resto gira un lugar
    rueda = [rueda[0], rueda[m - 1], ...rueda.slice(1, m - 1)];
  }
  return partidos;
}

/**
 * Eliminación directa.
 *
 * - Tamaño de llave = siguiente potencia de 2 (mínimo 2).
 * - Rondas 1..log2(tamaño); la última es la final.
 * - Los partidos se encadenan con `siguiente`: el partido de orden o en la
 *   ronda r manda a su ganador a la ronda r+1, orden ceil(o/2), lado 'local'
 *   si o es impar y 'visitante' si es par.
 * - Los byes (tamaño - cantidad de equipos) se los llevan los PRIMEROS equipos
 *   de la lista (el orden de inscripción es el sembrado). Para que dos byes no
 *   se crucen en la segunda ronda mientras se pueda evitar, los byes se
 *   reparten en partidos alternados de la primera ronda: primero los de orden
 *   impar (1, 3, 5, ...) y, si sobran, los de orden par (2, 4, 6, ...). Como
 *   el partido 2k-1 y el 2k confluyen en el mismo partido de segunda ronda,
 *   recién se juntan dos byes cuando hay más byes que partidos de segunda ronda,
 *   que es exactamente cuando es inevitable.
 * - Un bye queda como partido con localId = el equipo, visitanteId = null,
 *   bye: true, jugado: true, ganadorId = el equipo, y el equipo ya aparece
 *   ubicado en su partido `siguiente`.
 * - El resto de los equipos se ubica en orden en los lugares que quedan
 *   (el primer lugar libre es local, el segundo visitante, y así).
 */
function generarEliminacion(equipos) {
  const n = equipos.length;
  let tamano = 2;
  while (tamano < n) tamano *= 2;
  const rondas = Math.log2(tamano);
  const cantByes = tamano - n;

  // Creamos todos los partidos de todas las rondas, con ids correlativos.
  const porRonda = [];
  let contador = 1;
  for (let r = 1; r <= rondas; r++) {
    const cant = tamano / 2 ** r;
    const lista = [];
    for (let o = 1; o <= cant; o++) lista.push(nuevoPartido(`p${contador++}`, r, o));
    porRonda.push(lista);
  }
  // Encadenamos con `siguiente`.
  for (let r = 0; r < rondas - 1; r++) {
    for (const p of porRonda[r]) {
      const destino = porRonda[r + 1][Math.ceil(p.orden / 2) - 1];
      p.siguiente = { partidoId: destino.id, lado: p.orden % 2 === 1 ? 'local' : 'visitante' };
    }
  }

  // Elegimos qué partidos de primera ronda son bye: impares primero, luego pares.
  const primera = porRonda[0];
  const ordenBye = [
    ...primera.filter((p) => p.orden % 2 === 1),
    ...primera.filter((p) => p.orden % 2 === 0),
  ].slice(0, cantByes);
  const esBye = new Set(ordenBye.map((p) => p.id));

  const conBye = equipos.slice(0, cantByes).map((e) => e.id);
  const sinBye = equipos.slice(cantByes).map((e) => e.id);

  for (const p of primera) {
    if (esBye.has(p.id)) {
      const id = conBye.shift();
      p.localId = id;
      p.visitanteId = null;
      p.bye = true;
      p.jugado = true;
      p.ganadorId = id;
    } else {
      p.localId = sinBye.shift();
      p.visitanteId = sinBye.shift();
    }
  }

  const partidos = porRonda.flat();
  // Propagamos los byes a su partido siguiente.
  for (const p of primera) {
    if (p.bye && p.siguiente) {
      const destino = partidos.find((x) => x.id === p.siguiente.partidoId);
      destino[p.siguiente.lado === 'local' ? 'localId' : 'visitanteId'] = p.ganadorId;
    }
  }
  return partidos;
}

export function generarFixture(state) {
  exigirEstado(state, 'inscripcion', 'El fixture ya está generado. Reiniciá el torneo para volver a generarlo.');
  if (state.equipos.length < 2) throw new Error('Hacen falta al menos 2 equipos para generar el fixture.');
  const s = clonar(state);
  s.partidos = s.torneo.formato === 'liga' ? generarLiga(s.equipos) : generarEliminacion(s.equipos);
  s.torneo.estado = 'en_juego';
  s.torneo.campeonId = null;
  return s;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function validarVasos(valor, etiqueta, max) {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    throw new Error(`Los vasos del ${etiqueta} tienen que ser un número entero.`);
  }
  if (valor < 0 || valor > max) throw new Error(`Los vasos del ${etiqueta} tienen que estar entre 0 y ${max}.`);
}

/** Actualiza estado/campeón según lo que quede por jugar. Muta `s` (ya clonado). */
function cerrarSiTermino(s) {
  const pendientes = s.partidos.some((p) => !p.jugado);
  if (pendientes || s.partidos.length === 0) {
    s.torneo.estado = 'en_juego';
    s.torneo.campeonId = null;
    return;
  }
  s.torneo.estado = 'finalizado';
  if (s.torneo.formato === 'eliminacion') {
    const ultima = totalRondas(s);
    const final = s.partidos.find((p) => p.ronda === ultima);
    s.torneo.campeonId = final ? final.ganadorId : null;
  } else {
    const tabla = tablaPosiciones(s);
    s.torneo.campeonId = tabla.length ? tabla[0].equipoId : null;
  }
}

export function registrarResultado(state, partidoId, vasosLocal, vasosVisitante) {
  if (state.torneo.estado === 'inscripcion') throw new Error('Todavía no hay fixture generado.');
  const partidoOriginal = buscarPartido(state, partidoId);
  if (partidoOriginal.bye) throw new Error('Un bye no tiene resultado para cargar.');
  if (!partidoOriginal.localId || !partidoOriginal.visitanteId) {
    throw new Error('Todavía no se sabe quiénes juegan este partido.');
  }

  const max = state.torneo.vasosPorLado;
  validarVasos(vasosLocal, 'local', max);
  validarVasos(vasosVisitante, 'visitante', max);
  if (vasosLocal === max && vasosVisitante === max) {
    throw new Error(`No pueden llegar los dos a ${max} vasos.`);
  }
  if (vasosLocal === vasosVisitante) throw new Error('No hay empates en beer pong: alguien tiene que ganar.');

  // Si ya estaba cargado, lo deshacemos primero (falla si el siguiente ya se jugó).
  let s = partidoOriginal.jugado ? deshacerResultado(state, partidoId) : clonar(state);
  const p = buscarPartido(s, partidoId);

  let ganadorId;
  if (vasosLocal === max || vasosVisitante === max) {
    ganadorId = vasosLocal === max ? p.localId : p.visitanteId;
  } else {
    ganadorId = vasosLocal > vasosVisitante ? p.localId : p.visitanteId;
  }

  p.vasosLocal = vasosLocal;
  p.vasosVisitante = vasosVisitante;
  p.ganadorId = ganadorId;
  p.jugado = true;

  if (p.siguiente) {
    const destino = buscarPartido(s, p.siguiente.partidoId);
    destino[p.siguiente.lado === 'local' ? 'localId' : 'visitanteId'] = ganadorId;
  }

  cerrarSiTermino(s);
  return s;
}

export function deshacerResultado(state, partidoId) {
  const original = buscarPartido(state, partidoId);
  if (original.bye) throw new Error('Un bye no se puede deshacer.');
  if (!original.jugado) throw new Error('Ese partido todavía no tiene resultado cargado.');
  if (original.siguiente) {
    const destino = buscarPartido(state, original.siguiente.partidoId);
    if (destino.jugado) throw new Error('No se puede deshacer: el partido siguiente ya se jugó. Deshacé ese primero.');
  }

  const s = clonar(state);
  const p = buscarPartido(s, partidoId);
  if (p.siguiente) {
    const destino = buscarPartido(s, p.siguiente.partidoId);
    destino[p.siguiente.lado === 'local' ? 'localId' : 'visitanteId'] = null;
  }
  p.vasosLocal = null;
  p.vasosVisitante = null;
  p.ganadorId = null;
  p.jugado = false;

  cerrarSiTermino(s);
  return s;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function equipoPorId(state, id) {
  return state.equipos.find((e) => e.id === id) || null;
}

export function tablaPosiciones(state) {
  const filas = new Map();
  for (const e of state.equipos) {
    filas.set(e.id, { equipoId: e.id, pj: 0, pg: 0, pp: 0, vf: 0, vc: 0, dif: 0, pts: 0 });
  }
  for (const p of state.partidos) {
    if (!p.jugado || p.bye) continue;
    const local = filas.get(p.localId);
    const visitante = filas.get(p.visitanteId);
    if (!local || !visitante) continue;
    local.pj++;
    visitante.pj++;
    local.vf += p.vasosLocal;
    local.vc += p.vasosVisitante;
    visitante.vf += p.vasosVisitante;
    visitante.vc += p.vasosLocal;
    if (p.ganadorId === p.localId) {
      local.pg++;
      visitante.pp++;
    } else {
      visitante.pg++;
      local.pp++;
    }
  }
  const nombre = (id) => (equipoPorId(state, id) || {}).nombre || '';
  const tabla = [...filas.values()].map((f) => ({ ...f, dif: f.vf - f.vc, pts: f.pg * 3 }));
  tabla.sort(
    (a, b) =>
      b.pts - a.pts ||
      b.dif - a.dif ||
      b.vf - a.vf ||
      nombre(a.equipoId).localeCompare(nombre(b.equipoId), 'es', { sensitivity: 'base' }),
  );
  return tabla;
}

export function nombreRonda(formato, ronda, totalRondas) {
  if (formato === 'liga') return `Fecha ${ronda}`;
  const faltan = totalRondas - ronda;
  if (faltan === 0) return 'Final';
  if (faltan === 1) return 'Semifinal';
  if (faltan === 2) return 'Cuartos';
  if (faltan === 3) return 'Octavos';
  return `Ronda ${ronda}`;
}

export function partidosPorRonda(state) {
  const total = totalRondas(state);
  const grupos = new Map();
  for (const p of ordenarPartidos(state.partidos)) {
    if (!grupos.has(p.ronda)) {
      grupos.set(p.ronda, { ronda: p.ronda, nombre: nombreRonda(state.torneo.formato, p.ronda, total), partidos: [] });
    }
    grupos.get(p.ronda).partidos.push(structuredClone(p));
  }
  return [...grupos.values()];
}

export function campeon(state) {
  if (!state.torneo.campeonId) return null;
  return equipoPorId(state, state.torneo.campeonId);
}

export function proximoPartido(state) {
  const p = ordenarPartidos(state.partidos).find((x) => !x.jugado && x.localId && x.visitanteId);
  return p ? structuredClone(p) : null;
}

// ---------------------------------------------------------------------------
// Serialización (para compartir por URL)
// ---------------------------------------------------------------------------

function aBase64Url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function serializar(state) {
  const s = clonar(state);
  // Las fotos en data URI pesan demasiado para una URL: se descartan.
  for (const e of s.equipos) {
    if (typeof e.foto === 'string' && e.foto.startsWith('data:')) e.foto = null;
  }
  return aBase64Url(JSON.stringify(s));
}

function esObjeto(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function validarEstado(s) {
  const fallo = (msg) => {
    throw new Error(`Estado inválido: ${msg}.`);
  };
  if (!esObjeto(s)) fallo('no es un objeto');
  if (s.version !== VERSION) fallo(`versión desconocida (${s.version})`);

  const t = s.torneo;
  if (!esObjeto(t)) fallo('falta torneo');
  if (typeof t.nombre !== 'string') fallo('torneo.nombre inválido');
  if (typeof t.fecha !== 'string') fallo('torneo.fecha inválida');
  if (!FORMATOS.includes(t.formato)) fallo('torneo.formato inválido');
  if (!Number.isInteger(t.vasosPorLado) || t.vasosPorLado < 1) fallo('torneo.vasosPorLado inválido');
  if (!ESTADOS.includes(t.estado)) fallo('torneo.estado inválido');
  if (t.campeonId !== null && typeof t.campeonId !== 'string') fallo('torneo.campeonId inválido');

  if (!Array.isArray(s.equipos)) fallo('equipos no es una lista');
  for (const e of s.equipos) {
    if (!esObjeto(e)) fallo('equipo inválido');
    if (typeof e.id !== 'string' || typeof e.nombre !== 'string') fallo('equipo sin id o nombre');
    if (!Array.isArray(e.integrantes) || !e.integrantes.every((i) => typeof i === 'string')) fallo(`integrantes inválidos en ${e.id}`);
    if (e.foto !== null && typeof e.foto !== 'string') fallo(`foto inválida en ${e.id}`);
  }

  if (!Array.isArray(s.partidos)) fallo('partidos no es una lista');
  const esIdONull = (x) => x === null || typeof x === 'string';
  const esNumONull = (x) => x === null || typeof x === 'number';
  for (const p of s.partidos) {
    if (!esObjeto(p)) fallo('partido inválido');
    if (typeof p.id !== 'string') fallo('partido sin id');
    if (!Number.isInteger(p.ronda) || !Number.isInteger(p.orden)) fallo(`ronda/orden inválidos en ${p.id}`);
    if (!esIdONull(p.localId) || !esIdONull(p.visitanteId) || !esIdONull(p.ganadorId)) fallo(`equipos inválidos en ${p.id}`);
    if (!esNumONull(p.vasosLocal) || !esNumONull(p.vasosVisitante)) fallo(`vasos inválidos en ${p.id}`);
    if (typeof p.jugado !== 'boolean' || typeof p.bye !== 'boolean') fallo(`flags inválidos en ${p.id}`);
    if (p.siguiente !== null) {
      if (!esObjeto(p.siguiente) || typeof p.siguiente.partidoId !== 'string' || !['local', 'visitante'].includes(p.siguiente.lado)) {
        fallo(`siguiente inválido en ${p.id}`);
      }
    }
  }

  if (!Array.isArray(s.reglas) || !s.reglas.every((r) => typeof r === 'string')) fallo('reglas inválidas');
}

export function deserializar(str) {
  if (typeof str !== 'string' || !str.trim()) throw new Error('El link está vacío o no es válido.');
  let obj;
  try {
    obj = JSON.parse(deBase64Url(str.trim()));
  } catch {
    throw new Error('El link no se pudo leer: no contiene un torneo válido.');
  }
  validarEstado(obj);
  return obj;
}
