// ============================================================================
//  habitos.js  -  Lo que la gente pide SIEMPRE.
//
//  Este archivo existe por un número: de los 896 pedidos de agosto, el 61 %
//  es exactamente lo que esa misma persona pide todos los días. Y un solo
//  plato, el ALMUERZO, es el 37 % de todo.
//
//  O sea que más de la mitad del trabajo diario es volver a escribir lo mismo.
//  Aquí no se inventa nada: se mira lo que ya está registrado y se ofrece de
//  un toque. Ella siempre puede cambiarlo, pero en la mayoría de los días no
//  va a tener que buscar ni escribir nada.
//
//  Es PURO como los demás del núcleo: recibe datos y devuelve datos.
// ============================================================================

import { normalizar } from "./formato.js";
import { clavePersona, clavePrecio, precioDe } from "./calculos.js";

/**
 * La "firma" de un pedido: qué pidió y cuánto, sin importar el orden en que
 * lo anotó. Almuerzo + gaseosa da lo mismo que gaseosa + almuerzo.
 *
 * Se arma con JSON y no pegando textos con un separador, porque cualquier
 * separador que uno escoja algún día va a aparecer dentro del nombre de un
 * plato y ahí se daña todo en silencio. JSON no tiene ese problema y además
 * se puede leer cuando toque depurar.
 */
function firmaDePedido(renglones) {
  const platos = renglones
    .map((r) => [normalizar(r.producto), Number(r.cantidad) || 0])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return JSON.stringify(platos);
}

function desdeFirma(firma) {
  if (!firma) return [];
  return JSON.parse(firma).map(([producto, cantidad]) => ({
    producto,
    cantidad: cantidad || 1,
  }));
}

/**
 * Lo que esta persona pide habitualmente.
 *
 * Se excluye el día que se está registrando, por dos razones: para que lo que
 * ella acaba de anotar hoy no se cuente como "costumbre", y para que el botón
 * no le ofrezca repetir algo que ya está en la pantalla.
 *
 * Devuelve null si no hay suficiente historia, o:
 *   { platos: [{producto, cantidad}], veces, dias, seguridad }
 *
 * "seguridad" va de 0 a 1: qué tanto de sus días pidió exactamente eso.
 */
export function pedidoHabitual(datos, codigoEmpresa, nombrePersona, fechaExcluida = null) {
  const empresa = normalizar(codigoEmpresa);
  const persona = normalizar(nombrePersona);
  const llave = clavePersona(empresa, persona);

  const porDia = new Map();
  for (const c of datos.consumos) {
    if (clavePersona(c.empresa, c.persona) !== llave) continue;
    if (fechaExcluida && c.fecha === fechaExcluida) continue;
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, []);
    porDia.get(c.fecha).push(c);
  }
  if (!porDia.size) return null;

  const cuantas = new Map();
  for (const renglones of porDia.values()) {
    const firma = firmaDePedido(renglones);
    cuantas.set(firma, (cuantas.get(firma) || 0) + 1);
  }

  let mejorFirma = null;
  let mejorVeces = 0;
  for (const [firma, veces] of cuantas) {
    if (veces > mejorVeces) { mejorFirma = firma; mejorVeces = veces; }
  }

  const dias = porDia.size;
  return {
    platos: desdeFirma(mejorFirma),
    veces: mejorVeces,
    dias,
    seguridad: mejorVeces / dias,
  };
}

/**
 * ¿Vale la pena ofrecerle "lo de siempre"?
 *
 * Con un solo día no hay costumbre que valga: sería ofrecerle repetir un
 * antojo. Pedimos dos días iguales, o que la mayoría de sus días sean eso.
 */
export function tieneCostumbre(habito) {
  if (!habito || !habito.platos.length) return false;
  if (habito.veces >= 2) return true;
  return habito.dias === 1; // solo vino un día: igual sirve como atajo
}

/**
 * Los platos que más se piden en esta empresa, para tenerlos a un toque.
 *
 * Se miran solo los últimos días, no todo el historial: si cambia la carta,
 * los botones tienen que cambiar solos. Se excluyen los que no tienen precio,
 * porque ofrecer de un toque algo que entra en $ 0 sería empujarla al error.
 */
export function platosFrecuentes(datos, codigoEmpresa, {
  limite = 6,
  desdeFecha = null,
} = {}) {
  // Antes recibía aparte "a qué empresa se le factura", para buscar el precio
  // con esa. Ya no: la empresa es una sola.
  const empresa = normalizar(codigoEmpresa);

  const activos = new Set(
    datos.productos.filter((p) => p.activo !== false).map((p) => normalizar(p.nombre))
  );

  const cuantas = new Map();
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== empresa) continue;
    if (desdeFecha && c.fecha < desdeFecha) continue;
    const plato = normalizar(c.producto);
    if (!activos.has(plato)) continue;
    cuantas.set(plato, (cuantas.get(plato) || 0) + 1);
  }

  return [...cuantas.entries()]
    .map(([producto, veces]) => ({
      producto,
      veces,
      precio: precioDe(datos, producto, empresa),
    }))
    .filter((p) => p.precio !== null && p.precio > 0)
    .sort((a, b) => b.veces - a.veces || a.producto.localeCompare(b.producto, "es"))
    .slice(0, limite);
}

/**
 * Quiénes comieron el día anterior en esta empresa, con lo que pidieron.
 *
 * Sirve para "los mismos de ayer": en una fábrica come casi siempre la misma
 * gente, así que arrancar el día con la lista de ayer y solo quitar a los que
 * faltaron es mucho más rápido que buscarlos uno por uno.
 */
export function loDelDiaAnterior(datos, codigoEmpresa, fechaActual) {
  const empresa = normalizar(codigoEmpresa);

  // El día hábil anterior CON registros, no el de ayer en el calendario: si
  // ayer fue domingo no hay nada, y el sábado tampoco. Buscamos hacia atrás.
  const dias = [...new Set(
    datos.consumos
      .filter((c) => normalizar(c.empresa) === empresa && c.fecha < fechaActual)
      .map((c) => c.fecha)
  )].sort();

  const anterior = dias[dias.length - 1];
  if (!anterior) return null;

  const porPersona = new Map();
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== empresa || c.fecha !== anterior) continue;
    const persona = normalizar(c.persona);
    if (!porPersona.has(persona)) porPersona.set(persona, []);
    // A proposito NO se copia como se pago.
    //
    // Si ayer alguien pago en efectivo y hoy se trae "lo de ayer", copiar el
    // pago dejaria marcado como pagado un almuerzo que nadie pago: la plata se
    // pierde y nadie se entera. La costumbre es QUE come, no COMO lo pago ese
    // dia. Lo de hoy nace a credito y ella marca si alguien paga.
    porPersona.get(persona).push({
      producto: normalizar(c.producto),
      cantidad: Number(c.cantidad) || 1,
      precioUnitario: Number(c.precioUnitario) || 0,
    });
  }

  const gente = [...porPersona.entries()]
    .map(([persona, platos]) => ({ persona, platos }))
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));

  return { fecha: anterior, gente };
}

/** Quiénes ya tienen algo anotado hoy, para no ofrecerlos otra vez. */
export function yaAnotadasHoy(datos, codigoEmpresa, fecha) {
  const empresa = normalizar(codigoEmpresa);
  const nombres = new Set();
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) === empresa && c.fecha === fecha) {
      nombres.add(normalizar(c.persona));
    }
  }
  return nombres;
}

/** Cuánto valdría un pedido, con los precios de hoy de esa empresa. */
export function cuantoValdria(datos, platos, empresa) {
  const cod = normalizar(empresa);
  let total = 0;
  let faltaPrecio = false;
  for (const p of platos) {
    const precio = datos.precios[clavePrecio(p.producto, cod)];
    if (!Number.isFinite(precio) || precio <= 0) faltaPrecio = true;
    else total += precio * (Number(p.cantidad) || 1);
  }
  return { total, faltaPrecio };
}
