// Bootstrap de Recreo: carga el estado, arma el routing por hash y conecta la UI.
import * as T from './tournament.js';
import { cargar, guardar, limpiar } from './store.js';
import { inicializarUI, render, toast } from './ui.js';

let state = cargar() || T.crearEstadoInicial();

/**
 * Aplica una función pura al estado, guarda y vuelve a renderizar.
 * Si la lógica lanza un Error, lo muestra como toast y devuelve false.
 */
function dispatch(fn) {
  try {
    const nuevo = fn(state);
    if (nuevo && nuevo !== state) {
      state = nuevo;
      persistir();
    }
    render(state);
    return true;
  } catch (err) {
    console.error(err);
    toast(err && err.message ? err.message : 'Algo salió mal.', 'error');
    return false;
  }
}

/** Reemplaza el estado completo (import / link compartido / borrar todo). */
function reemplazar(nuevo) {
  state = nuevo;
  persistir();
  render(state);
}

function persistir() {
  const r = guardar(state);
  if (!r.ok) toast(r.mensaje, 'error');
}

inicializarUI({
  T,
  dispatch,
  reemplazar,
  limpiar,
  getState: () => state,
});

window.addEventListener('hashchange', () => render(state));
if (!location.hash) location.replace('#/');
render(state);
