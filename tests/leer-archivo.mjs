// ============================================================================
//  leer-archivo.mjs  -  Leer el Excel de prueba, sirva Node o sirva navegador.
//
//  Existe porque en este computador NO hay Node instalado, así que las pruebas
//  tienen que poder correr abriendo tests/pruebas.html en Chrome. Y el día que
//  se instale Node, las mismas pruebas tienen que seguir sirviendo con
//  "npm run probar", sin cambiarles una coma.
//
//  El truco es no importar "node:fs" arriba del archivo: si lo hiciéramos, el
//  navegador reventaría al leer esa línea, antes de correr nada.
// ============================================================================

/** Devuelve los bytes de un archivo de la carpeta tests/datos/. */
export async function bytesDelArchivo(nombre) {
  const enNavegador = typeof window !== "undefined" && typeof fetch === "function";

  if (enNavegador) {
    const respuesta = await fetch("datos/" + nombre);
    if (!respuesta.ok) {
      throw new Error(
        `No se pudo leer tests/datos/${nombre} (${respuesta.status}). ` +
        "¿Está corriendo el servidor?"
      );
    }
    return new Uint8Array(await respuesta.arrayBuffer());
  }

  // Estamos en Node. El import va aquí adentro a propósito.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const aqui = dirname(fileURLToPath(import.meta.url));
  return new Uint8Array(readFileSync(join(aqui, "datos", nombre)));
}
