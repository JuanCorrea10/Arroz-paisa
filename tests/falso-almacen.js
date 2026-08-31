// ============================================================================
//  falso-almacen.js  -  Un almacén de mentiras, solo para probar-carpeta.html
//
//  Existe por una razón muy concreta: el estado "la carpeta está ahí pero el
//  navegador volvió a pedir permiso" NO se puede provocar a voluntad. Lo hace
//  el navegador cuando se cierra y se vuelve a abrir, y no hay forma de pedirle
//  que lo haga ya. Sin este archivo, esa rama de la pantalla no se puede MIRAR
//  nunca -- y es justo la rama que, si sale mal, deja los respaldos sin
//  actualizar en silencio.
//
//  probar-carpeta.html lo mete en el lugar del almacén de verdad con un
//  importmap, así que la pantalla que se ve es la de verdad, con el CSS de
//  verdad. Lo único fingido es en qué quedó la carpeta.
// ============================================================================

let comoQuedo = new URLSearchParams(location.search).get("estado") || "sin-carpeta";

export function estadoDeLaCarpeta() {
  return {
    estado: comoQuedo,
    nombre: comoQuedo === "sin-carpeta" ? null : "Arroz Paisa - datos",
  };
}

export function soportaCarpeta() { return comoQuedo !== "no-soportado"; }
export function hayCarpeta() { return comoQuedo === "conectada"; }
export function nombreCarpeta() { return hayCarpeta() ? "Arroz Paisa - datos" : null; }

export async function reconectarCarpeta() {
  // Con "&da=no" se prueba el otro final: que el navegador diga que no.
  const da = new URLSearchParams(location.search).get("da") !== "no";
  comoQuedo = da ? "conectada" : "necesita-permiso";
  return { estado: comoQuedo, nombre: "Arroz Paisa - datos" };
}

export async function elegirCarpeta() {
  comoQuedo = "conectada";
  return "Arroz Paisa - datos";
}

// Lo que le piden al almacén y aquí no tiene nada que hacer.
//
// La lista tiene que estar COMPLETA: un módulo ES no se carga si le falta un
// solo export de los que alguien le importa por nombre, así que faltar uno no
// se ve como un botón raro sino como la página entera en blanco. Para
// refrescarla, buscar quién importa almacen.js en todo js/.
export async function guardar() {}
export async function guardarYa() {}
export async function cargar() { return { datos: null, origen: "ninguno" }; }
export async function descargarRespaldo() {}
export async function leerRespaldo() { return null; }
export async function borrarTodoDelNavegador() {}
export function alGuardar() { return () => {}; }
export function descargarBlob() {}
export async function semillaInicial() { return null; }
