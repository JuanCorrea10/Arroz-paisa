// ============================================================================
//  excel.js  -  Lo único que sabe abrir y escribir archivos .xlsx
//
//  Lo aislamos aquí a propósito: el resto de la app no debe saber nada de
//  Excel. Así, el día que ya no haya Excel, solo se borra este archivo.
//  Funciona igual en el navegador y en Node (para poder correr las pruebas).
// ============================================================================

let XLSX = null;

async function cargarLibreria() {
  if (XLSX) return XLSX;
  if (typeof window !== "undefined" && window.XLSX) {
    XLSX = window.XLSX;
    return XLSX;
  }
  // Estamos en Node (corriendo las pruebas): cargamos la librería del vendor.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  XLSX = require("../../vendor/xlsx.full.min.js");
  return XLSX;
}

/**
 * Convierte un archivo .xlsx en hojas de la forma:
 *   { "Config": [[fila], [fila]...], "Catalogo": [[...]], ... }
 *
 * Cada hoja es una lista de filas y cada fila una lista de celdas.
 * Le pasamos raw:true para que los números lleguen como números
 * (si no, "13000" llegaría como el texto "13.000" y se dañarían los precios)
 * y cellDates:true para que las fechas lleguen como fechas de verdad.
 */
export async function hojasDesdeArchivo(datosBinarios) {
  const lib = await cargarLibreria();
  const libro = lib.read(datosBinarios, { type: "array", cellDates: true, raw: true });
  const hojas = {};
  for (const nombre of libro.SheetNames) {
    hojas[nombre] = lib.utils.sheet_to_json(libro.Sheets[nombre], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
  }
  return hojas;
}

/** Arma un archivo .xlsx a partir de hojas y devuelve los bytes para bajarlo. */
export async function archivoDesdeHojas(hojas, anchos = {}) {
  const lib = await cargarLibreria();
  const libro = lib.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = lib.utils.aoa_to_sheet(filas);
    if (anchos[nombre]) hoja["!cols"] = anchos[nombre].map((w) => ({ wch: w }));
    // Excel no deja nombres de hoja de más de 31 letras.
    lib.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  return lib.write(libro, { bookType: "xlsx", type: "array" });
}
