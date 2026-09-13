# Recreo — Torneo de Beer Pong entre amigos

## Objetivo

Una app web liviana, pensada para usarse **desde el celular en medio de la juntada**, que permita:

1. Anotar los equipos (nombre, integrantes, foto).
2. Elegir el formato del torneo (liga todos contra todos o eliminación directa) y generar el fixture con un botón.
3. Cargar el resultado de cada partido (vasos embocados por lado) en dos toques.
4. Ver en vivo la tabla de posiciones o la llave, y quién es el campeón.
5. Compartir el estado del torneo por link (WhatsApp) sin backend ni cuentas.

No hay servidor: todo vive en `localStorage` del celular que administra el torneo y se comparte
codificado en la URL. Se sirve como carpeta estática junto al sitio de Memento Mori Gin (`/recreo/`).

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Stack | HTML + CSS + JS vanilla (ES modules), sin build ni dependencias | El repo es un sitio estático; se publica copiando la carpeta |
| Persistencia | `localStorage` + estado codificado en URL (`#/s/<base64url>`) | Cero infraestructura; alcanza para una noche entre amigos |
| Formatos | `liga` (round robin) y `eliminacion` (llave con byes) | Cubre el 95% de los torneos caseros |
| Puntaje | Vasos embocados por equipo (0..N, N = 6 o 10) | Es lo que la gente cuenta en la mesa |
| Estética | Oscuro + oro de la marca, más un rojo "vaso" para acciones | Coherente con el sitio, pero con onda de recreo |
| Idioma | Español rioplatense, voseo | Es para los pibes |

## Estructura de archivos

```
recreo/
  index.html          SPA con routing por hash
  css/style.css
  js/tournament.js    lógica pura (sin DOM): fixture, tabla, llave, serialización
  js/store.js         persistencia (localStorage) y carga desde URL
  js/ui.js            render de vistas y manejo de eventos
  js/app.js           bootstrap
  img/equipo-1.jpg    foto equipo 1 (quincho)
  img/equipo-2.jpg    foto equipo 2 (pileta)
  tests/tournament.test.mjs   node --test
  PLAN.md
```

## Modelo de estado (contrato compartido)

```js
{
  version: 1,
  torneo: {
    nombre: 'Recreo Beer Pong',
    fecha: '2026-09-13',            // ISO yyyy-mm-dd
    formato: 'liga' | 'eliminacion',
    vasosPorLado: 10,               // 6 o 10
    estado: 'inscripcion' | 'en_juego' | 'finalizado',
    campeonId: null | string,
  },
  equipos: [
    { id: 'e1', nombre: 'Los del Quincho', integrantes: ['', '', ''], foto: 'img/equipo-1.jpg' | 'data:image/...' | null }
  ],
  partidos: [
    {
      id: 'p1',
      ronda: 1,                     // liga: fecha N; eliminacion: 1 = primera ronda, última = final
      orden: 1,                     // posición dentro de la ronda
      localId: 'e1' | null,         // null = todavía no se define (llave)
      visitanteId: 'e2' | null,
      vasosLocal: null | number,    // vasos embocados por el local
      vasosVisitante: null | number,
      ganadorId: null | string,
      jugado: false,
      bye: false,                   // eliminacion: partido resuelto automáticamente
      siguiente: null | { partidoId: 'p5', lado: 'local' | 'visitante' },
    }
  ],
  reglas: ['...'],                  // reglas de la casa, editables
}
```

## API de `js/tournament.js` (funciones puras, devuelven un estado nuevo, nunca mutan)

```js
export function crearEstadoInicial()                              // con 2 equipos de ejemplo y reglas default
export function agregarEquipo(state, { nombre, integrantes, foto })  // solo en 'inscripcion'; lanza Error si no
export function editarEquipo(state, id, cambios)                  // nombre/integrantes/foto, en cualquier estado
export function eliminarEquipo(state, id)                         // solo en 'inscripcion'
export function configurarTorneo(state, cambios)                  // nombre/fecha/formato/vasosPorLado, solo en 'inscripcion'
export function generarFixture(state)                             // requiere >= 2 equipos; pasa a 'en_juego'
export function registrarResultado(state, partidoId, vasosLocal, vasosVisitante)
   // valida 0..N, no empate, exactamente uno llegó a N (o gana el de más vasos si ninguno);
   // setea ganador, propaga a `siguiente` en llave; si no queda nada por jugar -> 'finalizado' + campeonId
export function deshacerResultado(state, partidoId)               // falla si el partido siguiente ya se jugó
export function reiniciarTorneo(state)                            // vuelve a 'inscripcion' conservando equipos y reglas
export function editarReglas(state, reglas)

export function tablaPosiciones(state)
   // [{ equipoId, pj, pg, pp, vf, vc, dif, pts }] ordenada por pts desc, dif desc, vf desc, nombre asc; pts = 3 por victoria
export function partidosPorRonda(state)
   // [{ ronda, nombre, partidos: [...] }] nombre: 'Fecha 1' (liga) | 'Octavos'/'Cuartos'/'Semifinal'/'Final'/'Ronda 1' (eliminacion)
export function nombreRonda(formato, ronda, totalRondas)
export function equipoPorId(state, id)
export function campeon(state)                                    // equipo o null
export function proximoPartido(state)                             // primer partido pendiente con ambos equipos definidos, o null

export function serializar(state)      // string base64url de JSON compacto; las fotos data: se reemplazan por null
export function deserializar(str)      // estado válido o lanza Error
```

Reglas de generación:

- **Liga**: método del círculo. Si hay cantidad impar de equipos se agrega un "libre" (ese partido no se crea). Cada equipo juega contra todos una vez.
- **Eliminación**: tamaño de llave = siguiente potencia de 2. Los byes se asignan a los primeros de la lista y se resuelven automáticamente (`bye: true`, `jugado: true`, ganador avanza). Los partidos se encadenan con `siguiente`.

## Vistas de `index.html` (routing por hash)

| Ruta | Contenido |
|---|---|
| `#/` | Home: nombre y fecha del torneo, estado, próximo partido, CTA principal (inscribir / generar fixture / cargar resultado) |
| `#/equipos` | Cards con foto grande, nombre e integrantes. Alta/edición/baja (baja solo en inscripción). Foto desde cámara/galería, reducida a 800px con canvas |
| `#/fixture` | Partidos agrupados por ronda. Toque en un partido abre el modal de resultado (steppers de vasos). Resultado cargado se puede deshacer |
| `#/tabla` | Liga: tabla de posiciones. Eliminación: llave dibujada por columnas (scroll horizontal) |
| `#/reglas` | Reglas de la casa editables |
| `#/ajustes` | Nombre, fecha, formato, vasos por lado, compartir link, exportar/importar JSON, reiniciar torneo |
| `#/s/<payload>` | Importa un estado compartido (pide confirmación si ya hay uno local) y redirige a `#/` |

## Subagentes

| Agente | Entregable | Depende de |
|---|---|---|
| **Lógica** | `js/tournament.js` + `tests/tournament.test.mjs` verdes con `node --test` | Este contrato |
| **UI** | `index.html`, `css/style.css`, `js/store.js`, `js/ui.js`, `js/app.js` | Este contrato (trabaja en paralelo con Lógica) |
| **QA** | Levanta `python3 -m http.server` desde la raíz, recorre la app con Chromium (Playwright), capturas móviles, corrige bugs de integración | Lógica + UI |

## Cómo correrlo

```bash
# desde la raíz del repo
python3 -m http.server 8080
# abrir http://localhost:8080/recreo/
node --test recreo/tests/
```

## Roadmap (después del MVP)

- Liga + playoffs (los mejores N pasan a llave).
- Sincronización en vivo entre celulares (Firebase o similar).
- Estadísticas por jugador (vasos embocados, "el que más se pasó de copas").
- Historial de torneos anteriores.
