// ============================================================================
//  rapidos.js  -  Los botones rápidos que ella escoge para anotar
//
//  En cada pedido ya salían, a un toque, los platos más pedidos de la empresa.
//  Esos los calcula la app sola, y por eso nunca traían lo que de verdad se
//  vende HOY: el plato especial del día no tiene historia, así que no aparece
//  entre los más pedidos justo el día en que todos lo piden.
//
//  Aquí van los que escoge ella:
//    - los de HOY: el menú especial de ese día. Se guardan por fecha, así que
//      mañana arrancan vacíos sin que nadie tenga que borrarlos.
//    - los de SIEMPRE: los que quiere tener a mano todos los días aunque no
//      estén entre los más pedidos (el jugo, la gaseosa de la casa).
//
//  Se guardan en datos.rapidos = { siempre: [...], "2026-10-19": [...] }.
//  Un solo mapa para los dos, que en la nube es una colección más.
//
//  Este archivo solo importa formato.js a propósito: modelo.js y sueltos.js lo
//  usan al borrar, renombrar o unir platos, y si importara calculos.js se
//  armaría un círculo de importaciones.
// ============================================================================

import { normalizar, esFechaISO } from "./formato.js";

export const SIEMPRE = "siempre";

/** Cuántos caben en cada lista. Más de esto deja de ser "a la mano". */
export const MAXIMO = 6;

function laLlave(cual) {
  if (cual === SIEMPRE) return SIEMPRE;
  if (esFechaISO(cual)) return cual;
  throw new Error("Los botones rápidos son de un día o de siempre.");
}

/** Lo guardado tal cual, sin mirar si los platos siguen existiendo. */
export function rapidosGuardados(datos, cual) {
  const lista = datos && datos.rapidos && datos.rapidos[laLlave(cual)];
  return Array.isArray(lista) ? lista.map(normalizar).filter(Boolean) : [];
}

/**
 * Los de un día (o de siempre), separados en los que se pueden usar y los que
 * no: un plato que se borró o se apagó no puede seguir saliendo como botón,
 * pero tampoco puede desaparecer callado -- ella lo puso ahí y lo va a buscar.
 */
export function rapidosDe(datos, cual) {
  const activos = new Map(
    (datos.productos || [])
      .filter((p) => String(p.nombre || "").trim() !== "")
      .map((p) => [normalizar(p.nombre), p])
  );
  const validos = [];
  const perdidos = [];
  for (const nombre of rapidosGuardados(datos, cual)) {
    const p = activos.get(nombre);
    if (!p) perdidos.push({ producto: nombre, porque: "ya no está en el catálogo" });
    else if (p.activo === false) perdidos.push({ producto: nombre, porque: "está apagado" });
    else validos.push(nombre);
  }
  return { validos, perdidos };
}

/**
 * Pone la lista de un día (o la de siempre). Revisa que cada plato exista y
 * esté prendido, quita repetidos y no deja pasar de MAXIMO. Una lista vacía
 * borra la llave, para que los días sin especiales no ocupen nada.
 */
export function ponerRapidos(datos, cual, lista) {
  const llave = laLlave(cual);
  const existen = new Map(
    (datos.productos || []).map((p) => [normalizar(p.nombre), p]));
  const limpia = [];
  for (const nombre of (Array.isArray(lista) ? lista : []).map(normalizar).filter(Boolean)) {
    if (limpia.includes(nombre)) continue;
    const p = existen.get(nombre);
    if (!p) throw new Error(`"${nombre}" no está en el catálogo.`);
    if (p.activo === false) throw new Error(`"${nombre}" está apagado. Préndalo en Platos para usarlo.`);
    limpia.push(nombre);
  }
  if (limpia.length > MAXIMO) {
    throw new Error(`Caben hasta ${MAXIMO} botones. Quite alguno antes de poner otro.`);
  }
  if (!datos.rapidos || typeof datos.rapidos !== "object") datos.rapidos = {};
  if (limpia.length) datos.rapidos[llave] = limpia;
  else delete datos.rapidos[llave];
  return limpia;
}

/**
 * El último día ANTES de esta fecha que tuvo platos de hoy, para ofrecer
 * "los mismos del lunes" de un toque. Solo cuenta si alguno sigue existiendo.
 */
export function ultimosDeHoy(datos, antesDe) {
  const fechas = Object.keys((datos && datos.rapidos) || {})
    .filter((f) => esFechaISO(f) && f < antesDe)
    .sort()
    .reverse();
  for (const fecha of fechas) {
    const { validos } = rapidosDe(datos, fecha);
    if (validos.length) return { fecha, platos: validos };
  }
  return null;
}

/** Al renombrar o unir un plato, sus botones se van con él. */
export function renombrarEnRapidos(datos, viejo, nuevo) {
  if (!datos || !datos.rapidos) return 0;
  const v = normalizar(viejo);
  const n = normalizar(nuevo);
  let cambiados = 0;
  for (const llave of Object.keys(datos.rapidos)) {
    const lista = datos.rapidos[llave];
    if (!Array.isArray(lista) || !lista.map(normalizar).includes(v)) continue;
    const nueva = [];
    for (const nombre of lista.map(normalizar)) {
      const queda = nombre === v ? n : nombre;
      if (!nueva.includes(queda)) nueva.push(queda);
    }
    datos.rapidos[llave] = nueva;
    cambiados++;
  }
  return cambiados;
}

/** Al borrar un plato, sale de todos los botones. */
export function quitarDeRapidos(datos, nombre) {
  if (!datos || !datos.rapidos) return 0;
  const v = normalizar(nombre);
  let cambiados = 0;
  for (const llave of Object.keys(datos.rapidos)) {
    const lista = datos.rapidos[llave];
    if (!Array.isArray(lista) || !lista.map(normalizar).includes(v)) continue;
    const nueva = lista.map(normalizar).filter((x) => x !== v);
    if (nueva.length) datos.rapidos[llave] = nueva;
    else delete datos.rapidos[llave];
    cambiados++;
  }
  return cambiados;
}
