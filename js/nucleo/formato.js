// ============================================================================
//  formato.js  —  Cómo se ve la plata, las fechas y los textos.
//  Este archivo es PURO: no toca la pantalla, no guarda nada, solo transforma
//  datos en texto. Por eso es facilísimo de probar.
// ============================================================================

/** Convierte 11075000 en "$ 11.075.000" (pesos colombianos, sin centavos). */
export function pesos(valor) {
  const n = Number(valor) || 0;
  const signo = n < 0 ? "-" : "";
  const entero = Math.round(Math.abs(n)).toString();
  // Metemos un punto cada 3 dígitos, empezando por la derecha.
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$ ${conPuntos}`;
}

/** Igual que pesos() pero sin el símbolo: 11075000 -> "11.075.000" */
export function numero(valor) {
  return pesos(valor).replace("$ ", "");
}

/**
 * Fechas. Adentro SIEMPRE las guardamos como texto "AAAA-MM-DD".
 * Nunca como objeto Date, porque Date arrastra zona horaria y ese es
 * justo el bug #1 del Excel (fechas que se corrían o entraban como texto).
 */
export function esFechaISO(txt) {
  return typeof txt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(txt);
}

/** "2026-08-20" -> 20 */
export function diaDe(fechaISO) {
  return Number(fechaISO.slice(8, 10));
}
/** "2026-08-20" -> 8 */
export function mesDe(fechaISO) {
  return Number(fechaISO.slice(5, 7));
}
/** "2026-08-20" -> 2026 */
export function anioDe(fechaISO) {
  return Number(fechaISO.slice(0, 4));
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
               "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-08-20" -> "jueves 20 de agosto de 2026" */
export function fechaLarga(fechaISO) {
  if (!esFechaISO(fechaISO)) return "";
  const [a, m, d] = fechaISO.split("-").map(Number);
  // Usamos UTC para que no se corra un día por la zona horaria.
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]} de ${a}`;
}

/** "2026-08-20" -> "20/08/2026" */
export function fechaCorta(fechaISO) {
  if (!esFechaISO(fechaISO)) return "";
  const [a, m, d] = fechaISO.split("-");
  return `${d}/${m}/${a}`;
}

/** 8 -> "Agosto" */
export function nombreMes(mes) {
  const n = MESES[mes - 1] || "";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Cuántos días tiene ese mes (respeta años bisiestos). */
export function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Fecha de hoy en formato "AAAA-MM-DD", según el reloj del computador. */
export function hoyISO() {
  const h = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${h.getFullYear()}-${dos(h.getMonth() + 1)}-${dos(h.getDate())}`;
}

// ---------------------------------------------------------------------------
//  Textos
// ---------------------------------------------------------------------------

/**
 * Normaliza para GUARDAR e IDENTIFICAR: mayúsculas, sin espacios de sobra.
 * Ojo: NO quita las tildes ni la Ñ, porque "MUÑOZ" y "MUNOZ" podrían
 * ser dos personas distintas y no queremos mezclarlas por error.
 */
export function normalizar(txt) {
  if (txt === null || txt === undefined) return "";
  return String(txt).replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Normaliza para BUSCAR: además quita tildes y Ñ.
 * Así ella escribe "munoz" y igual encuentra a "CAMILO MUÑOZ".
 */
export function paraBuscar(txt) {
  return normalizar(txt)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** ¿El texto que escribió aparece dentro del nombre? (sin importar tildes) */
export function coincide(texto, busqueda) {
  const b = paraBuscar(busqueda);
  if (!b) return true;
  const t = paraBuscar(texto);
  // Cada palabra que escribió tiene que aparecer en alguna parte del nombre.
  return b.split(" ").every((palabra) => t.includes(palabra));
}

/** Convierte lo que sea a un número entero >= 0 (para cantidades y precios). */
export function aEntero(valor, porDefecto = 0) {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor);
  if (typeof valor === "string") {
    const limpio = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(limpio);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return porDefecto;
}
