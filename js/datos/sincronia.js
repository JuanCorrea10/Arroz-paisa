// ============================================================================
//  sincronia.js  -  Cómo se parte "el archivo entero" en renglones para la nube
//
//  La app trabaja con UN objeto (estado.datos) y, cada vez que algo cambia,
//  guarda el objeto entero. Eso sirve para un solo computador. Con dos, el
//  último que guarda pisa al otro, y pisa callado.
//
//  En la nube cada renglón es un documento aparte: un consumo, una persona,
//  un plato, un precio. Así dos personas pueden anotar al mismo tiempo sin
//  pisarse, porque cada una escribe SUS renglones y no el archivo entero.
//
//  Para no tocar las 25 pantallas -- que siguen mutando estado.datos y
//  llamando cambio() --, aquí se calcula la DIFERENCIA entre cómo estaba el
//  objeto la última vez que se guardó y cómo está ahora, y esa diferencia es
//  lo que se manda: "este consumo cambió", "este precio ya no está". Y al
//  revés: lo que llega de la nube se APLICA sobre el objeto, renglón por
//  renglón, sin reemplazarlo entero.
//
//  Todo esto es puro (datos entran, datos salen) y corre en Node, para poder
//  probarlo sin Firebase ni navegador. Lo que habla con Firebase está en
//  nube.js.
// ============================================================================

import { clavePersona } from "../nucleo/calculos.js";
import { normalizar } from "../nucleo/formato.js";


/**
 * Qué listas y mapas del objeto se sincronizan, y cómo se identifica cada
 * renglón. La llave tiene que ser ESTABLE: dos computadores tienen que llegar
 * al mismo documento para el mismo renglón.
 *
 *   lista   un arreglo de objetos; cada uno es un documento.
 *   mapa    un objeto { llave: valor }; cada llave es un documento { valor }.
 *   unico   un solo documento con algunos campos del objeto.
 *
 * "cuadres" no está: ya no lo usa nadie (quedó de la pantalla Cuadre, que se
 * fue), y lo que no se usa no se sube.
 */
export const COLECCIONES = {
  consumos:  { tipo: "lista", llave: (c) => String(c.id) },
  personas:  { tipo: "lista", llave: (p) => clavePersona(p.empresa, p.nombre) },
  productos: { tipo: "lista", llave: (p) => normalizar(p.nombre) },
  empresas:  { tipo: "lista", llave: (e) => normalizar(e.codigo) },
  compras:   { tipo: "lista", llave: (c) => String(c.id) },
  precios:   { tipo: "mapa" },
  apodos:    { tipo: "mapa" },
  // El mes y el año que se están mirando son de CADA computador: si se
  // subieran, cambiar el mes en uno le cambiaría la pantalla al otro.
  config:    { tipo: "unico", campos: ["acreedor", "clave"] },
};

/** El documento único de la configuración. */
export const DOC_CONFIG = "general";

// ---------------------------------------------------------------------------
//  Identificadores de documento
// ---------------------------------------------------------------------------

/**
 * La llave de un renglón, vuelta identificador de documento.
 *
 * Firestore no acepta "/" en un identificador, ni "." ni ".." a secas, ni
 * nombres entre dobles guiones bajos. Un plato se puede llamar "1/2 POLLO".
 * Se codifica como en una dirección web, que es reversible y solo deja
 * letras, números y - _ . ! ~ * ' ( ).
 */
export function idDeDoc(llave) {
  const id = encodeURIComponent(String(llave));
  if (id === "." || id === ".." || /^__.*__$/.test(id)) return "%" + id;
  return id;
}

export function llaveDeDoc(id) {
  const crudo = String(id);
  return decodeURIComponent(crudo.startsWith("%.") || crudo.startsWith("%__") ? crudo.slice(1) : crudo);
}

// ---------------------------------------------------------------------------
//  Comparar renglones
// ---------------------------------------------------------------------------

/**
 * Un renglón en forma de texto, SIEMPRE igual para el mismo contenido:
 * llaves ordenadas, sin los campos que empiezan por "_" (los sellos de
 * quién y cuándo, que pone la nube y no son parte del dato) y sin valores
 * undefined (Firestore no los acepta y JSON los bota).
 */
export function canonico(valor) {
  return JSON.stringify(limpio(valor));
}

/** Copia sin undefined, sin campos "_" y con las llaves ordenadas. */
export function limpio(valor) {
  if (Array.isArray(valor)) return valor.map((v) => (v === undefined ? null : limpio(v)));
  if (valor && typeof valor === "object") {
    const salida = {};
    for (const k of Object.keys(valor).sort()) {
      if (k.startsWith("_") || valor[k] === undefined) continue;
      salida[k] = limpio(valor[k]);
    }
    return salida;
  }
  return valor;
}

/** Los sellos de un renglón: quién lo tocó y cuándo, si la nube los puso. */
export function sellosDe(objeto) {
  const sellos = {};
  for (const k of Object.keys(objeto || {})) if (k.startsWith("_")) sellos[k] = objeto[k];
  return sellos;
}

// ---------------------------------------------------------------------------
//  La instantánea: cómo estaba cada documento la última vez
// ---------------------------------------------------------------------------

/**
 * Recorre el objeto y devuelve { coleccion: Map(id -> texto canónico) }.
 * Es lo que se guarda para saber, la próxima vez, qué cambió.
 */
export function instantanea(datos) {
  const foto = {};
  for (const [nombre, def] of Object.entries(COLECCIONES)) {
    foto[nombre] = new Map();
    for (const [id, doc] of documentosDe(datos, nombre, def)) foto[nombre].set(id, canonico(doc));
  }
  return foto;
}

/** Los documentos de una colección tal como están ahora: [id, doc]. */
function* documentosDe(datos, nombre, def) {
  if (def.tipo === "lista") {
    for (const elemento of datos[nombre] || []) {
      if (!elemento || typeof elemento !== "object") continue;
      const llave = def.llave(elemento);
      if (!llave) continue;
      yield [idDeDoc(llave), elemento];
    }
  } else if (def.tipo === "mapa") {
    for (const [llave, valor] of Object.entries(datos[nombre] || {})) {
      yield [idDeDoc(llave), { valor }];
    }
  } else if (def.tipo === "unico") {
    const doc = {};
    for (const campo of def.campos) if (datos[nombre] && datos[nombre][campo] !== undefined) doc[campo] = datos[nombre][campo];
    yield [DOC_CONFIG, doc];
  }
}

/**
 * Qué cambió entre la instantánea y el objeto de ahora.
 *
 * Devuelve { cambios, instantanea }: la lista de escrituras y la foto nueva,
 * para guardarla como "la última vez". Cada cambio es
 *   { coleccion, id, accion: "poner", doc }   o   { coleccion, id, accion: "quitar" }.
 */
export function diferencias(foto, datos) {
  const cambios = [];
  const nueva = {};
  for (const [nombre, def] of Object.entries(COLECCIONES)) {
    const antes = (foto && foto[nombre]) || new Map();
    const ahora = new Map();
    for (const [id, doc] of documentosDe(datos, nombre, def)) {
      const texto = canonico(doc);
      ahora.set(id, texto);
      if (antes.get(id) !== texto) cambios.push({ coleccion: nombre, id, accion: "poner", doc: limpio(doc) });
    }
    for (const id of antes.keys()) {
      if (!ahora.has(id)) cambios.push({ coleccion: nombre, id, accion: "quitar" });
    }
    nueva[nombre] = ahora;
  }
  return { cambios, instantanea: nueva };
}

/** Parte una lista de cambios en lotes (Firestore acepta 500 por lote). */
export function enLotes(cambios, tamano = 500) {
  const lotes = [];
  for (let i = 0; i < cambios.length; i += tamano) lotes.push(cambios.slice(i, i + tamano));
  return lotes;
}

// ---------------------------------------------------------------------------
//  Aplicar lo que llega de la nube
// ---------------------------------------------------------------------------

/**
 * Mete en el objeto lo que llegó: renglón por renglón, sin reemplazarlo
 * entero. Devuelve cuántos renglones cambiaron DE VERDAD: el eco de lo que
 * uno mismo acaba de escribir vuelve igual (con sus sellos) y no cuenta, para
 * no repintar la pantalla por nada.
 *
 * Si se le pasa la instantánea, la deja al día: si no, el próximo guardado
 * creería que esos renglones los cambió este computador y los volvería a
 * mandar.
 */
export function aplicar(datos, cambios, foto = null) {
  let cambiados = 0;
  for (const cambio of cambios || []) {
    const def = COLECCIONES[cambio.coleccion];
    if (!def) continue;
    const huboCambio = def.tipo === "lista" ? aplicarEnLista(datos, cambio, def)
      : def.tipo === "mapa" ? aplicarEnMapa(datos, cambio)
      : aplicarEnUnico(datos, cambio, def);
    if (huboCambio) cambiados++;

    if (foto) {
      if (!foto[cambio.coleccion]) foto[cambio.coleccion] = new Map();
      if (cambio.accion === "quitar") foto[cambio.coleccion].delete(cambio.id);
      else foto[cambio.coleccion].set(cambio.id, canonico(cambio.doc));
    }
  }
  return { cambiados };
}

function aplicarEnLista(datos, cambio, def) {
  const lista = datos[cambio.coleccion] || (datos[cambio.coleccion] = []);
  const i = lista.findIndex((e) => e && typeof e === "object" && idDeDoc(def.llave(e)) === cambio.id);

  if (cambio.accion === "quitar") {
    if (i < 0) return false;
    lista.splice(i, 1);
    return true;
  }
  const doc = cambio.doc || {};
  if (i < 0) {
    lista.push({ ...doc });
    return true;
  }
  const actual = lista[i];
  if (canonico(actual) === canonico(doc)) {
    // Es el eco de lo nuestro: solo se recogen los sellos (quién, cuándo).
    Object.assign(actual, sellosDe(doc));
    return false;
  }
  lista[i] = { ...doc };
  return true;
}

function aplicarEnMapa(datos, cambio) {
  const mapa = datos[cambio.coleccion] || (datos[cambio.coleccion] = {});
  const llave = llaveDeDoc(cambio.id);
  if (cambio.accion === "quitar") {
    if (!(llave in mapa)) return false;
    delete mapa[llave];
    return true;
  }
  const valor = cambio.doc ? cambio.doc.valor : undefined;
  if (canonico(mapa[llave]) === canonico(valor)) return false;
  mapa[llave] = valor;
  return true;
}

function aplicarEnUnico(datos, cambio, def) {
  if (cambio.accion === "quitar") return false; // la configuración no se borra
  const objeto = datos[cambio.coleccion] || (datos[cambio.coleccion] = {});
  let hubo = false;
  for (const campo of def.campos) {
    if (!cambio.doc || !(campo in cambio.doc)) continue;
    if (canonico(objeto[campo]) === canonico(cambio.doc[campo])) continue;
    objeto[campo] = cambio.doc[campo];
    hubo = true;
  }
  return hubo;
}

/**
 * Arma un objeto de datos completo a partir de los documentos de la nube
 * (lo que se recibe la primera vez). "base" es un datosVacios() o parecido.
 */
export function armarDesdeDocumentos(base, documentos) {
  const cambios = [];
  for (const [coleccion, docs] of Object.entries(documentos || {})) {
    for (const [id, doc] of Object.entries(docs || {})) {
      cambios.push({ coleccion, id, accion: "poner", doc });
    }
  }
  aplicar(base, cambios);
  return base;
}
