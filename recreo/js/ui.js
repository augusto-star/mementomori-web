// Render de vistas y manejo de eventos de Recreo.
// Sin framework: plantillas con un tag `html` que escapa todo lo interpolado,
// delegación de eventos en `document` y una hoja inferior (sheet) para formularios.

let ctx = null;            // { T, dispatch, reemplazar, limpiar, getState }
let sheetActual = null;    // { tipo: 'resultado' | 'equipo', ... } o null
let formFoto;              // foto pendiente del formulario de equipo: undefined = sin cambios, null = quitar, string = dataURL
let editandoReglas = false;
let ultimoFoco = null;     // elemento que abrió la sheet, para devolverle el foco
let importando = false;    // evita render doble mientras se importa desde #/s/

const $ = (sel, raiz = document) => raiz.querySelector(sel);

/* ---------- Mini motor de plantillas ---------- */

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));

function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pintar(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(pintar).join('');
  return esc(v);
}

/** Tag de plantilla: `html\`<b>${texto}</b>\``. Todo lo interpolado se escapa salvo Raw. */
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += pintar(vals[i]); });
  return new Raw(out);
}

/* ---------- Helpers de presentación ---------- */

const ESTADOS = { inscripcion: 'Inscripción', en_juego: 'En juego', finalizado: 'Finalizado' };
const FORMATOS = { liga: 'Liga todos contra todos', eliminacion: 'Eliminación directa' };

function iniciales(nombre) {
  return String(nombre || '?').trim().split(/\s+/).filter((p) => p && !/^(los|las|el|la|de|del|the)$/i.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

/** Foto de un equipo (img) o placeholder con iniciales. */
function foto(equipo, clase = 'foto') {
  if (equipo && equipo.foto) {
    return html`<img class="${clase}" src="${equipo.foto}" alt="Foto de ${equipo.nombre}" loading="lazy">`;
  }
  return html`<div class="${clase} foto-placeholder" role="img" aria-label="${equipo ? equipo.nombre : 'A definir'}">${equipo ? iniciales(equipo.nombre) : '?'}</div>`;
}

function equipo(state, id) {
  if (!id) return null;
  try { return ctx.T.equipoPorId(state, id) || null; } catch (e) { return null; }
}

function nombreEquipo(state, id) {
  const e = equipo(state, id);
  return e ? e.nombre : 'A definir';
}

function formatearFecha(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const t = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function integrantesDe(e) {
  return (e && Array.isArray(e.integrantes) ? e.integrantes : []).map((s) => String(s || '').trim()).filter(Boolean);
}

/** Llama a una función de tournament.js atrapando errores (devuelve fallback si falla). */
function seguro(fn, fallback) {
  try { return fn(); } catch (err) { console.error(err); toast(err.message || 'Algo salió mal.', 'error'); return fallback; }
}

function totalRondas(state) {
  return state.partidos.reduce((m, p) => Math.max(m, p.ronda), 0);
}

function nombreRondaDe(state, partido) {
  return seguro(() => ctx.T.nombreRonda(state.torneo.formato, partido.ronda, totalRondas(state)), `Ronda ${partido.ronda}`);
}

/* ---------- Routing ---------- */

const RUTAS = { '/': 'inicio', '/equipos': 'equipos', '/fixture': 'fixture', '/tabla': 'tabla', '/reglas': 'reglas', '/ajustes': 'ajustes' };

function rutaActual() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  if (h.startsWith('/s/')) return { nombre: 's', payload: h.slice(3) };
  return { nombre: RUTAS[h] || null, ruta: h };
}

const TAB_POR_VISTA = { inicio: 'inicio', equipos: 'equipos', fixture: 'fixture', tabla: 'tabla', reglas: 'mas', ajustes: 'mas' };

function marcarTab(vista, state) {
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === TAB_POR_VISTA[vista]) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  const label = $('[data-tab-label="tabla"]');
  if (label) label.textContent = state.torneo.formato === 'eliminacion' ? 'Llave' : 'Tabla';
}

/* ---------- Render principal ---------- */

export function render(state) {
  const r = rutaActual();
  if (r.nombre === 's') { importarDesdeURL(r.payload); return; }
  if (!r.nombre) { location.replace('#/'); return; }
  if (importando) return;

  marcarTab(r.nombre, state);
  const vistas = { inicio: vistaInicio, equipos: vistaEquipos, fixture: vistaFixture, tabla: vistaTabla, reglas: vistaReglas, ajustes: vistaAjustes };
  const main = $('#main');
  main.innerHTML = String(vistas[r.nombre](state));
  main.dataset.vista = r.nombre;
  document.title = r.nombre === 'inicio' ? 'Recreo · Beer Pong' : `${tituloVista(r.nombre, state)} · Recreo`;

  // Si hay una sheet abierta, la actualizo con el estado nuevo (p. ej. steppers)
  if (sheetActual) renderSheet(state);
}

function tituloVista(vista, state) {
  return { equipos: 'Equipos', fixture: 'Fixture', tabla: state.torneo.formato === 'eliminacion' ? 'Llave' : 'Tabla', reglas: 'Reglas', ajustes: 'Ajustes' }[vista] || 'Recreo';
}

/* ---------- Vista: Inicio ---------- */

function vistaInicio(state) {
  const { torneo, equipos, partidos } = state;
  const jugados = partidos.filter((p) => p.jugado && !p.bye).length;
  const total = partidos.filter((p) => !p.bye).length;

  return html`
    <section aria-labelledby="titulo-inicio">
      <div class="hero-torneo">
        <span class="sobretitulo">Torneo de beer pong</span>
        <h1 id="titulo-inicio" class="vista-cabecera" style="margin:0">${torneo.nombre || 'Recreo Beer Pong'}</h1>
        <p class="hero-fecha">${formatearFecha(torneo.fecha)}</p>
        <div class="fila-estado">
          <span class="badge ${torneo.estado}">${ESTADOS[torneo.estado] || torneo.estado}</span>
          <span class="dato"><strong>${equipos.length}</strong> ${equipos.length === 1 ? 'equipo' : 'equipos'}</span>
          <span class="dato">${FORMATOS[torneo.formato] || torneo.formato} · <strong>${torneo.vasosPorLado}</strong> vasos</span>
          ${total > 0 ? html`<span class="dato"><strong>${jugados}</strong>/${total} partidos</span>` : ''}
        </div>
      </div>
      ${torneo.estado === 'finalizado' ? bloqueCampeon(state) : ''}
      ${torneo.estado === 'en_juego' ? bloqueProximo(state) : ''}
      ${bloqueCTA(state)}
    </section>`;
}

function bloqueCampeon(state) {
  const c = seguro(() => ctx.T.campeon(state), null);
  if (!c) return '';
  const integ = integrantesDe(c);
  return html`
    <div class="campeon vs-card">
      ${foto(c)}
      <div class="campeon-label">Campeón</div>
      <div class="campeon-nombre">${c.nombre}</div>
      ${integ.length ? html`<div class="campeon-integrantes">${integ.join(' · ')}</div>` : ''}
    </div>`;
}

function bloqueProximo(state) {
  const p = seguro(() => ctx.T.proximoPartido(state), null);
  if (!p) {
    return html`<div class="card vs-card vacio"><p>No queda ningún partido con los dos equipos definidos.</p><a class="btn btn-secundario" href="#/fixture">Ver fixture</a></div>`;
  }
  const local = equipo(state, p.localId);
  const visitante = equipo(state, p.visitanteId);
  return html`
    <div class="card vs-card">
      <div class="card-titulo">Próximo partido</div>
      <div class="vs-ronda">${nombreRondaDe(state, p)}</div>
      <div class="vs-grid">
        <div class="vs-equipo">${foto(local)}<div class="vs-nombre">${local ? local.nombre : 'A definir'}</div></div>
        <div class="vs-sigla" aria-label="contra">VS</div>
        <div class="vs-equipo">${foto(visitante)}<div class="vs-nombre">${visitante ? visitante.nombre : 'A definir'}</div></div>
      </div>
      <div class="acciones">
        <button type="button" class="btn btn-primario btn-grande" data-action="abrir-resultado" data-partido="${p.id}">Cargar resultado</button>
      </div>
    </div>`;
}

function bloqueCTA(state) {
  const { torneo, equipos } = state;
  const etiquetaTabla = torneo.formato === 'eliminacion' ? 'Ver llave' : 'Ver tabla';
  if (torneo.estado === 'inscripcion') {
    if (equipos.length < 2) {
      return html`
        <div class="acciones">
          <a class="btn btn-primario btn-grande" href="#/equipos">Agregá equipos</a>
          <p class="pista" style="text-align:center">Necesitás al menos dos equipos para armar el fixture.</p>
        </div>`;
    }
    return html`
      <div class="acciones">
        <button type="button" class="btn btn-primario btn-grande" data-action="generar-fixture">Generar fixture</button>
        <div class="acciones-fila">
          <a class="btn btn-secundario" href="#/equipos">Agregar equipos</a>
          <a class="btn btn-secundario" href="#/ajustes">Cambiar formato</a>
        </div>
      </div>`;
  }
  if (torneo.estado === 'en_juego') {
    return html`
      <div class="acciones acciones-fila">
        <a class="btn btn-secundario" href="#/fixture">Ver fixture</a>
        <a class="btn btn-secundario" href="#/tabla">${etiquetaTabla}</a>
      </div>`;
  }
  return html`
    <div class="acciones">
      <button type="button" class="btn btn-oro btn-grande" data-action="nuevo-torneo">Nuevo torneo</button>
      <div class="acciones-fila">
        <a class="btn btn-secundario" href="#/fixture">Ver resultados</a>
        <a class="btn btn-secundario" href="#/tabla">${etiquetaTabla}</a>
      </div>
    </div>`;
}

/* ---------- Vista: Equipos ---------- */

function vistaEquipos(state) {
  const { equipos, torneo } = state;
  const inscripcion = torneo.estado === 'inscripcion';
  return html`
    <section aria-labelledby="titulo-equipos">
      <div class="vista-cabecera">
        <span class="sobretitulo">${equipos.length} ${equipos.length === 1 ? 'inscripto' : 'inscriptos'}</span>
        <h1 id="titulo-equipos">Equipos</h1>
        <p class="subtitulo">${inscripcion ? 'Anotá a los que juegan. Después generás el fixture desde Inicio.' : 'El torneo ya empezó: podés editar nombres y fotos, pero no agregar ni sacar equipos.'}</p>
      </div>
      ${inscripcion ? html`<div class="acciones" style="margin:0 0 16px"><button type="button" class="btn btn-primario btn-grande" data-action="nuevo-equipo">Agregá un equipo</button></div>` : ''}
      ${equipos.length === 0
        ? html`<div class="vacio"><span class="emoji" aria-hidden="true">🍺</span><p>Todavía no hay equipos anotados.</p></div>`
        : html`<div class="grilla-equipos">${equipos.map((e) => cardEquipo(e, inscripcion))}</div>`}
    </section>`;
}

function cardEquipo(e, inscripcion) {
  const integ = integrantesDe(e);
  return html`
    <article class="card equipo-card" aria-label="${e.nombre}">
      ${foto(e)}
      <h2 class="equipo-nombre">${e.nombre}</h2>
      <div class="chips">
        ${integ.length ? integ.map((i) => html`<span class="chip">${i}</span>`) : html`<span class="chip chip-vacio">Sin integrantes</span>`}
      </div>
      <div class="equipo-acciones">
        <button type="button" class="btn btn-secundario btn-chico" data-action="editar-equipo" data-id="${e.id}" aria-label="Editar ${e.nombre}">Editar</button>
        ${inscripcion ? html`<button type="button" class="btn btn-peligro btn-chico" data-action="eliminar-equipo" data-id="${e.id}" aria-label="Eliminar ${e.nombre}">Borrar</button>` : ''}
      </div>
    </article>`;
}

/* ---------- Vista: Fixture ---------- */

function vistaFixture(state) {
  const { torneo, partidos, equipos } = state;
  if (!partidos.length) {
    return html`
      <section aria-labelledby="titulo-fixture">
        <div class="vista-cabecera"><h1 id="titulo-fixture">Fixture</h1></div>
        <div class="vacio">
          <span class="emoji" aria-hidden="true">🏓</span>
          <p>Todavía no hay fixture.</p>
          ${equipos.length >= 2
            ? html`<button type="button" class="btn btn-primario" data-action="generar-fixture">Generar fixture</button>`
            : html`<a class="btn btn-primario" href="#/equipos">Agregá equipos primero</a>`}
        </div>
      </section>`;
  }
  const rondas = seguro(() => ctx.T.partidosPorRonda(state), []);
  return html`
    <section aria-labelledby="titulo-fixture">
      <div class="vista-cabecera">
        <span class="sobretitulo">${FORMATOS[torneo.formato]} · ${torneo.vasosPorLado} vasos por lado</span>
        <h1 id="titulo-fixture">Fixture</h1>
        <p class="subtitulo">${torneo.estado === 'finalizado' ? 'Torneo terminado. Tocá "Deshacer" si hay que corregir algo.' : 'Tocá un partido pendiente para cargar el resultado.'}</p>
      </div>
      ${rondas.map((r) => bloqueRonda(state, r))}
    </section>`;
}

function bloqueRonda(state, r) {
  const reales = r.partidos.filter((p) => !p.bye);
  const jugados = reales.filter((p) => p.jugado).length;
  return html`
    <div class="ronda">
      <h2 class="ronda-titulo"><span>${r.nombre}</span><small>${jugados}/${reales.length} jugados</small></h2>
      <div class="lista-partidos">${r.partidos.map((p) => filaPartido(state, p))}</div>
    </div>`;
}

function ladoPartido(state, id, partido, lado) {
  const e = equipo(state, id);
  const clases = ['partido-equipo', lado];
  if (!e) clases.push('indefinido');
  else if (partido.jugado && partido.ganadorId === e.id) clases.push('ganador');
  else if (partido.jugado && partido.ganadorId) clases.push('perdedor');
  return html`
    <div class="${clases.join(' ')}">
      ${foto(e, 'avatar')}
      <span>${e ? e.nombre : 'A definir'}${e && partido.jugado && partido.ganadorId === e.id ? html` <span class="ganador-marca" aria-label="ganador">★</span>` : ''}</span>
    </div>`;
}

function filaPartido(state, p) {
  const ambos = p.localId && p.visitanteId;
  const pendiente = !p.jugado && ambos;

  if (p.bye) {
    const quien = equipo(state, p.localId) || equipo(state, p.visitanteId);
    return html`
      <div class="partido bye" aria-label="${quien ? quien.nombre : 'Equipo'} pasa directo">
        ${ladoPartido(state, quien ? quien.id : null, p, 'local')}
        <div class="marcador pendiente">Pasa directo</div>
        <div class="partido-equipo visitante indefinido"><span>—</span></div>
      </div>`;
  }

  if (pendiente) {
    return html`
      <button type="button" class="partido tocable" data-action="abrir-resultado" data-partido="${p.id}"
        aria-label="Cargar resultado: ${nombreEquipo(state, p.localId)} contra ${nombreEquipo(state, p.visitanteId)}">
        ${ladoPartido(state, p.localId, p, 'local')}
        <div class="marcador vs">VS</div>
        ${ladoPartido(state, p.visitanteId, p, 'visitante')}
      </button>`;
  }

  if (!p.jugado) {
    return html`
      <div class="partido">
        ${ladoPartido(state, p.localId, p, 'local')}
        <div class="marcador pendiente">A definir</div>
        ${ladoPartido(state, p.visitanteId, p, 'visitante')}
      </div>`;
  }

  return html`
    <div class="partido jugado">
      ${ladoPartido(state, p.localId, p, 'local')}
      <div class="marcador" aria-label="${p.vasosLocal} a ${p.vasosVisitante}">${p.vasosLocal} – ${p.vasosVisitante}</div>
      ${ladoPartido(state, p.visitanteId, p, 'visitante')}
      <div class="partido-pie">
        <button type="button" class="btn btn-fantasma" data-action="deshacer" data-partido="${p.id}">Deshacer</button>
      </div>
    </div>`;
}

/* ---------- Vista: Tabla / Llave ---------- */

function vistaTabla(state) {
  const esLlave = state.torneo.formato === 'eliminacion';
  const titulo = esLlave ? 'Llave' : 'Tabla de posiciones';
  if (!state.partidos.length) {
    return html`
      <section aria-labelledby="titulo-tabla">
        <div class="vista-cabecera"><h1 id="titulo-tabla">${titulo}</h1></div>
        <div class="vacio">
          <span class="emoji" aria-hidden="true">${esLlave ? '🏆' : '📋'}</span>
          <p>${esLlave ? 'La llave aparece cuando generás el fixture.' : 'La tabla aparece cuando generás el fixture.'}</p>
          <a class="btn btn-secundario" href="#/">Ir a Inicio</a>
        </div>
      </section>`;
  }
  return html`
    <section aria-labelledby="titulo-tabla">
      <div class="vista-cabecera">
        <span class="sobretitulo">${FORMATOS[state.torneo.formato]}</span>
        <h1 id="titulo-tabla">${titulo}</h1>
      </div>
      ${esLlave ? bloqueLlave(state) : bloqueTabla(state)}
    </section>`;
}

function bloqueTabla(state) {
  const filas = seguro(() => ctx.T.tablaPosiciones(state), []);
  return html`
    <div class="tabla-scroll">
      <table class="tabla">
        <thead>
          <tr>
            <th scope="col" aria-label="Posición">#</th>
            <th scope="col" class="equipo">Equipo</th>
            <th scope="col" title="Partidos jugados">PJ</th>
            <th scope="col" title="Partidos ganados">PG</th>
            <th scope="col" title="Partidos perdidos">PP</th>
            <th scope="col" title="Vasos a favor">VF</th>
            <th scope="col" title="Vasos en contra">VC</th>
            <th scope="col" title="Diferencia">DIF</th>
            <th scope="col" title="Puntos">PTS</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map((f, i) => {
            const e = equipo(state, f.equipoId);
            return html`
              <tr class="${i === 0 && f.pj > 0 ? 'lider' : ''}">
                <td class="pos ${i === 0 ? 'pos-1' : ''}">${i + 1}</td>
                <td class="equipo"><div>${foto(e, 'avatar avatar-chico')}<span>${e ? e.nombre : f.equipoId}</span></div></td>
                <td>${f.pj}</td><td>${f.pg}</td><td>${f.pp}</td><td>${f.vf}</td><td>${f.vc}</td>
                <td>${f.dif > 0 ? `+${f.dif}` : f.dif}</td>
                <td class="pts">${f.pts}</td>
              </tr>`;
          })}
        </tbody>
      </table>
    </div>
    <p class="pista" style="margin-top:10px">PJ jugados · PG ganados · PP perdidos · VF vasos a favor · VC en contra · DIF diferencia · PTS puntos (3 por victoria).</p>`;
}

function bloqueLlave(state) {
  const rondas = seguro(() => ctx.T.partidosPorRonda(state), []);
  const c = state.torneo.estado === 'finalizado' ? seguro(() => ctx.T.campeon(state), null) : null;
  return html`
    <div class="llave-scroll" role="region" aria-label="Llave del torneo" tabindex="0">
      <div class="llave">
        ${rondas.map((r, i) => html`
          <div class="llave-col">
            <div class="llave-col-titulo ${i === rondas.length - 1 ? 'final' : ''}">${r.nombre}</div>
            <div class="llave-partidos">${r.partidos.map((p) => cajaLlave(state, p))}</div>
          </div>`)}
        <div class="llave-col">
          <div class="llave-col-titulo final">Campeón</div>
          <div class="llave-partidos">
            <div class="llave-campeon">
              ${c ? html`${foto(c)}<strong>CAMPEÓN</strong><span>${c.nombre}</span>` : html`<div class="foto foto-placeholder" style="width:96px;aspect-ratio:1/1;border-radius:50%">🏆</div><span class="pista">A definir</span>`}
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="pista">Deslizá para ver todas las rondas.</p>`;
}

function ladoLlave(state, id, p) {
  const e = equipo(state, id);
  const clases = ['llave-equipo'];
  if (!e) clases.push('indefinido');
  else if (p.jugado && p.ganadorId === e.id) clases.push('ganador');
  else if (p.jugado && p.ganadorId) clases.push('perdedor');
  const vasos = id === p.localId ? p.vasosLocal : p.vasosVisitante;
  return html`
    <div class="${clases.join(' ')}">
      ${foto(e, 'avatar avatar-chico')}
      <span>${e ? e.nombre : 'A definir'}</span>
      ${p.jugado && !p.bye && e ? html`<b class="llave-vasos">${vasos ?? ''}</b>` : ''}
    </div>`;
}

function cajaLlave(state, p) {
  const tocable = !p.jugado && p.localId && p.visitanteId;
  const clases = ['llave-partido', p.jugado ? 'jugado' : '', p.bye ? 'bye' : '', tocable ? 'tocable' : ''].filter(Boolean).join(' ');
  const contenido = html`
    ${ladoLlave(state, p.localId, p)}
    ${p.bye ? html`<div class="llave-nota">Pasa directo</div>` : ladoLlave(state, p.visitanteId, p)}`;
  if (tocable) {
    return html`<button type="button" class="${clases}" style="width:100%;text-align:left" data-action="abrir-resultado" data-partido="${p.id}" aria-label="Cargar resultado: ${nombreEquipo(state, p.localId)} contra ${nombreEquipo(state, p.visitanteId)}">${contenido}</button>`;
  }
  return html`<div class="${clases}">${contenido}</div>`;
}

/* ---------- Vista: Reglas ---------- */

function vistaReglas(state) {
  const reglas = Array.isArray(state.reglas) ? state.reglas : [];
  return html`
    <section aria-labelledby="titulo-reglas">
      <div class="vista-cabecera">
        <span class="sobretitulo">De la casa</span>
        <h1 id="titulo-reglas">Reglas</h1>
        <p class="subtitulo">Lo que se discute antes, no se discute después.</p>
      </div>
      ${editandoReglas
        ? html`
          <form data-form="reglas">
            <div class="campo">
              <label for="reglas-texto">Una regla por línea</label>
              <textarea id="reglas-texto" name="reglas" rows="10">${reglas.join('\n')}</textarea>
            </div>
            <div class="acciones-fila">
              <button type="submit" class="btn btn-primario">Guardar reglas</button>
              <button type="button" class="btn btn-secundario" data-action="cancelar-reglas">Cancelar</button>
            </div>
          </form>`
        : html`
          ${reglas.length ? html`<ol class="reglas">${reglas.map((r) => html`<li>${r}</li>`)}</ol>` : html`<div class="vacio"><p>No hay reglas cargadas. ¿Vale todo?</p></div>`}
          <div class="acciones"><button type="button" class="btn btn-secundario" data-action="editar-reglas">Editar reglas</button></div>`}
    </section>`;
}

/* ---------- Vista: Ajustes ---------- */

function vistaAjustes(state) {
  const { torneo } = state;
  const bloqueado = torneo.estado !== 'inscripcion';
  return html`
    <section aria-labelledby="titulo-ajustes">
      <div class="vista-cabecera">
        <span class="sobretitulo">Más</span>
        <h1 id="titulo-ajustes">Ajustes</h1>
      </div>

      <div class="lista-enlaces" style="margin-bottom:20px">
        <a class="enlace-fila" href="#/reglas"><span>Reglas de la casa</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7-1.5-1.5L13 12 7.5 6.5z"/></svg></a>
      </div>

      <form data-form="ajustes" class="card">
        <div class="card-titulo">Torneo</div>
        ${bloqueado ? html`<p class="ayuda" style="margin-bottom:12px">El torneo ya está ${torneo.estado === 'finalizado' ? 'terminado' : 'en juego'}. Para cambiar el formato o los vasos, reiniciá el torneo (se conservan los equipos).</p>` : ''}
        <fieldset ${bloqueado ? 'disabled' : ''}>
          <div class="campo">
            <label for="aj-nombre">Nombre del torneo</label>
            <input id="aj-nombre" name="nombre" type="text" maxlength="60" value="${torneo.nombre || ''}" required>
          </div>
          <div class="campo">
            <label for="aj-fecha">Fecha</label>
            <input id="aj-fecha" name="fecha" type="date" value="${torneo.fecha || ''}">
          </div>
          <fieldset class="campo">
            <legend>Formato</legend>
            <div class="radios">
              <label class="radio"><input type="radio" name="formato" value="liga" ${torneo.formato === 'liga' ? 'checked' : ''}><span>Liga todos contra todos<small>Todos juegan contra todos. 3 puntos por victoria.</small></span></label>
              <label class="radio"><input type="radio" name="formato" value="eliminacion" ${torneo.formato === 'eliminacion' ? 'checked' : ''}><span>Eliminación directa<small>Perdés, te vas. Llave con byes si son impares.</small></span></label>
            </div>
          </fieldset>
          <fieldset class="campo">
            <legend>Vasos por lado</legend>
            <div class="radios radios-inline">
              <label class="radio"><input type="radio" name="vasosPorLado" value="6" ${Number(torneo.vasosPorLado) === 6 ? 'checked' : ''}><span>6 vasos</span></label>
              <label class="radio"><input type="radio" name="vasosPorLado" value="10" ${Number(torneo.vasosPorLado) === 10 ? 'checked' : ''}><span>10 vasos</span></label>
            </div>
          </fieldset>
          <button type="submit" class="btn btn-oro btn-bloque">Guardar cambios</button>
        </fieldset>
      </form>

      <div class="card">
        <div class="card-titulo">Compartir</div>
        <p class="ayuda" style="margin-bottom:12px">Mandá el link por WhatsApp: el que lo abra ve el torneo tal cual está ahora (sin las fotos sacadas con el celu).</p>
        <button type="button" class="btn btn-primario btn-bloque" data-action="compartir">Compartir link</button>
        <div id="link-box" class="campo json-box" hidden>
          <label for="link-texto">Link del torneo</label>
          <textarea id="link-texto" readonly rows="3"></textarea>
        </div>
      </div>

      <div class="card">
        <div class="card-titulo">Copia de seguridad</div>
        <div class="acciones-fila">
          <button type="button" class="btn btn-secundario" data-action="exportar">Exportar JSON</button>
          <button type="button" class="btn btn-secundario" data-action="importar-toggle" aria-expanded="false" aria-controls="importar-box">Importar JSON</button>
        </div>
        <div id="exportar-box" class="campo json-box" hidden>
          <label for="exportar-texto">Copiá este texto y guardalo donde quieras</label>
          <textarea id="exportar-texto" readonly rows="6"></textarea>
          <div class="acciones-fila">
            <button type="button" class="btn btn-secundario btn-chico" data-action="copiar-json">Copiar</button>
            <a id="exportar-descarga" class="btn btn-secundario btn-chico" download="recreo.json" href="#">Descargar archivo</a>
          </div>
        </div>
        <form id="importar-box" class="json-box" data-form="importar" hidden>
          <div class="campo">
            <label for="importar-texto">Pegá acá el JSON exportado</label>
            <textarea id="importar-texto" name="json" rows="6" placeholder='{"version":1, ...}'></textarea>
          </div>
          <button type="submit" class="btn btn-oro btn-bloque">Importar y reemplazar</button>
        </form>
      </div>

      <div class="card zona-peligro">
        <div class="card-titulo">Zona peligrosa</div>
        <div class="acciones-fila">
          <button type="button" class="btn btn-peligro" data-action="reiniciar">Reiniciar torneo</button>
          <button type="button" class="btn btn-peligro" data-action="borrar-todo">Borrar todo</button>
        </div>
        <p class="ayuda" style="margin-top:10px">Reiniciar borra los partidos y vuelve a inscripción conservando equipos y reglas. Borrar todo deja la app como recién instalada.</p>
      </div>
    </section>`;
}

/* ---------- Sheet (hoja inferior) ---------- */

function abrirSheet(tipo, datos) {
  ultimoFoco = document.activeElement;
  sheetActual = { tipo, ...datos };
  formFoto = undefined;
  renderSheet(ctx.getState());
  $('#sheet-backdrop').hidden = false;
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-abierta');
  const foco = $('#sheet input:not([type="file"]), #sheet .btn-cerrar');
  if (foco) foco.focus({ preventScroll: true });
}

function cerrarSheet() {
  if (!sheetActual) return;
  sheetActual = null;
  formFoto = undefined;
  const el = $('#sheet');
  el.hidden = true;
  el.innerHTML = '';
  delete el.dataset.tipo;
  delete el.dataset.id;
  $('#sheet-backdrop').hidden = true;
  document.body.classList.remove('sheet-abierta');
  if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus({ preventScroll: true });
  ultimoFoco = null;
}

function renderSheet(state) {
  const el = $('#sheet');
  if (!sheetActual) return;
  if (sheetActual.tipo === 'resultado') {
    const p = state.partidos.find((x) => x.id === sheetActual.partidoId);
    if (!p || p.jugado) { cerrarSheet(); return; }
    el.innerHTML = String(sheetResultado(state, p));
  } else if (sheetActual.tipo === 'equipo') {
    // El form de equipo no se vuelve a renderizar si ya está abierto (no perder lo tipeado)
    if (el.dataset.tipo === 'equipo' && el.dataset.id === String(sheetActual.id || '')) return;
    el.innerHTML = String(sheetEquipo(state, sheetActual.id ? equipo(state, sheetActual.id) : null));
  }
  el.dataset.tipo = sheetActual.tipo;
  el.dataset.id = sheetActual.id || '';
}

const iconoCerrar = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4l5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>');

function cabeceraSheet(titulo) {
  return html`
    <div class="sheet-cabecera">
      <h2 id="sheet-titulo">${titulo}</h2>
      <button type="button" class="btn-cerrar" data-action="cerrar-sheet" aria-label="Cerrar">${iconoCerrar}</button>
    </div>`;
}

function stepper(lado, valor, max, nombre) {
  return html`
    <div class="stepper" role="group" aria-label="Vasos de ${nombre}">
      <button type="button" data-action="stepper" data-lado="${lado}" data-delta="-1" aria-label="Un vaso menos para ${nombre}" ${valor <= 0 ? 'disabled' : ''}>−</button>
      <output class="${valor >= max ? 'lleno' : ''}" aria-live="polite" aria-label="Vasos de ${nombre}">${valor}</output>
      <button type="button" data-action="stepper" data-lado="${lado}" data-delta="1" aria-label="Un vaso más para ${nombre}" ${valor >= max ? 'disabled' : ''}>+</button>
    </div>`;
}

function sheetResultado(state, p) {
  const max = Number(state.torneo.vasosPorLado) || 10;
  const local = equipo(state, p.localId);
  const visitante = equipo(state, p.visitanteId);
  const vl = sheetActual.vasosLocal;
  const vv = sheetActual.vasosVisitante;
  return html`
    ${cabeceraSheet('Cargá el resultado')}
    <p class="vs-ronda">${nombreRondaDe(state, p)} · a ${max} vasos</p>
    <form data-form="resultado">
      <div class="resultado-grid">
        <div class="resultado-lado">
          ${foto(local)}
          <div class="resultado-nombre">${local ? local.nombre : 'A definir'}</div>
          ${stepper('local', vl, max, local ? local.nombre : 'local')}
          <div class="rapido"><button type="button" class="btn btn-secundario btn-chico" data-action="gano" data-lado="local">Ganó ${local ? local.nombre : 'local'}</button></div>
        </div>
        <div class="vs-sigla resultado-vs" aria-hidden="true">VS</div>
        <div class="resultado-lado">
          ${foto(visitante)}
          <div class="resultado-nombre">${visitante ? visitante.nombre : 'A definir'}</div>
          ${stepper('visitante', vv, max, visitante ? visitante.nombre : 'visitante')}
          <div class="rapido"><button type="button" class="btn btn-secundario btn-chico" data-action="gano" data-lado="visitante">Ganó ${visitante ? visitante.nombre : 'visitante'}</button></div>
        </div>
      </div>
      <p class="pista resultado-ayuda">Anotá los vasos que embocó cada equipo. Gana el que llega a ${max}.</p>
      <div class="sheet-pie">
        <button type="submit" class="btn btn-primario btn-grande" ${vl === vv ? 'disabled' : ''}>Guardar resultado</button>
        <button type="button" class="btn btn-fantasma" data-action="cerrar-sheet">Cancelar</button>
      </div>
    </form>`;
}

function sheetEquipo(state, e) {
  const integ = e ? (Array.isArray(e.integrantes) ? e.integrantes : []) : [];
  return html`
    ${cabeceraSheet(e ? 'Editá el equipo' : 'Agregá un equipo')}
    <form data-form="equipo" data-id="${e ? e.id : ''}">
      <div class="campo">
        <label for="eq-nombre">Nombre del equipo</label>
        <input id="eq-nombre" name="nombre" type="text" required maxlength="40" autocomplete="off" placeholder="Los del Quincho" value="${e ? e.nombre : ''}">
      </div>
      <fieldset class="campo">
        <legend>Integrantes (hasta 3)</legend>
        ${[0, 1, 2].map((i) => html`<input type="text" name="integrante" maxlength="30" autocomplete="off" aria-label="Integrante ${i + 1}" placeholder="Integrante ${i + 1}" value="${integ[i] || ''}">`)}
      </fieldset>
      <div class="campo">
        <span class="campo-label" style="font-size:.85rem;color:var(--crema-2)">Foto</span>
        <div class="foto-input">
          <div id="foto-preview">${foto(e, 'foto foto-cuadrada')}</div>
          <div class="foto-botones">
            <label class="btn btn-secundario btn-chico" for="eq-foto-camara">📷 Sacar foto</label>
            <input type="file" id="eq-foto-camara" accept="image/*" capture="environment" data-foto>
            <label class="btn btn-secundario btn-chico" for="eq-foto-galeria">🖼️ Elegir de la galería</label>
            <input type="file" id="eq-foto-galeria" accept="image/*" data-foto>
            <button type="button" class="btn btn-fantasma btn-chico" data-action="quitar-foto" id="btn-quitar-foto" ${e && e.foto ? '' : 'hidden'}>Quitar foto</button>
          </div>
        </div>
        <p class="ayuda" id="foto-estado"></p>
      </div>
      <div class="sheet-pie">
        <button type="submit" class="btn btn-primario btn-grande">${e ? 'Guardar cambios' : 'Agregar equipo'}</button>
        <button type="button" class="btn btn-fantasma" data-action="cerrar-sheet">Cancelar</button>
      </div>
    </form>`;
}

/* ---------- Fotos: reducir a 800px con canvas ---------- */

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto.')); };
    img.src = url;
  });
}

async function reducirFoto(file) {
  const img = await cargarImagen(file);
  const MAX = 800;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('La foto está vacía o rota.');
  const escala = Math.min(1, MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const c2d = canvas.getContext('2d');
  c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function alElegirFoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const estado = $('#foto-estado');
  if (estado) estado.textContent = 'Procesando la foto…';
  try {
    formFoto = await reducirFoto(file);
    const preview = $('#foto-preview');
    if (preview) preview.innerHTML = `<img class="foto foto-cuadrada" src="${formFoto}" alt="Vista previa de la foto">`;
    const quitar = $('#btn-quitar-foto');
    if (quitar) quitar.hidden = false;
    if (estado) estado.textContent = 'Foto lista.';
  } catch (err) {
    toast(err.message || 'No se pudo procesar la foto.', 'error');
    if (estado) estado.textContent = '';
  } finally {
    input.value = '';
  }
}

/* ---------- Acciones ---------- */

function abrirResultado(partidoId) {
  const state = ctx.getState();
  const p = state.partidos.find((x) => x.id === partidoId);
  if (!p) { toast('No encontré ese partido.', 'error'); return; }
  if (p.jugado) { toast('Ese partido ya está jugado. Podés deshacerlo desde el fixture.', 'error'); return; }
  if (!p.localId || !p.visitanteId) { toast('Todavía falta definir un equipo para ese partido.', 'error'); return; }
  abrirSheet('resultado', { partidoId, vasosLocal: 0, vasosVisitante: 0 });
}

function guardarResultado() {
  const { partidoId, vasosLocal, vasosVisitante } = sheetActual;
  const antes = ctx.getState().torneo.estado;
  const ok = ctx.dispatch((s) => ctx.T.registrarResultado(s, partidoId, vasosLocal, vasosVisitante));
  if (!ok) return;
  cerrarSheet();
  const despues = ctx.getState();
  if (antes !== 'finalizado' && despues.torneo.estado === 'finalizado') {
    const c = seguro(() => ctx.T.campeon(despues), null);
    toast(c ? `¡Tenemos campeón: ${c.nombre}! 🏆` : '¡Terminó el torneo!', 'ok');
    location.hash = '#/';
  } else {
    toast('Resultado cargado.', 'ok');
  }
}

function guardarEquipo(form) {
  const id = form.dataset.id;
  const nombre = form.elements.nombre.value.trim();
  if (!nombre) { toast('Poné un nombre para el equipo.', 'error'); form.elements.nombre.focus(); return; }
  const integrantes = Array.from(form.querySelectorAll('input[name="integrante"]')).map((i) => i.value.trim()).filter(Boolean).slice(0, 3);
  let ok;
  if (id) {
    const cambios = { nombre, integrantes };
    if (formFoto !== undefined) cambios.foto = formFoto;
    ok = ctx.dispatch((s) => ctx.T.editarEquipo(s, id, cambios));
  } else {
    ok = ctx.dispatch((s) => ctx.T.agregarEquipo(s, { nombre, integrantes, foto: formFoto || null }));
  }
  if (ok) { cerrarSheet(); toast(id ? 'Equipo actualizado.' : `${nombre} está adentro.`, 'ok'); }
}

function guardarAjustes(form) {
  const f = form.elements;
  const cambios = {
    nombre: f.nombre.value.trim() || 'Recreo Beer Pong',
    fecha: f.fecha.value || ctx.getState().torneo.fecha,
    formato: (form.querySelector('input[name="formato"]:checked') || {}).value || 'liga',
    vasosPorLado: Number((form.querySelector('input[name="vasosPorLado"]:checked') || {}).value || 10),
  };
  if (ctx.dispatch((s) => ctx.T.configurarTorneo(s, cambios))) toast('Ajustes guardados.', 'ok');
}

function hayDatosLocales(state) {
  return state.partidos.length > 0 || state.equipos.length > 2;
}

function importarDesdeURL(payload) {
  if (importando) return;
  importando = true;
  try {
    const nuevo = ctx.T.deserializar(payload);
    const local = ctx.getState();
    if (hayDatosLocales(local) && !window.confirm('Ya tenés un torneo cargado en este celu. ¿Lo reemplazamos por el que te compartieron?')) {
      importando = false;
      location.replace('#/');
      return;
    }
    importando = false;
    location.replace('#/');
    ctx.reemplazar(nuevo);
    toast('Torneo importado desde el link.', 'ok');
  } catch (err) {
    console.error(err);
    importando = false;
    toast(`No se pudo abrir el link: ${err.message || 'link inválido'}`, 'error');
    location.replace('#/');
  }
}

async function compartir() {
  const state = ctx.getState();
  const payload = seguro(() => ctx.T.serializar(state), null);
  if (!payload) return;
  const url = `${location.origin}${location.pathname}#/s/${payload}`;
  const caja = $('#link-box');
  const texto = $('#link-texto');
  if (texto) texto.value = url;
  if (navigator.share) {
    try {
      await navigator.share({ title: state.torneo.nombre || 'Recreo Beer Pong', text: `Fixture y resultados de ${state.torneo.nombre || 'Recreo'}`, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // canceló el usuario
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiado. ¡Mandalo por WhatsApp!', 'ok');
  } catch (err) {
    if (caja) caja.hidden = false;
    if (texto) { texto.focus(); texto.select(); }
    toast('No pude copiar automáticamente: copiá el link de la caja.', 'error');
  }
}

async function exportar() {
  const { exportarJSON } = await import('./store.js');
  const state = ctx.getState();
  const json = exportarJSON(state);
  const caja = $('#exportar-box');
  const texto = $('#exportar-texto');
  const descarga = $('#exportar-descarga');
  if (texto) texto.value = json;
  if (descarga) {
    const fecha = (state.torneo.fecha || 'torneo').replace(/[^0-9a-z-]/gi, '');
    descarga.download = `recreo-${fecha}.json`;
    descarga.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  }
  if (caja) { caja.hidden = false; texto && texto.focus(); }
}

async function copiarJSON() {
  const texto = $('#exportar-texto');
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto.value);
    toast('JSON copiado.', 'ok');
  } catch (err) {
    texto.focus(); texto.select();
    toast('Seleccioná el texto y copialo a mano.', 'error');
  }
}

async function importar(form) {
  const { importarJSON } = await import('./store.js');
  try {
    const datos = importarJSON(form.elements.json.value);
    if (hayDatosLocales(ctx.getState()) && !window.confirm('Esto reemplaza el torneo actual por el del JSON. ¿Seguimos?')) return;
    ctx.reemplazar(datos);
    toast('Torneo importado.', 'ok');
    location.hash = '#/';
  } catch (err) {
    toast(err.message || 'No se pudo importar.', 'error');
  }
}

function reiniciar() {
  if (!window.confirm('Se borran todos los partidos y el torneo vuelve a inscripción. Los equipos y las reglas quedan. ¿Dale?')) return;
  if (ctx.dispatch((s) => ctx.T.reiniciarTorneo(s))) { toast('Torneo reiniciado.', 'ok'); location.hash = '#/'; }
}

function borrarTodo() {
  if (!window.confirm('Se borra TODO: equipos, partidos, fotos y ajustes. No hay vuelta atrás. ¿Seguro?')) return;
  ctx.limpiar();
  ctx.reemplazar(ctx.T.crearEstadoInicial());
  toast('Listo, arrancamos de cero.', 'ok');
  location.hash = '#/';
}

function generarFixture() {
  const state = ctx.getState();
  const n = state.equipos.length;
  const msj = `Se arma el fixture con ${n} equipos en formato ${FORMATOS[state.torneo.formato].toLowerCase()}. Después no se pueden agregar equipos. ¿Dale?`;
  if (!window.confirm(msj)) return;
  if (ctx.dispatch((s) => ctx.T.generarFixture(s))) { toast('¡Fixture listo! A jugar.', 'ok'); location.hash = '#/fixture'; }
}

/* ---------- Eventos (delegación) ---------- */

function alHacerClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el) {
    if (ev.target.id === 'sheet-backdrop') cerrarSheet();
    return;
  }
  const a = el.dataset.action;
  const state = ctx.getState();

  switch (a) {
    case 'generar-fixture': generarFixture(); break;
    case 'abrir-resultado': abrirResultado(el.dataset.partido); break;
    case 'deshacer':
      if (window.confirm('¿Deshacemos este resultado?')) {
        if (ctx.dispatch((s) => ctx.T.deshacerResultado(s, el.dataset.partido))) toast('Resultado deshecho.', 'ok');
      }
      break;
    case 'nuevo-equipo': abrirSheet('equipo', { id: null }); break;
    case 'editar-equipo': abrirSheet('equipo', { id: el.dataset.id }); break;
    case 'eliminar-equipo': {
      const e = equipo(state, el.dataset.id);
      if (window.confirm(`¿Sacamos a ${e ? e.nombre : 'este equipo'} del torneo?`)) {
        if (ctx.dispatch((s) => ctx.T.eliminarEquipo(s, el.dataset.id))) toast('Equipo eliminado.', 'ok');
      }
      break;
    }
    case 'cerrar-sheet': cerrarSheet(); break;
    case 'stepper': {
      if (!sheetActual || sheetActual.tipo !== 'resultado') break;
      const max = Number(state.torneo.vasosPorLado) || 10;
      const clave = el.dataset.lado === 'local' ? 'vasosLocal' : 'vasosVisitante';
      sheetActual[clave] = Math.max(0, Math.min(max, sheetActual[clave] + Number(el.dataset.delta)));
      renderSheet(state);
      // Mantengo el foco en el mismo botón después de re-renderizar
      const mismo = $(`#sheet [data-action="stepper"][data-lado="${el.dataset.lado}"][data-delta="${el.dataset.delta}"]`);
      if (mismo && !mismo.disabled) mismo.focus({ preventScroll: true });
      break;
    }
    case 'gano': {
      if (!sheetActual || sheetActual.tipo !== 'resultado') break;
      const max = Number(state.torneo.vasosPorLado) || 10;
      if (el.dataset.lado === 'local') {
        sheetActual.vasosLocal = max;
        if (sheetActual.vasosVisitante >= max) sheetActual.vasosVisitante = max - 1;
      } else {
        sheetActual.vasosVisitante = max;
        if (sheetActual.vasosLocal >= max) sheetActual.vasosLocal = max - 1;
      }
      renderSheet(state);
      break;
    }
    case 'quitar-foto': {
      formFoto = null;
      const preview = $('#foto-preview');
      if (preview) preview.innerHTML = String(foto({ nombre: ($('#eq-nombre') || {}).value || '?' }, 'foto foto-cuadrada'));
      el.hidden = true;
      break;
    }
    case 'editar-reglas': editandoReglas = true; render(state); ($('#reglas-texto') || {}).focus?.(); break;
    case 'cancelar-reglas': editandoReglas = false; render(state); break;
    case 'nuevo-torneo': reiniciar(); break;
    case 'compartir': compartir(); break;
    case 'exportar': exportar(); break;
    case 'copiar-json': copiarJSON(); break;
    case 'importar-toggle': {
      const caja = $('#importar-box');
      if (caja) { caja.hidden = !caja.hidden; el.setAttribute('aria-expanded', String(!caja.hidden)); if (!caja.hidden) $('#importar-texto').focus(); }
      break;
    }
    case 'reiniciar': reiniciar(); break;
    case 'borrar-todo': borrarTodo(); break;
    default: break;
  }
}

function alEnviar(ev) {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  switch (form.dataset.form) {
    case 'resultado': guardarResultado(); break;
    case 'equipo': guardarEquipo(form); break;
    case 'ajustes': guardarAjustes(form); break;
    case 'importar': importar(form); break;
    case 'reglas': {
      const reglas = form.elements.reglas.value.split('\n').map((l) => l.trim()).filter(Boolean);
      if (ctx.dispatch((s) => ctx.T.editarReglas(s, reglas))) { editandoReglas = false; render(ctx.getState()); toast('Reglas guardadas.', 'ok'); }
      break;
    }
    default: break;
  }
}

function alCambiar(ev) {
  if (ev.target.matches('input[type="file"][data-foto]')) alElegirFoto(ev.target);
}

function alTeclear(ev) {
  if (ev.key === 'Escape' && sheetActual) { ev.preventDefault(); cerrarSheet(); }
}

/* ---------- Toasts ---------- */

export function toast(mensaje, tipo = 'info') {
  const cont = $('#toasts');
  if (!cont) { console.log(`[toast:${tipo}]`, mensaje); return; }
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = mensaje;
  cont.appendChild(el);
  // Máximo 3 avisos visibles
  while (cont.children.length > 3) cont.firstChild.remove();
  setTimeout(() => {
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 350);
  }, tipo === 'error' ? 4500 : 3000);
}

/* ---------- Inicialización ---------- */

export function inicializarUI(contexto) {
  ctx = contexto;
  document.addEventListener('click', alHacerClick);
  document.addEventListener('submit', alEnviar);
  document.addEventListener('change', alCambiar);
  document.addEventListener('keydown', alTeclear);
  // Al cambiar de vista, cierro la sheet y salgo del modo edición de reglas
  window.addEventListener('hashchange', () => { cerrarSheet(); editandoReglas = false; });
}
