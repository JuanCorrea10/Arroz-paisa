// ============================================================================
//  modelo.js  -  La forma que tienen los datos y cómo se crean vacíos.
// ============================================================================

import { normalizar } from "./formato.js";
import { clavePrecio, clavePersona } from "./calculos.js";
import { limpiarNombre } from "./nombres.js";

/** La versión del formato de los datos. Si algún día cambia, sirve para migrar. */
export const VERSION_DATOS = 1;

let contador = 0;

/** Un identificador único para cada renglón nuevo. */
export function nuevoId() {
  contador++;
  const azar =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `c${Date.now().toString(36)}-${contador}-${azar}`;
}

/** Unos datos completamente vacíos, para arrancar de ceros. */
export function datosVacios() {
  return {
    version: VERSION_DATOS,
    config: {
      anio: new Date().getFullYear(),
      mes: new Date().getMonth() + 1,
      acreedor: { nombre: "", nit: "", ciudad: "" },
    },
    empresas: [],
    productos: [],
    precios: {},
    personas: [],
    consumos: [],
    cuadres: {},
  };
}

/**
 * Revisa que unos datos que vienen de un archivo tengan la forma correcta.
 * Si alguien abre un archivo que no es el nuestro, más vale decirlo claro
 * que arrancar con medio dato y romperse después.
 */
export function validarDatos(datos) {
  const problemas = [];
  if (!datos || typeof datos !== "object") return ["El archivo no tiene datos adentro."];
  for (const lista of ["empresas", "productos", "personas", "consumos"]) {
    if (!Array.isArray(datos[lista])) problemas.push(`Falta la lista de ${lista}.`);
  }
  if (!datos.precios || typeof datos.precios !== "object") problemas.push("Faltan los precios.");
  if (!datos.config || typeof datos.config !== "object") problemas.push("Falta la configuración.");
  return problemas;
}

/** Rellena lo que falte, por si el archivo viene de una versión más vieja. */
export function completarDatos(datos) {
  const base = datosVacios();
  const salida = { ...base, ...datos };
  salida.config = { ...base.config, ...(datos.config || {}) };
  salida.config.acreedor = { ...base.config.acreedor, ...((datos.config || {}).acreedor || {}) };
  salida.cuadres = datos.cuadres || {};
  salida.precios = datos.precios || {};
  salida.version = VERSION_DATOS;
  // Todo renglón tiene que tener id y lista de revisión, sí o sí.
  for (const c of salida.consumos) {
    if (!c.id) c.id = nuevoId();
    if (!Array.isArray(c.revisar)) c.revisar = [];
  }
  return salida;
}

// ---------------------------------------------------------------------------
//  Cambios sobre los datos.
//  Todos devuelven los datos ya modificados; ninguno guarda nada por su
//  cuenta. Guardar es tarea del almacén.
// ---------------------------------------------------------------------------

export function agregarEmpresa(datos, empresa) {
  const codigo = normalizar(empresa.codigo);
  if (!codigo) throw new Error("La empresa necesita un código (por ejemplo MGP).");
  if (datos.empresas.some((e) => normalizar(e.codigo) === codigo)) {
    throw new Error(`Ya existe una empresa que se llama ${codigo}.`);
  }
  datos.empresas.push({
    codigo,
    razonSocial: (empresa.razonSocial || "").trim(),
    nit: (empresa.nit || "").trim(),
    ultimoDiaQ1: Number(empresa.ultimoDiaQ1) || 15,
    ultimoDiaQ2: Number(empresa.ultimoDiaQ2) || 31,
    activa: empresa.activa !== false,
  });
  return datos;
}

export function agregarProducto(datos, nombre, preciosPorEmpresa = {}) {
  // limpiarNombre y no normalizar: aquí llega lo que alguien ESCRIBIÓ a mano,
  // y hay que quitarle los puntos y los espacios de sobra antes de guardarlo.
  const limpio = limpiarNombre(nombre);
  if (!limpio) throw new Error("El plato necesita un nombre.");
  if (!datos.productos.some((p) => normalizar(p.nombre) === limpio)) {
    datos.productos.push({ nombre: limpio, activo: true });
  }
  for (const [empresa, valor] of Object.entries(preciosPorEmpresa)) {
    if (valor === "" || valor === null || valor === undefined) continue;
    datos.precios[clavePrecio(limpio, empresa)] = Number(valor) || 0;
  }
  return datos;
}

export function agregarPersona(datos, persona) {
  // Igual que en agregarProducto: esto viene escrito a mano, así que se limpia.
  // Ojo: el importador NO pasa por aquí, arma la lista él mismo, y por eso los
  // nombres que vienen del Excel se quedan tal cual hasta que ella los revise
  // en la pantalla "Revisar nombres". Si los limpiáramos al importar,
  // cambiarían los totales de un Excel ya cerrado, y eso no se hace solo.
  const nombre = limpiarNombre(persona.nombre);
  const empresaCome = normalizar(persona.empresaCome);
  if (!nombre) throw new Error("La persona necesita un nombre.");
  if (!empresaCome) throw new Error("Hay que decir en qué empresa come.");
  const llave = clavePersona(empresaCome, nombre);
  if (datos.personas.some((p) => clavePersona(p.empresaCome, p.nombre) === llave)) {
    throw new Error(`${nombre} ya está en ${empresaCome}.`);
  }
  datos.personas.push({
    nombre,
    empresaCome,
    empresaFactura: normalizar(persona.empresaFactura) || empresaCome,
    activa: persona.activa !== false,
    // Del documento se guardan solo los ultimos 5 digitos, y solo si lo dieron.
    // Ver ultimos5() en personal.js para el porque.
    documento: soloDigitos(persona.documento).slice(-5),
  });
  return datos;
}

/** Deja solo los numeros de lo que hayan escrito: "CC 1.110.583.077" -> digitos */
function soloDigitos(txt) {
  return String(txt || "").replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
//  Borrar
//
//  La regla es una sola y no tiene excepciones:
//
//      lo que tiene historia NO se borra, se APAGA.
//
//  Si se borrara una persona que ya comió, sus renglones quedarían apuntando
//  a alguien que no existe: la cuenta de cobro seguiría bien (el precio está
//  congelado en cada renglón), pero la app no sabría de quién es ese consumo
//  y saldría en "Posibles errores" para siempre.
//
//  Apagar hace lo que ella quiere de verdad: sacarla de las listas para que
//  no estorbe al buscar, sin perder lo que ya pasó.
// ---------------------------------------------------------------------------

/** ¿Se puede borrar del todo, o solo apagar? Dice cuántos renglones la atan. */
export function puedeBorrarPersona(datos, codigoEmpresa, nombre) {
  const llave = clavePersona(codigoEmpresa, nombre);
  const renglones = datos.consumos.filter(
    (c) => clavePersona(c.empresaCome, c.persona) === llave
  ).length;
  return { puede: renglones === 0, renglones };
}

export function borrarPersona(datos, codigoEmpresa, nombre) {
  const { puede, renglones } = puedeBorrarPersona(datos, codigoEmpresa, nombre);
  if (!puede) {
    throw new Error(
      `${normalizar(nombre)} tiene ${renglones} renglones registrados, así que no ` +
      `se puede borrar sin dejarlos huérfanos. Apáguela: sale de las listas y ` +
      `lo ya cobrado se queda como está.`
    );
  }
  const llave = clavePersona(codigoEmpresa, nombre);
  const antes = datos.personas.length;
  datos.personas = datos.personas.filter(
    (p) => clavePersona(p.empresaCome, p.nombre) !== llave
  );
  return { borradas: antes - datos.personas.length };
}

/** Lo mismo para un plato. Además hay que quitarle sus precios. */
export function puedeBorrarProducto(datos, nombre) {
  const limpio = normalizar(nombre);
  const renglones = datos.consumos.filter((c) => normalizar(c.producto) === limpio).length;
  return { puede: renglones === 0, renglones };
}

export function borrarProducto(datos, nombre) {
  const limpio = normalizar(nombre);
  const { puede, renglones } = puedeBorrarProducto(datos, nombre);
  if (!puede) {
    throw new Error(
      `"${limpio}" está en ${renglones} renglones registrados, así que no se ` +
      `puede borrar. Apáguelo: deja de salir al anotar y lo ya cobrado no cambia.`
    );
  }
  const antes = datos.productos.length;
  datos.productos = datos.productos.filter((p) => normalizar(p.nombre) !== limpio);

  // Los precios también se van: si no, quedarían ocupando espacio para siempre
  // y reaparecerían solos si alguien vuelve a crear un plato con ese nombre.
  let precios = 0;
  for (const llave of Object.keys(datos.precios)) {
    if (llave.startsWith(limpio + "|")) { delete datos.precios[llave]; precios++; }
  }
  return { borrados: antes - datos.productos.length, precios };
}

/**
 * Crea un renglón de consumo dejando el precio CONGELADO.
 * Este es el único sitio donde nace un consumo, para que no haya dos maneras
 * distintas de hacerlo (que es como se cuelan los bugs).
 */
export function nuevoConsumo({
  fecha, empresaCome, persona, empresaFactura, producto,
  cantidad, precioUnitario, facturable = true, observacion = "",
}) {
  const revisar = [];
  const precio = Number(precioUnitario) || 0;
  const cant = Number(cantidad) || 0;
  if (facturable !== false && precio <= 0) revisar.push("SIN_PRECIO");
  if (cant <= 0) revisar.push("SIN_CANTIDAD");
  return {
    id: nuevoId(),
    fecha,
    empresaCome: normalizar(empresaCome),
    persona: normalizar(persona),
    empresaFactura: normalizar(empresaFactura) || normalizar(empresaCome),
    producto: normalizar(producto),
    cantidad: cant,
    precioUnitario: precio,
    facturable: facturable !== false,
    observacion: String(observacion || "").trim(),
    revisar,
  };
}


/**
 * Le pone el mismo precio a un plato en todas las empresas.
 *
 * Es la operación normal: en los datos de verdad ningún plato cuesta distinto
 * según la fábrica. Antes había que escribirlo cuatro veces.
 *
 * Un precio en blanco borra el precio (queda "sin precio"), que NO es lo
 * mismo que cero: sin precio la app avisa, y en cero cobraría $ 0 calladita.
 */
export function ponerPrecioEnTodas(datos, nombrePlato, codigos, valor) {
  const limpio = valor === null || valor === undefined || valor === ""
    ? null
    : Math.max(0, Math.round(Number(valor) || 0));

  for (const codigo of codigos) {
    const llave = clavePrecio(nombrePlato, codigo);
    if (limpio === null) delete datos.precios[llave];
    else datos.precios[llave] = limpio;
  }
  return limpio;
}
