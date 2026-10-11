// ============================================================================
//  clave.js  -  La clave de la dueña: qué pantallas la piden y cómo se guarda
//
//  Esto nació cuando la app dejó de ser solo de ella: ahora la usan los
//  empleados del local, en el mismo computador. Ellos anotan los pedidos; lo
//  que NO deben tocar es lo que se tira el funcionamiento -- los precios, el
//  catálogo, las personas, las empresas, los respaldos, y cuánto vende el
//  negocio.
//
//  Es UN computador y UNA clave, no un sistema de usuarios. Con un solo
//  computador y los datos guardados en él, un "inicio de sesión" con nombre y
//  contraseña sería teatro: todos entrarían a los mismos datos de todas
//  formas. Lo que de verdad hace falta es que ciertas pantallas pregunten
//  "¿es usted?" antes de abrirse, y eso es lo que hay aquí.
//
//  Qué es y qué no es:
//    - Evita que un empleado cambie un precio o borre una persona sin querer
//      o sin permiso. Para eso sirve y para eso está.
//    - NO es una caja fuerte. Quien tenga el archivo de respaldo y sepa de
//      computadores puede quitarla. Por eso la clave no se guarda tal cual
//      sino su huella: para que no quede escrita en cada respaldo que ella
//      manda por WhatsApp, no para resistir a un hacker.
//
//  Si se le olvida: Juan la quita sin perder nada (es borrar config.clave).
//  Esa salida está escrita en el manual a propósito: un estado del que no se
//  puede salir es un bug, y "la clave que nadie sabe" sería el peor de todos.
// ============================================================================

/**
 * Las que piden clave si ella no dice otra cosa.
 *
 * El criterio es el de ella: "que no toquen precios, catálogo, empleados, ni
 * cosas que se tiren el funcionamiento". Y la plata del negocio -- cuánto
 * vendió, qué le debe a los proveedores -- es de ella, no de quien anota.
 */
export const CON_CLAVE_POR_DEFECTO = [
  "catalogo", "empresas", "personas", "nombres",   // las listas
  "datos",                                          // respaldos, traer Excel, borrar todo
  "ventas", "ventasmes",                            // cuánto vende el negocio
  "compras", "pagos",                               // lo que se le debe a los proveedores
];

/**
 * Las que NUNCA piden clave, diga lo que diga la configuración.
 *
 * Es lo del día a día: si Registrar pidiera clave, la empleada no podría
 * trabajar, y la clave quedaría pegada en un papel al lado del teclado --
 * que es peor que no tener clave. Y la ayuda, la portada y Revisar son
 * para enterarse de cosas, no para cambiarlas.
 */
export const NUNCA_PIDEN = ["inicio", "registrar", "cocina", "resumen", "revisar", "ayuda"];

/** La pantalla donde se pone y se quita la clave. Pide clave siempre que haya. */
export const PANTALLA_DE_LA_CLAVE = "clave";

const LARGO_MINIMO = 4;

/** ¿Hay una clave puesta? */
export function hayClave(datos) {
  const c = datos && datos.config && datos.config.clave;
  return Boolean(c && typeof c === "object" && c.huella && c.sal);
}

/**
 * Si la clave sirve devuelve null; si no, qué le pasa, en palabras de ella.
 * Cuatro caracteres es el mínimo porque "12" se adivina mirando por encima
 * del hombro una sola vez.
 */
export function revisarClave(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return "Ingrese la clave.";
  if (t.length < LARGO_MINIMO) return `La clave debe tener al menos ${LARGO_MINIMO} caracteres.`;
  return null;
}

/** ¿Este navegador (o Node) puede sacar huellas? Fuera de https o localhost, no. */
export function sePuedeUsarClave() {
  const c = globalThis.crypto;
  return Boolean(c && c.subtle && typeof c.subtle.digest === "function" &&
                 typeof c.getRandomValues === "function");
}

const SIN_CRYPTO =
  "El navegador no permite usar claves en esta dirección. Abra la aplicación " +
  "desde la dirección publicada (https) o en este mismo computador.";

/**
 * Pone o cambia la clave. Guarda la huella, no la clave.
 * Conserva la lista de pantallas que ya tuviera.
 */
export async function ponerClave(datos, texto) {
  const malo = revisarClave(texto);
  if (malo) throw new Error(malo);
  if (!sePuedeUsarClave()) throw new Error(SIN_CRYPTO);

  const sal = salNueva();
  const huella = await huellaDe(sal, String(texto).trim());
  const anterior = (datos.config && datos.config.clave) || {};
  datos.config = datos.config || {};
  datos.config.clave = {
    sal,
    huella,
    pide: Array.isArray(anterior.pide) ? anterior.pide.slice() : CON_CLAVE_POR_DEFECTO.slice(),
  };
  return datos.config.clave;
}

/** Quita la clave del todo. Las pantallas vuelven a abrirse sin preguntar. */
export function quitarClave(datos) {
  if (datos && datos.config) delete datos.config.clave;
}

/** ¿Es esta la clave? Sin clave puesta, cualquier cosa es "sí". */
export async function esLaClave(datos, texto) {
  if (!hayClave(datos)) return true;
  if (!sePuedeUsarClave()) throw new Error(SIN_CRYPTO);
  const c = datos.config.clave;
  const huella = await huellaDe(c.sal, String(texto ?? "").trim());
  return huella === c.huella;
}

/** Las pantallas que piden clave, en la configuración o por defecto. */
export function pantallasConClave(datos) {
  const c = datos && datos.config && datos.config.clave;
  const lista = c && Array.isArray(c.pide) ? c.pide : CON_CLAVE_POR_DEFECTO;
  return lista.filter((p) => !NUNCA_PIDEN.includes(p));
}

/**
 * Cambia qué pantallas piden clave. Lo del día a día se saca aunque venga
 * en la lista: ahí no hay nada que decidir.
 */
export function ponerPantallasConClave(datos, lista) {
  if (!hayClave(datos)) throw new Error("Primero debe configurar una clave.");
  datos.config.clave.pide = [...new Set(
    (Array.isArray(lista) ? lista : []).map(String).filter((p) => p && !NUNCA_PIDEN.includes(p))
  )];
  return datos.config.clave.pide;
}

/**
 * ¿Esta pantalla pide la clave ahora mismo?
 *
 * La pantalla de la clave la pide siempre que haya una: si no, cualquiera
 * entraría y la quitaría, y la clave no serviría de nada.
 */
export function pideClave(datos, pantalla) {
  if (!hayClave(datos)) return false;
  if (pantalla === PANTALLA_DE_LA_CLAVE) return true;
  return pantallasConClave(datos).includes(pantalla);
}

// ---------------------------------------------------------------------------
//  La huella
// ---------------------------------------------------------------------------

function salNueva() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return aHex(bytes);
}

/**
 * SHA-256 de "sal:clave", repetido unas cuantas veces. La sal hace que dos
 * claves iguales dejen huellas distintas; las vueltas le cuestan algo a quien
 * quiera probar claves una por una. No es más que eso, y no pretende más.
 */
async function huellaDe(sal, texto) {
  const codificar = new TextEncoder();
  let datos = codificar.encode(`${sal}:${texto}`);
  for (let i = 0; i < 2000; i++) {
    datos = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", datos));
  }
  return aHex(datos);
}

function aHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
