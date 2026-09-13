import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEstadoInicial,
  agregarEquipo,
  editarEquipo,
  eliminarEquipo,
  configurarTorneo,
  generarFixture,
  registrarResultado,
  deshacerResultado,
  reiniciarTorneo,
  editarReglas,
  tablaPosiciones,
  partidosPorRonda,
  nombreRonda,
  equipoPorId,
  campeon,
  proximoPartido,
  serializar,
  deserializar,
} from '../js/tournament.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estado en inscripción con exactamente `n` equipos (e1..en) y el formato pedido. */
function conEquipos(n, formato = 'liga') {
  let s = crearEstadoInicial();
  s = configurarTorneo(s, { formato });
  for (let i = 3; i <= n; i++) s = agregarEquipo(s, { nombre: `Equipo ${i}` });
  if (n < 2) s = eliminarEquipo(s, 'e2');
  if (n < 1) s = eliminarEquipo(s, 'e1');
  return s;
}

function fixtureDe(n, formato) {
  return generarFixture(conEquipos(n, formato));
}

function pares(partidos) {
  return partidos.map((p) => [p.localId, p.visitanteId].sort().join('-')).sort();
}

/** Juega todos los partidos pendientes con ambos equipos definidos; gana siempre el local. */
function jugarTodo(s, vasos = [10, 4]) {
  let p;
  let guard = 0;
  while ((p = proximoPartido(s)) && guard++ < 1000) {
    s = registrarResultado(s, p.id, vasos[0], vasos[1]);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

describe('crearEstadoInicial', () => {
  test('trae 2 equipos de ejemplo con fotos y 3 integrantes vacíos', () => {
    const s = crearEstadoInicial();
    assert.equal(s.version, 1);
    assert.equal(s.equipos.length, 2);
    assert.deepEqual(s.equipos[0], {
      id: 'e1',
      nombre: 'Los del Quincho',
      integrantes: ['', '', ''],
      foto: 'img/equipo-1.jpg',
    });
    assert.deepEqual(s.equipos[1], {
      id: 'e2',
      nombre: 'Los de la Pileta',
      integrantes: ['', '', ''],
      foto: 'img/equipo-2.jpg',
    });
  });

  test('configuración por defecto: liga, 10 vasos, fecha de hoy, inscripción', () => {
    const s = crearEstadoInicial();
    assert.equal(s.torneo.nombre, 'Recreo Beer Pong');
    assert.equal(s.torneo.formato, 'liga');
    assert.equal(s.torneo.vasosPorLado, 10);
    assert.equal(s.torneo.estado, 'inscripcion');
    assert.equal(s.torneo.campeonId, null);
    assert.match(s.torneo.fecha, /^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.equal(s.torneo.fecha, hoy);
    assert.deepEqual(s.partidos, []);
  });

  test('trae reglas por defecto (alrededor de 8, en castellano)', () => {
    const s = crearEstadoInicial();
    assert.ok(s.reglas.length >= 6 && s.reglas.length <= 10);
    assert.ok(s.reglas.every((r) => typeof r === 'string' && r.length > 0));
    assert.ok(s.reglas.some((r) => /re-rack/i.test(r)));
    assert.ok(s.reglas.some((r) => /redenci/i.test(r)));
    assert.ok(s.reglas.some((r) => /codo/i.test(r)));
  });

  test('cada llamada devuelve un objeto independiente', () => {
    const a = crearEstadoInicial();
    const b = crearEstadoInicial();
    a.equipos[0].nombre = 'Cambiado';
    a.reglas.push('otra');
    assert.equal(b.equipos[0].nombre, 'Los del Quincho');
    assert.notEqual(a.reglas.length, b.reglas.length);
  });
});

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

describe('equipos', () => {
  test('agregarEquipo suma un equipo con id incremental y no muta el original', () => {
    const s0 = crearEstadoInicial();
    const s1 = agregarEquipo(s0, { nombre: '  Los Pibes  ', integrantes: ['Juan', 'Pedro'], foto: null });
    assert.equal(s0.equipos.length, 2);
    assert.equal(s1.equipos.length, 3);
    assert.deepEqual(s1.equipos[2], { id: 'e3', nombre: 'Los Pibes', integrantes: ['Juan', 'Pedro'], foto: null });
  });

  test('agregarEquipo completa integrantes y foto por defecto', () => {
    const s = agregarEquipo(crearEstadoInicial(), { nombre: 'Sin datos' });
    assert.deepEqual(s.equipos[2].integrantes, ['', '', '']);
    assert.equal(s.equipos[2].foto, null);
  });

  test('agregarEquipo exige nombre', () => {
    assert.throws(() => agregarEquipo(crearEstadoInicial(), { nombre: '   ' }), /nombre/);
    assert.throws(() => agregarEquipo(crearEstadoInicial(), {}), /nombre/);
  });

  test('los ids son max + 1 y nunca chocan con uno existente después de borrar', () => {
    let s = agregarEquipo(crearEstadoInicial(), { nombre: 'Tres' }); // e3
    s = agregarEquipo(s, { nombre: 'Cuatro' }); // e4
    s = eliminarEquipo(s, 'e1');
    s = agregarEquipo(s, { nombre: 'Cinco' }); // max es e4 -> e5, no vuelve a e1
    assert.deepEqual(s.equipos.map((e) => e.id), ['e2', 'e3', 'e4', 'e5']);
    s = eliminarEquipo(s, 'e3');
    s = agregarEquipo(s, { nombre: 'Seis' });
    assert.deepEqual(s.equipos.map((e) => e.id), ['e2', 'e4', 'e5', 'e6']);
    assert.equal(new Set(s.equipos.map((e) => e.id)).size, s.equipos.length);
  });

  test('editarEquipo cambia solo lo pedido', () => {
    const s0 = crearEstadoInicial();
    const s1 = editarEquipo(s0, 'e1', { nombre: 'Nuevo nombre' });
    assert.equal(s1.equipos[0].nombre, 'Nuevo nombre');
    assert.equal(s1.equipos[0].foto, 'img/equipo-1.jpg');
    assert.equal(s0.equipos[0].nombre, 'Los del Quincho');
    const s2 = editarEquipo(s1, 'e1', { integrantes: ['A', 'B', 'C'], foto: 'data:image/jpeg;base64,xxx' });
    assert.deepEqual(s2.equipos[0].integrantes, ['A', 'B', 'C']);
    assert.equal(s2.equipos[0].foto, 'data:image/jpeg;base64,xxx');
    assert.equal(s2.equipos[0].nombre, 'Nuevo nombre');
  });

  test('editarEquipo funciona con el torneo en juego, y lanza si no existe', () => {
    const s = editarEquipo(fixtureDe(3, 'liga'), 'e2', { nombre: 'Otro' });
    assert.equal(equipoPorId(s, 'e2').nombre, 'Otro');
    assert.throws(() => editarEquipo(s, 'e99', { nombre: 'X' }), /No existe/);
    assert.throws(() => editarEquipo(s, 'e1', { nombre: '' }), /nombre/);
  });

  test('eliminarEquipo saca el equipo y lanza si no existe', () => {
    const s0 = crearEstadoInicial();
    const s1 = eliminarEquipo(s0, 'e1');
    assert.deepEqual(s1.equipos.map((e) => e.id), ['e2']);
    assert.equal(s0.equipos.length, 2);
    assert.throws(() => eliminarEquipo(s1, 'e1'), /No existe/);
  });

  test('no se puede agregar ni eliminar equipos con el fixture generado', () => {
    const s = fixtureDe(3, 'liga');
    assert.throws(() => agregarEquipo(s, { nombre: 'Tarde' }), /fixture/);
    assert.throws(() => eliminarEquipo(s, 'e1'), /fixture/);
  });

  test('equipoPorId devuelve el equipo o null', () => {
    const s = crearEstadoInicial();
    assert.equal(equipoPorId(s, 'e2').nombre, 'Los de la Pileta');
    assert.equal(equipoPorId(s, 'nada'), null);
  });
});

// ---------------------------------------------------------------------------
// Configuración y reglas
// ---------------------------------------------------------------------------

describe('configurarTorneo / editarReglas / reiniciarTorneo', () => {
  test('configurarTorneo cambia nombre, fecha, formato y vasos', () => {
    const s = configurarTorneo(crearEstadoInicial(), {
      nombre: 'Copa del Quincho',
      fecha: '2026-12-31',
      formato: 'eliminacion',
      vasosPorLado: 6,
    });
    assert.equal(s.torneo.nombre, 'Copa del Quincho');
    assert.equal(s.torneo.fecha, '2026-12-31');
    assert.equal(s.torneo.formato, 'eliminacion');
    assert.equal(s.torneo.vasosPorLado, 6);
  });

  test('configurarTorneo valida los valores', () => {
    const s = crearEstadoInicial();
    assert.throws(() => configurarTorneo(s, { formato: 'suizo' }), /Formato inválido/);
    assert.throws(() => configurarTorneo(s, { vasosPorLado: 0 }), /vasos/);
    assert.throws(() => configurarTorneo(s, { vasosPorLado: 'diez' }), /vasos/);
    assert.throws(() => configurarTorneo(s, { fecha: '31/12/2026' }), /fecha/);
    assert.throws(() => configurarTorneo(s, { nombre: '' }), /nombre/);
  });

  test('configurarTorneo solo en inscripción', () => {
    assert.throws(() => configurarTorneo(fixtureDe(3, 'liga'), { nombre: 'X' }), /fixture/);
  });

  test('editarReglas reemplaza las reglas y limpia vacías', () => {
    const s0 = crearEstadoInicial();
    const s1 = editarReglas(s0, ['  Una ', '', 'Dos']);
    assert.deepEqual(s1.reglas, ['Una', 'Dos']);
    assert.notEqual(s0.reglas.length, 2);
    assert.throws(() => editarReglas(s0, 'no es lista'), /reglas/);
  });

  test('reiniciarTorneo vuelve a inscripción conservando equipos, reglas y configuración', () => {
    let s = configurarTorneo(conEquipos(4, 'eliminacion'), { nombre: 'Copa', vasosPorLado: 6 });
    s = editarReglas(s, ['Regla propia']);
    s = generarFixture(s);
    s = jugarTodo(s, [6, 2]);
    assert.equal(s.torneo.estado, 'finalizado');
    const r = reiniciarTorneo(s);
    assert.equal(r.torneo.estado, 'inscripcion');
    assert.equal(r.torneo.campeonId, null);
    assert.deepEqual(r.partidos, []);
    assert.deepEqual(r.equipos, s.equipos);
    assert.deepEqual(r.reglas, ['Regla propia']);
    assert.equal(r.torneo.nombre, 'Copa');
    assert.equal(r.torneo.vasosPorLado, 6);
    assert.equal(r.torneo.formato, 'eliminacion');
    // el original no cambió
    assert.equal(s.torneo.estado, 'finalizado');
    assert.ok(s.partidos.length > 0);
    // se puede volver a generar
    assert.equal(generarFixture(r).torneo.estado, 'en_juego');
  });
});

// ---------------------------------------------------------------------------
// Fixture liga
// ---------------------------------------------------------------------------

describe('generarFixture (liga)', () => {
  test('exige al menos 2 equipos', () => {
    assert.throws(() => generarFixture(conEquipos(1)), /2 equipos/);
  });

  test('pasa a en_juego y no muta el original', () => {
    const s0 = conEquipos(3);
    const s1 = generarFixture(s0);
    assert.equal(s0.torneo.estado, 'inscripcion');
    assert.deepEqual(s0.partidos, []);
    assert.equal(s1.torneo.estado, 'en_juego');
  });

  test('no se puede generar dos veces', () => {
    assert.throws(() => generarFixture(fixtureDe(3)), /ya está generado/);
  });

  for (const n of [3, 4, 5, 6]) {
    test(`round robin con ${n} equipos: cada par juega una vez, nadie juega dos veces en la misma fecha`, () => {
      const s = fixtureDe(n, 'liga');
      const ids = s.equipos.map((e) => e.id);
      const esperado = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) esperado.push([ids[i], ids[j]].sort().join('-'));
      }
      assert.equal(s.partidos.length, (n * (n - 1)) / 2);
      assert.deepEqual(pares(s.partidos), esperado.sort());

      const fechas = n % 2 === 0 ? n - 1 : n;
      const rondas = new Set(s.partidos.map((p) => p.ronda));
      assert.equal(rondas.size, fechas);
      assert.deepEqual([...rondas].sort((a, b) => a - b), Array.from({ length: fechas }, (_, i) => i + 1));

      for (const r of rondas) {
        const enRonda = s.partidos.filter((p) => p.ronda === r);
        const equiposEnRonda = enRonda.flatMap((p) => [p.localId, p.visitanteId]);
        assert.equal(new Set(equiposEnRonda).size, equiposEnRonda.length, `fecha ${r} repite equipo`);
        // orden 1..k dentro de la fecha
        assert.deepEqual(enRonda.map((p) => p.orden), Array.from({ length: enRonda.length }, (_, i) => i + 1));
        if (n % 2 === 1) {
          assert.equal(enRonda.length, (n - 1) / 2, `fecha ${r}: con impares uno queda libre`);
        } else {
          assert.equal(enRonda.length, n / 2);
        }
      }

      for (const p of s.partidos) {
        assert.equal(p.jugado, false);
        assert.equal(p.bye, false);
        assert.equal(p.siguiente, null);
        assert.equal(p.ganadorId, null);
        assert.equal(p.vasosLocal, null);
        assert.equal(p.vasosVisitante, null);
      }
      // ids p1..pN sin huecos
      assert.deepEqual(s.partidos.map((p) => p.id), s.partidos.map((_, i) => `p${i + 1}`));
    });
  }

  test('con equipos impares, cada equipo queda libre exactamente una fecha', () => {
    const s = fixtureDe(5, 'liga');
    for (const e of s.equipos) {
      const fechasJugadas = s.partidos.filter((p) => p.localId === e.id || p.visitanteId === e.id).map((p) => p.ronda);
      assert.equal(fechasJugadas.length, 4);
      assert.equal(new Set(fechasJugadas).size, 4);
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture eliminación
// ---------------------------------------------------------------------------

function verificarLlave(s, n) {
  const tamano = 2 ** Math.ceil(Math.log2(Math.max(n, 2)));
  const rondas = Math.log2(tamano);
  const byes = tamano - n;

  // cantidad de partidos por ronda y encadenado
  for (let r = 1; r <= rondas; r++) {
    const enRonda = s.partidos.filter((p) => p.ronda === r);
    assert.equal(enRonda.length, tamano / 2 ** r, `ronda ${r}`);
    assert.deepEqual(enRonda.map((p) => p.orden), Array.from({ length: enRonda.length }, (_, i) => i + 1));
    for (const p of enRonda) {
      if (r === rondas) {
        assert.equal(p.siguiente, null, 'la final no tiene siguiente');
      } else {
        const dest = s.partidos.find((x) => x.id === p.siguiente.partidoId);
        assert.ok(dest, `siguiente de ${p.id} existe`);
        assert.equal(dest.ronda, r + 1);
        assert.equal(dest.orden, Math.ceil(p.orden / 2));
        assert.equal(p.siguiente.lado, p.orden % 2 === 1 ? 'local' : 'visitante');
      }
    }
  }
  assert.equal(s.partidos.length, tamano - 1);

  // byes
  const partidosBye = s.partidos.filter((p) => p.bye);
  assert.equal(partidosBye.length, byes);
  const idsConBye = s.equipos.slice(0, byes).map((e) => e.id);
  assert.deepEqual(partidosBye.map((p) => p.localId).sort(), idsConBye.sort(), 'los byes van a los primeros de la lista');
  for (const p of partidosBye) {
    assert.equal(p.ronda, 1);
    assert.equal(p.visitanteId, null);
    assert.equal(p.jugado, true);
    assert.equal(p.ganadorId, p.localId);
    const dest = s.partidos.find((x) => x.id === p.siguiente.partidoId);
    assert.equal(dest[p.siguiente.lado === 'local' ? 'localId' : 'visitanteId'], p.localId, 'bye propagado');
  }

  // todos los equipos aparecen exactamente una vez en primera ronda
  const primera = s.partidos.filter((p) => p.ronda === 1);
  const apariciones = primera.flatMap((p) => [p.localId, p.visitanteId]).filter(Boolean).sort();
  assert.deepEqual(apariciones, s.equipos.map((e) => e.id).sort());

  // partidos no bye de primera ronda: ambos definidos, sin jugar
  for (const p of primera.filter((p) => !p.bye)) {
    assert.ok(p.localId && p.visitanteId);
    assert.equal(p.jugado, false);
  }

  // rondas posteriores: sin jugar
  for (const p of s.partidos.filter((p) => p.ronda > 1)) {
    assert.equal(p.jugado, false);
    assert.equal(p.bye, false);
  }

  // dos byes solo se cruzan en segunda ronda si es inevitable
  if (rondas > 1) {
    const segunda = s.partidos.filter((p) => p.ronda === 2);
    const conDobleBye = segunda.filter((p) => idsConBye.includes(p.localId) && idsConBye.includes(p.visitanteId));
    const inevitable = Math.max(0, byes - segunda.length);
    assert.equal(conDobleBye.length, inevitable, 'byes repartidos por la llave');
  }
}

describe('generarFixture (eliminacion)', () => {
  test('2 equipos: un solo partido que es la final', () => {
    const s = fixtureDe(2, 'eliminacion');
    assert.equal(s.partidos.length, 1);
    const [f] = s.partidos;
    assert.equal(f.ronda, 1);
    assert.equal(f.localId, 'e1');
    assert.equal(f.visitanteId, 'e2');
    assert.equal(f.siguiente, null);
    assert.equal(f.bye, false);
    assert.equal(partidosPorRonda(s)[0].nombre, 'Final');
    verificarLlave(s, 2);
  });

  test('3 equipos: llave de 4 con un bye para e1', () => {
    const s = fixtureDe(3, 'eliminacion');
    verificarLlave(s, 3);
    const bye = s.partidos.find((p) => p.bye);
    assert.equal(bye.localId, 'e1');
    const final = s.partidos.find((p) => p.ronda === 2);
    assert.equal(final.localId, 'e1');
    assert.equal(final.visitanteId, null);
    const otro = s.partidos.find((p) => p.ronda === 1 && !p.bye);
    assert.deepEqual([otro.localId, otro.visitanteId], ['e2', 'e3']);
    assert.equal(proximoPartido(s).id, otro.id);
  });

  test('5 equipos: llave de 8 con 3 byes (uno inevitable se cruza en semis)', () => {
    const s = fixtureDe(5, 'eliminacion');
    verificarLlave(s, 5);
    assert.equal(s.partidos.filter((p) => p.bye).length, 3);
    assert.deepEqual(
      partidosPorRonda(s).map((r) => r.nombre),
      ['Cuartos', 'Semifinal', 'Final'],
    );
  });

  test('6 equipos: llave de 8 con 2 byes en partidos alternados', () => {
    const s = fixtureDe(6, 'eliminacion');
    verificarLlave(s, 6);
    const semis = s.partidos.filter((p) => p.ronda === 2);
    // cada semi tiene exactamente un bye ya ubicado
    for (const semi of semis) {
      const definidos = [semi.localId, semi.visitanteId].filter(Boolean);
      assert.equal(definidos.length, 1);
    }
  });

  test('8 equipos: llave completa sin byes', () => {
    const s = fixtureDe(8, 'eliminacion');
    verificarLlave(s, 8);
    assert.equal(s.partidos.filter((p) => p.bye).length, 0);
    assert.equal(s.partidos.length, 7);
    const primera = s.partidos.filter((p) => p.ronda === 1);
    assert.deepEqual(
      primera.map((p) => [p.localId, p.visitanteId]),
      [['e1', 'e2'], ['e3', 'e4'], ['e5', 'e6'], ['e7', 'e8']],
    );
    assert.deepEqual(partidosPorRonda(s).map((r) => r.nombre), ['Cuartos', 'Semifinal', 'Final']);
    assert.equal(s.partidos.at(-1).ronda, 3);
    assert.equal(s.partidos.at(-1).siguiente, null);
  });

  test('16 equipos: octavos, cuartos, semi y final', () => {
    const s = fixtureDe(16, 'eliminacion');
    verificarLlave(s, 16);
    assert.deepEqual(partidosPorRonda(s).map((r) => r.nombre), ['Octavos', 'Cuartos', 'Semifinal', 'Final']);
  });
});

// ---------------------------------------------------------------------------
// registrarResultado
// ---------------------------------------------------------------------------

describe('registrarResultado', () => {
  test('lanza si no hay fixture', () => {
    assert.throws(() => registrarResultado(crearEstadoInicial(), 'p1', 10, 3), /fixture/);
  });

  test('lanza con partido inexistente', () => {
    assert.throws(() => registrarResultado(fixtureDe(3), 'p99', 10, 3), /No existe el partido/);
  });

  test('valida rango 0..vasosPorLado y enteros', () => {
    const s = fixtureDe(3, 'liga');
    assert.throws(() => registrarResultado(s, 'p1', 11, 3), /entre 0 y 10/);
    assert.throws(() => registrarResultado(s, 'p1', -1, 10), /entre 0 y 10/);
    assert.throws(() => registrarResultado(s, 'p1', 10, 11), /entre 0 y 10/);
    assert.throws(() => registrarResultado(s, 'p1', 2.5, 10), /entero/);
    assert.throws(() => registrarResultado(s, 'p1', '10', 3), /entero/);
    assert.throws(() => registrarResultado(s, 'p1', 10, null), /entero/);
    const s6 = generarFixture(configurarTorneo(conEquipos(3), { vasosPorLado: 6 }));
    assert.throws(() => registrarResultado(s6, 'p1', 7, 3), /entre 0 y 6/);
    const ok = registrarResultado(s6, 'p1', 6, 3);
    assert.equal(ok.partidos[0].ganadorId, ok.partidos[0].localId);
  });

  test('no permite empates ni que los dos lleguen a N', () => {
    const s = fixtureDe(3, 'liga');
    assert.throws(() => registrarResultado(s, 'p1', 4, 4), /empate/);
    assert.throws(() => registrarResultado(s, 'p1', 0, 0), /empate/);
    assert.throws(() => registrarResultado(s, 'p1', 10, 10), /los dos/);
  });

  test('gana el que llegó a N aunque tenga menos... (el otro nunca puede tener más)', () => {
    const s = fixtureDe(3, 'liga');
    const a = registrarResultado(s, 'p1', 10, 7);
    assert.equal(a.partidos[0].ganadorId, a.partidos[0].localId);
    const b = registrarResultado(s, 'p1', 3, 10);
    assert.equal(b.partidos[0].ganadorId, b.partidos[0].visitanteId);
  });

  test('si nadie llegó a N gana el de más vasos', () => {
    const s = fixtureDe(3, 'liga');
    const a = registrarResultado(s, 'p1', 7, 5);
    assert.equal(a.partidos[0].ganadorId, a.partidos[0].localId);
    const b = registrarResultado(s, 'p1', 2, 9);
    assert.equal(b.partidos[0].ganadorId, b.partidos[0].visitanteId);
  });

  test('marca el partido como jugado con los vasos y no muta el original', () => {
    const s0 = fixtureDe(3, 'liga');
    const s1 = registrarResultado(s0, 'p1', 10, 2);
    assert.equal(s0.partidos[0].jugado, false);
    assert.equal(s0.partidos[0].vasosLocal, null);
    const p = s1.partidos[0];
    assert.equal(p.jugado, true);
    assert.equal(p.vasosLocal, 10);
    assert.equal(p.vasosVisitante, 2);
    assert.equal(s1.torneo.estado, 'en_juego');
    assert.equal(s1.torneo.campeonId, null);
  });

  test('lanza si los equipos del partido de llave todavía no están definidos', () => {
    const s = fixtureDe(4, 'eliminacion');
    const final = s.partidos.find((p) => p.ronda === 2);
    assert.throws(() => registrarResultado(s, final.id, 10, 3), /Todavía no se sabe/);
  });

  test('lanza sobre un bye', () => {
    const s = fixtureDe(3, 'eliminacion');
    const bye = s.partidos.find((p) => p.bye);
    assert.throws(() => registrarResultado(s, bye.id, 10, 0), /bye/);
  });

  test('propaga el ganador al partido siguiente en el lado correcto', () => {
    const s = fixtureDe(4, 'eliminacion');
    const [semi1, semi2, final] = s.partidos;
    const a = registrarResultado(s, semi1.id, 3, 10); // gana e2
    const finalA = a.partidos.find((p) => p.id === final.id);
    assert.equal(finalA.localId, 'e2');
    assert.equal(finalA.visitanteId, null);
    const b = registrarResultado(a, semi2.id, 10, 1); // gana e3
    const finalB = b.partidos.find((p) => p.id === final.id);
    assert.equal(finalB.localId, 'e2');
    assert.equal(finalB.visitanteId, 'e3');
    assert.equal(b.torneo.estado, 'en_juego');
  });

  test('eliminacion: finalizado + campeón al jugarse la final', () => {
    let s = fixtureDe(5, 'eliminacion');
    s = jugarTodo(s, [10, 5]);
    assert.equal(s.torneo.estado, 'finalizado');
    assert.equal(proximoPartido(s), null);
    const final = s.partidos.find((p) => p.ronda === 3);
    assert.equal(final.jugado, true);
    assert.equal(s.torneo.campeonId, final.ganadorId);
    assert.equal(campeon(s).id, final.ganadorId);
    assert.ok(s.partidos.every((p) => p.jugado));
  });

  test('liga: finalizado + campeón = primero de la tabla', () => {
    let s = fixtureDe(3, 'liga');
    // e1 gana todo lo que juega como local; veamos los partidos concretos
    for (const p of s.partidos) {
      const ganaLocal = p.localId === 'e2' || (p.localId !== 'e2' && p.visitanteId !== 'e2');
      s = ganaLocal ? registrarResultado(s, p.id, 10, 4) : registrarResultado(s, p.id, 4, 10);
    }
    assert.equal(s.torneo.estado, 'finalizado');
    assert.equal(s.torneo.campeonId, 'e2');
    assert.equal(campeon(s).nombre, 'Los de la Pileta');
    assert.equal(tablaPosiciones(s)[0].equipoId, 'e2');
    assert.equal(proximoPartido(s), null);
  });

  test('se puede corregir un resultado ya cargado si el siguiente no se jugó', () => {
    const s = fixtureDe(4, 'eliminacion');
    const a = registrarResultado(s, 'p1', 10, 3); // gana e1
    assert.equal(a.partidos[2].localId, 'e1');
    const b = registrarResultado(a, 'p1', 3, 10); // corrección: gana e2
    assert.equal(b.partidos[0].ganadorId, 'e2');
    assert.equal(b.partidos[2].localId, 'e2');
  });

  test('no se puede corregir un resultado si el siguiente ya se jugó', () => {
    let s = fixtureDe(4, 'eliminacion');
    s = registrarResultado(s, 'p1', 10, 3);
    s = registrarResultado(s, 'p2', 10, 3);
    s = registrarResultado(s, 'p3', 10, 3);
    assert.throws(() => registrarResultado(s, 'p1', 3, 10), /siguiente ya se jugó/);
  });
});

// ---------------------------------------------------------------------------
// deshacerResultado
// ---------------------------------------------------------------------------

describe('deshacerResultado', () => {
  test('limpia el resultado y no muta el original', () => {
    const s0 = registrarResultado(fixtureDe(3, 'liga'), 'p1', 10, 4);
    const s1 = deshacerResultado(s0, 'p1');
    assert.equal(s0.partidos[0].jugado, true);
    const p = s1.partidos[0];
    assert.equal(p.jugado, false);
    assert.equal(p.vasosLocal, null);
    assert.equal(p.vasosVisitante, null);
    assert.equal(p.ganadorId, null);
    // los equipos quedan como estaban
    assert.equal(p.localId, s0.partidos[0].localId);
    assert.equal(p.visitanteId, s0.partidos[0].visitanteId);
  });

  test('lanza si el partido no existe, no está jugado o es un bye', () => {
    const s = fixtureDe(3, 'eliminacion');
    assert.throws(() => deshacerResultado(s, 'p99'), /No existe/);
    const pendiente = s.partidos.find((p) => !p.bye && p.ronda === 1);
    assert.throws(() => deshacerResultado(s, pendiente.id), /todavía no tiene resultado/);
    const bye = s.partidos.find((p) => p.bye);
    assert.throws(() => deshacerResultado(s, bye.id), /bye/);
  });

  test('saca al equipo del partido siguiente', () => {
    const s = fixtureDe(4, 'eliminacion');
    const a = registrarResultado(s, 'p2', 10, 3); // gana e3 -> final.visitante
    assert.equal(a.partidos[2].visitanteId, 'e3');
    const b = deshacerResultado(a, 'p2');
    assert.equal(b.partidos[2].visitanteId, null);
    assert.equal(b.partidos[2].localId, null);
    assert.equal(b.partidos[1].jugado, false);
  });

  test('falla si el partido siguiente ya se jugó', () => {
    let s = fixtureDe(4, 'eliminacion');
    s = registrarResultado(s, 'p1', 10, 3);
    s = registrarResultado(s, 'p2', 10, 3);
    s = registrarResultado(s, 'p3', 10, 3);
    assert.throws(() => deshacerResultado(s, 'p1'), /siguiente ya se jugó/);
    assert.throws(() => deshacerResultado(s, 'p2'), /siguiente ya se jugó/);
    // deshaciendo la final primero, después sí
    const sinFinal = deshacerResultado(s, 'p3');
    assert.equal(sinFinal.torneo.estado, 'en_juego');
    assert.equal(sinFinal.torneo.campeonId, null);
    const sinSemi = deshacerResultado(sinFinal, 'p1');
    assert.equal(sinSemi.partidos[2].localId, null);
    assert.equal(sinSemi.partidos[2].visitanteId, 'e3');
  });

  test('deshacer en torneo finalizado vuelve a en_juego y borra el campeón', () => {
    let s = jugarTodo(fixtureDe(3, 'liga'), [10, 2]);
    assert.equal(s.torneo.estado, 'finalizado');
    assert.ok(s.torneo.campeonId);
    s = deshacerResultado(s, 'p3');
    assert.equal(s.torneo.estado, 'en_juego');
    assert.equal(s.torneo.campeonId, null);
    assert.equal(campeon(s), null);
    assert.equal(proximoPartido(s).id, 'p3');
  });
});

// ---------------------------------------------------------------------------
// tablaPosiciones
// ---------------------------------------------------------------------------

describe('tablaPosiciones', () => {
  test('sin partidos jugados: todos en cero, ordenados por nombre', () => {
    const s = agregarEquipo(crearEstadoInicial(), { nombre: 'Aguante' });
    const t = tablaPosiciones(s);
    assert.equal(t.length, 3);
    assert.deepEqual(t.map((f) => f.equipoId), ['e3', 'e2', 'e1']); // Aguante, Los de la Pileta, Los del Quincho
    for (const f of t) assert.deepEqual(f, { equipoId: f.equipoId, pj: 0, pg: 0, pp: 0, vf: 0, vc: 0, dif: 0, pts: 0 });
  });

  test('cuenta pj/pg/pp/vf/vc/dif/pts con 3 puntos por victoria', () => {
    let s = fixtureDe(3, 'liga');
    // buscamos cada partido por par de equipos para no depender del orden del círculo
    const partido = (a, b) => s.partidos.find((p) => (p.localId === a && p.visitanteId === b) || (p.localId === b && p.visitanteId === a));
    const jugar = (a, b, va, vb) => {
      const p = partido(a, b);
      s = p.localId === a ? registrarResultado(s, p.id, va, vb) : registrarResultado(s, p.id, vb, va);
    };
    jugar('e1', 'e2', 10, 6); // gana e1
    jugar('e1', 'e3', 4, 10); // gana e3
    const t = tablaPosiciones(s);
    const fila = (id) => t.find((f) => f.equipoId === id);
    assert.deepEqual(fila('e1'), { equipoId: 'e1', pj: 2, pg: 1, pp: 1, vf: 14, vc: 16, dif: -2, pts: 3 });
    assert.deepEqual(fila('e3'), { equipoId: 'e3', pj: 1, pg: 1, pp: 0, vf: 10, vc: 4, dif: 6, pts: 3 });
    assert.deepEqual(fila('e2'), { equipoId: 'e2', pj: 1, pg: 0, pp: 1, vf: 6, vc: 10, dif: -4, pts: 0 });
    // e3 y e1 tienen 3 pts: desempata dif
    assert.deepEqual(t.map((f) => f.equipoId), ['e3', 'e1', 'e2']);
  });

  test('ordena por pts, dif, vf y nombre', () => {
    let s = conEquipos(4, 'liga');
    s = editarEquipo(s, 'e1', { nombre: 'Zeta' });
    s = editarEquipo(s, 'e2', { nombre: 'Alfa' });
    s = editarEquipo(s, 'e3', { nombre: 'Beta' });
    s = editarEquipo(s, 'e4', { nombre: 'Gama' });
    s = generarFixture(s);
    const partido = (a, b) => s.partidos.find((p) => (p.localId === a && p.visitanteId === b) || (p.localId === b && p.visitanteId === a));
    const jugar = (a, b, va, vb) => {
      const p = partido(a, b);
      s = p.localId === a ? registrarResultado(s, p.id, va, vb) : registrarResultado(s, p.id, vb, va);
    };
    // e1 (Zeta) y e2 (Alfa) ganan uno cada uno con misma dif y mismos vf -> desempata nombre
    jugar('e1', 'e3', 10, 5); // e1: +5, vf 10
    jugar('e2', 'e4', 10, 5); // e2: +5, vf 10
    // e3 (Beta) y e4 (Gama) perdieron con la misma dif (-5) y mismos vf (5) -> nombre
    let t = tablaPosiciones(s).map((f) => f.equipoId);
    assert.deepEqual(t, ['e2', 'e1', 'e3', 'e4']);

    // ahora e3 gana con dif chica pero mucha vf; e4 sigue perdiendo
    jugar('e3', 'e4', 9, 8); // e3: 3 pts, dif -4, vf 14 ; e4: 0 pts, dif -6, vf 13
    jugar('e1', 'e2', 10, 9); // e1: 6 pts, dif +6 ; e2: 3 pts, dif +4, vf 19
    t = tablaPosiciones(s).map((f) => f.equipoId);
    // e1 6 pts; e2 3 pts dif +4; e3 3 pts dif -4; e4 0
    assert.deepEqual(t, ['e1', 'e2', 'e3', 'e4']);

    // mismo pts y dif, distinta vf
    jugar('e1', 'e4', 6, 10); // e1: 6 pts, dif +2, vf 26 ; e4: 3 pts, dif -2, vf 23
    jugar('e2', 'e3', 10, 2); // e2: 6 pts, dif +12 ; e3: 3 pts, dif -12
    t = tablaPosiciones(s);
    assert.deepEqual(t.map((f) => f.equipoId), ['e2', 'e1', 'e4', 'e3']);
  });

  test('ignora los byes en eliminación', () => {
    const s = fixtureDe(3, 'eliminacion');
    const t = tablaPosiciones(s);
    assert.ok(t.every((f) => f.pj === 0 && f.pts === 0));
  });
});

// ---------------------------------------------------------------------------
// nombreRonda / partidosPorRonda / proximoPartido
// ---------------------------------------------------------------------------

describe('nombreRonda', () => {
  test('liga: Fecha N', () => {
    assert.equal(nombreRonda('liga', 1, 5), 'Fecha 1');
    assert.equal(nombreRonda('liga', 5, 5), 'Fecha 5');
  });

  test('eliminacion: Final, Semifinal, Cuartos, Octavos y Ronda N', () => {
    assert.equal(nombreRonda('eliminacion', 1, 1), 'Final');
    assert.equal(nombreRonda('eliminacion', 2, 2), 'Final');
    assert.equal(nombreRonda('eliminacion', 1, 2), 'Semifinal');
    assert.equal(nombreRonda('eliminacion', 1, 3), 'Cuartos');
    assert.equal(nombreRonda('eliminacion', 2, 3), 'Semifinal');
    assert.equal(nombreRonda('eliminacion', 3, 3), 'Final');
    assert.equal(nombreRonda('eliminacion', 1, 4), 'Octavos');
    assert.equal(nombreRonda('eliminacion', 1, 5), 'Ronda 1');
    assert.equal(nombreRonda('eliminacion', 2, 5), 'Octavos');
    assert.equal(nombreRonda('eliminacion', 1, 6), 'Ronda 1');
    assert.equal(nombreRonda('eliminacion', 2, 6), 'Ronda 2');
    assert.equal(nombreRonda('eliminacion', 3, 6), 'Octavos');
  });
});

describe('partidosPorRonda', () => {
  test('agrupa por ronda con nombre y orden', () => {
    const s = fixtureDe(4, 'liga');
    const r = partidosPorRonda(s);
    assert.deepEqual(r.map((x) => [x.ronda, x.nombre, x.partidos.length]), [
      [1, 'Fecha 1', 2],
      [2, 'Fecha 2', 2],
      [3, 'Fecha 3', 2],
    ]);
    assert.deepEqual(r[0].partidos.map((p) => p.orden), [1, 2]);
  });

  test('vacío sin fixture', () => {
    assert.deepEqual(partidosPorRonda(crearEstadoInicial()), []);
  });

  test('devuelve copias (no comparte referencias con el estado)', () => {
    const s = fixtureDe(3, 'liga');
    const r = partidosPorRonda(s);
    r[0].partidos[0].jugado = true;
    assert.equal(s.partidos[0].jugado, false);
  });
});

describe('proximoPartido', () => {
  test('null sin fixture o sin pendientes', () => {
    assert.equal(proximoPartido(crearEstadoInicial()), null);
    assert.equal(proximoPartido(jugarTodo(fixtureDe(2, 'eliminacion'))), null);
  });

  test('primer pendiente con ambos equipos, en orden de ronda/orden', () => {
    let s = fixtureDe(4, 'liga');
    assert.equal(proximoPartido(s).id, 'p1');
    s = registrarResultado(s, 'p1', 10, 1);
    assert.equal(proximoPartido(s).id, 'p2');
    s = registrarResultado(s, 'p3', 10, 1);
    assert.equal(proximoPartido(s).id, 'p2');
  });

  test('salta partidos de llave sin equipos definidos', () => {
    let s = fixtureDe(4, 'eliminacion');
    s = registrarResultado(s, 'p1', 10, 1);
    assert.equal(proximoPartido(s).id, 'p2');
    s = registrarResultado(s, 'p2', 10, 1);
    assert.equal(proximoPartido(s).id, 'p3');
  });
});

// ---------------------------------------------------------------------------
// serializar / deserializar
// ---------------------------------------------------------------------------

describe('serializar / deserializar', () => {
  test('produce base64url (sin +, / ni =)', () => {
    const str = serializar(fixtureDe(5, 'eliminacion'));
    assert.equal(typeof str, 'string');
    assert.match(str, /^[A-Za-z0-9_-]+$/);
  });

  test('ida y vuelta conserva el estado (incluyendo acentos y ñ)', () => {
    let s = configurarTorneo(conEquipos(5, 'liga'), { nombre: 'Torneo del Ñandú — año 2026' });
    s = editarEquipo(s, 'e3', { nombre: 'Los Ñoquis', integrantes: ['José', 'Añil', ''] });
    s = generarFixture(s);
    s = registrarResultado(s, 'p1', 10, 7);
    const vuelta = deserializar(serializar(s));
    assert.deepEqual(vuelta, s);
  });

  test('reemplaza fotos data: por null pero conserva rutas img/', () => {
    let s = crearEstadoInicial();
    s = editarEquipo(s, 'e2', { foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
    const vuelta = deserializar(serializar(s));
    assert.equal(vuelta.equipos[0].foto, 'img/equipo-1.jpg');
    assert.equal(vuelta.equipos[1].foto, null);
    // el original no se tocó
    assert.match(s.equipos[1].foto, /^data:/);
  });

  test('deserializar lanza con basura', () => {
    assert.throws(() => deserializar(''), /vacío|válido/);
    assert.throws(() => deserializar(null), /vacío|válido/);
    assert.throws(() => deserializar('!!!no-es-base64!!!'), /válido/);
    assert.throws(() => deserializar('aG9sYQ'), /válido/); // "hola" -> no es JSON
    const json = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    assert.throws(() => deserializar(json({ hola: 'mundo' })), /inválido/);
    assert.throws(() => deserializar(json([1, 2, 3])), /inválido/);
    assert.throws(() => deserializar(json({ ...crearEstadoInicial(), version: 2 })), /versión/);
    assert.throws(() => deserializar(json({ ...crearEstadoInicial(), torneo: null })), /torneo/);
    assert.throws(() => deserializar(json({ ...crearEstadoInicial(), equipos: 'nope' })), /equipos/);
    assert.throws(() => deserializar(json({ ...crearEstadoInicial(), partidos: {} })), /partidos/);
    assert.throws(() => deserializar(json({ ...crearEstadoInicial(), reglas: [1, 2] })), /reglas/);
    const s = crearEstadoInicial();
    assert.throws(() => deserializar(json({ ...s, torneo: { ...s.torneo, formato: 'suizo' } })), /formato/);
    assert.throws(() => deserializar(json({ ...s, torneo: { ...s.torneo, estado: 'raro' } })), /estado/);
    assert.throws(() => deserializar(json({ ...s, equipos: [{ id: 'e1' }] })), /equipo/);
    assert.throws(() => deserializar(json({ ...s, partidos: [{ id: 'p1' }] })), /p1/);
  });

  test('deserializar acepta un estado válido generado a mano', () => {
    const s = crearEstadoInicial();
    const str = Buffer.from(JSON.stringify(s)).toString('base64url');
    assert.deepEqual(deserializar(str), s);
  });
});

// ---------------------------------------------------------------------------
// Inmutabilidad general
// ---------------------------------------------------------------------------

describe('inmutabilidad', () => {
  test('ninguna operación muta el estado de entrada', () => {
    const base = conEquipos(4, 'eliminacion');
    const foto = JSON.stringify(base);
    agregarEquipo(base, { nombre: 'X' });
    editarEquipo(base, 'e1', { nombre: 'Y', integrantes: ['a'], foto: 'z' });
    eliminarEquipo(base, 'e1');
    configurarTorneo(base, { nombre: 'Q', formato: 'liga', vasosPorLado: 6 });
    editarReglas(base, ['r']);
    const conFixture = generarFixture(base);
    assert.equal(JSON.stringify(base), foto);

    const foto2 = JSON.stringify(conFixture);
    const jugado = registrarResultado(conFixture, 'p1', 10, 2);
    tablaPosiciones(conFixture);
    partidosPorRonda(conFixture);
    proximoPartido(conFixture);
    serializar(conFixture);
    reiniciarTorneo(conFixture);
    assert.equal(JSON.stringify(conFixture), foto2);

    const foto3 = JSON.stringify(jugado);
    deshacerResultado(jugado, 'p1');
    registrarResultado(jugado, 'p1', 2, 10);
    assert.equal(JSON.stringify(jugado), foto3);
  });
});
