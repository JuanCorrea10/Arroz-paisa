// ============================================================================
//  estado.js  -  Lo que la app "tiene en la cabeza" en este momento.
//
//  Está aparte de app.js a propósito: así las pantallas pueden usarlo sin
//  tener que conocerse entre ellas.
// ============================================================================

import { datosVacios } from "../nucleo/modelo.js";
import { indicePorCodigo } from "../nucleo/calculos.js";
import { hoyISO } from "../nucleo/formato.js";
import * as almacen from "../datos/almacen.js";

export const estado = {
  datos: datosVacios(),
  /** El día que se está registrando. */
  fecha: hoyISO(),
  /** La empresa elegida en la pantalla de registrar. */
  empresa: null,
  /** Mes y año de los informes. */
  anio: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
};

const oyentes = new Set();

/** Avisa cuando los datos cambian, para volver a pintar la pantalla. */
export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/**
 * Se llama DESPUÉS de tocar los datos. Hace dos cosas y siempre las dos:
 * guarda y vuelve a pintar. Si alguna pantalla se olvidara de llamarla,
 * el cambio se vería pero no se guardaría, y eso es exactamente el bug
 * que estamos tratando de hacer imposible.
 */
export function cambio() {
  almacen.guardar(estado.datos);
  for (const fn of oyentes) fn();
}

export function empresas() {
  return estado.datos.empresas.filter((e) => e.activa !== false);
}

export function empresaPorCodigo(codigo) {
  return indicePorCodigo(estado.datos.empresas)[String(codigo || "").toUpperCase()] || null;
}

export function empresaActual() {
  return empresaPorCodigo(estado.empresa);
}

/** La empresa que debería estar elegida: la que ya estaba, o la primera. */
export function asegurarEmpresa() {
  const lista = empresas();
  if (!lista.length) { estado.empresa = null; return null; }
  if (!estado.empresa || !lista.some((e) => e.codigo === estado.empresa)) {
    estado.empresa = lista[0].codigo;
  }
  return empresaActual();
}

/** Pone el mes y el año de los informes a partir de lo que traiga la config. */
export function sincronizarPeriodo() {
  const c = estado.datos.config || {};
  if (c.anio) estado.anio = Number(c.anio);
  if (c.mes) estado.mes = Number(c.mes);
}

export function cambiarPeriodo(anio, mes) {
  estado.anio = Number(anio);
  estado.mes = Number(mes);
  estado.datos.config.anio = estado.anio;
  estado.datos.config.mes = estado.mes;
  cambio();
}
