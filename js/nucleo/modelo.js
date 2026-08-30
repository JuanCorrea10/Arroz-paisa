// ============================================================================
//  modelo.js  -  La forma que tienen los datos y cómo se crean vacíos.
// ============================================================================

import { normalizar, aEntero } from "./formato.js";
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
  salida.unificadas = unificarEmpresa(salida);
  return salida;
}

/**
 * De dos empresas a una sola.
 *
 * Hasta ahora cada renglón traía DOS empresas: "empresaCome" (dónde comió) y
 * "empresaFactura" (a quién se le cobra). En los datos de verdad nunca fueron
 * distintas -- 1135 renglones, 1135 veces la misma -- pero la app dejaba que
 * se separaran, y eso costaba caro:
 *
 *   - Dos personas de empresas distintas no se podían unir aunque fueran la
 *     misma persona anotada dos veces.
 *   - Cada pantalla tenía que decidir cuál de las dos mirar, y equivocarse
 *     ahí no se ve: los totales salen mal en silencio.
 *
 * Ahora hay UNA sola: "empresa". Esta función traduce los datos viejos.
 *
 * Cuando las dos venían distintas manda la de cobro, NUNCA la de comer. Es la
 * regla que no cambia la plata: a esa empresa fue a la que se le pasó la
 * cuenta, y una cuenta ya entregada no se corrige sola. Se devuelve cuántos
 * eran así, para poder avisarle -- si se cambiaran calladamente, un total del
 * mes pasado cambiaría sin que nadie sepa por qué.
 */
export function unificarEmpresa(datos) {
  let renglones = 0;
  let personas = 0;

  for (const c of datos.consumos) {
    if (c.empresa !== undefined && c.empresaCome === undefined && c.empresaFactura === undefined) continue;
    const come = normalizar(c.empresaCome);
    const cobra = normalizar(c.empresaFactura);
    if (come && cobra && come !== cobra) renglones++;
    c.empresa = cobra || come || normalizar(c.empresa);
    delete c.empresaCome;
    delete c.empresaFactura;
  }

  for (const p of datos.personas) {
    if (p.empresa !== undefined && p.empresaCome === undefined && p.empresaFactura === undefined) continue;
    const come = normalizar(p.empresaCome);
    const cobra = normalizar(p.empresaFactura);
    if (come && cobra && come !== cobra) personas++;
    p.empresa = cobra || come || normalizar(p.empresa);
    delete p.empresaCome;
    delete p.empresaFactura;
  }

  return { renglones, personas };
}

// ---------------------------------------------------------------------------
//  Cambios sobre los datos.
//  Todos devuelven los datos ya modificados; ninguno guarda nada por su
//  cuenta. Guardar es tarea del almacén.
// ---------------------------------------------------------------------------

/**
 * Que los cuatro días de las quincenas tengan sentido antes de guardarlos.
 *
 * Un rango al revés ("del 14 al 3"), o una quincena 2 que arranca antes de que
 * acabe la 1, no se ve raro en el formulario: se ve raro un mes después, en
 * una cuenta de cobro ya entregada que dice un periodo que no es. Por eso esto
 * no avisa y sigue: no deja guardar.
 *
 * Devuelve los cuatro números listos, o { malo: "..." } con qué explicarle.
 */
export function revisarQuincenas(r) {
  const iQ1 = aEntero(r.primerDiaQ1, 1);
  const fQ1 = aEntero(r.ultimoDiaQ1, 15);
  const iQ2 = aEntero(r.primerDiaQ2, fQ1 + 1);
  const fQ2 = aEntero(r.ultimoDiaQ2, 31);

  const dias = [
    ["El día en que empieza la quincena 1", iQ1],
    ["El día en que acaba la quincena 1", fQ1],
    ["El día en que empieza la quincena 2", iQ2],
    ["El día en que acaba la quincena 2", fQ2],
  ];
  for (const [que, n] of dias) {
    if (!(n >= 1 && n <= 31)) return { malo: `${que} tiene que ser un día del 1 al 31.` };
  }
  if (iQ1 > fQ1) return { malo: "La quincena 1 no puede empezar después de acabarse." };
  if (iQ2 > fQ2) return { malo: "La quincena 2 no puede empezar después de acabarse." };
  if (iQ2 <= fQ1) {
    return {
      malo: `La quincena 2 empieza el ${iQ2}, que es antes de que acabe la 1 ` +
            `(el ${fQ1}). Ese día quedaría cobrado en las dos.`,
    };
  }
  return { primerDiaQ1: iQ1, ultimoDiaQ1: fQ1, primerDiaQ2: iQ2, ultimoDiaQ2: fQ2 };
}

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
    // Los cuatro días del periodo. El corte entre una quincena y otra lo sigue
    // mandando ultimoDiaQ1; los otros tres dicen qué periodo se ESCRIBE en la
    // cuenta de cobro. Ver rangoQuincena en calculos.js.
    primerDiaQ1: Number(empresa.primerDiaQ1) || 1,
    ultimoDiaQ1: Number(empresa.ultimoDiaQ1) || 15,
    primerDiaQ2: Number(empresa.primerDiaQ2) || (Number(empresa.ultimoDiaQ1) || 15) + 1,
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
  const empresa = normalizar(persona.empresa);
  if (!nombre) throw new Error("La persona necesita un nombre.");
  if (!empresa) throw new Error("Hay que decir en qué empresa come.");
  const llave = clavePersona(empresa, nombre);
  if (datos.personas.some((p) => clavePersona(p.empresa, p.nombre) === llave)) {
    throw new Error(`${nombre} ya está en ${empresa}.`);
  }
  datos.personas.push({
    nombre,
    empresa,
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
    (c) => clavePersona(c.empresa, c.persona) === llave
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
    (p) => clavePersona(p.empresa, p.nombre) !== llave
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
  fecha, empresa, persona, producto,
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
    empresa: normalizar(empresa),
    persona: normalizar(persona),
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
