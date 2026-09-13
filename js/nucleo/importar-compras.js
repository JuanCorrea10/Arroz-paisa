// ============================================================================
//  importar-compras.js  -  Traer el Excel de facturas de proveedores
//
//  Sin esto, pasarse a la app cuesta teclear 141 facturas a mano -- y nadie
//  hace eso: se queda en el Excel y el trabajo no sirvió de nada.
//
//  El archivo de ella trae cinco hojas y solo dos son facturas (BOSQUELARGO y
//  LAGOS). Las otras tres son listas de pagos y de gastos en efectivo. Y las
//  dos de facturas NO están iguales: una empieza en la columna B y la otra en
//  la C, tienen renglones de título en la mitad ("FACTURAS DEL 17") y hasta una
//  tablita de totales metida entre las filas.
//
//  Por eso NO se leen por posición. Se busca el renglón del encabezado por el
//  NOMBRE de las columnas, y de ahí para abajo solo entra lo que de verdad
//  empieza con una fecha. Así la hoja puede moverse, crecer o tener basura en
//  el medio, y la importación sigue entendiendo.
//
//  Lo que no se puede leer NO se descarta callado: se devuelve en "avisos" con
//  el renglón y el motivo. Es la regla de la casa -- lo que falla, se dice.
// ============================================================================

import { normalizar } from "./formato.js";
import { aFechaISO } from "./importador.js";

/** Las columnas que se buscan, y cómo pueden venir escritas. */
const COLUMNAS = {
  fecha: ["FECHA"],
  factura: ["NO FACTURA", "N FACTURA", "NUMERO DE FACTURA", "FACTURA"],
  quienRecibe: ["NOMBRE DE QUIEN INGRESA", "QUIEN INGRESA", "NOMBRE"],
  proveedor: ["PROVEEDOR"],
  producto: ["PRODUCTO"],
  cantidad: ["CANTIDAD"],
  valor: ["VALOR TOTAL", "VALOR"],
  observacion: ["OBSERVACIONES", "OBSERVACION"],
};

/** Para comparar títulos de columna sin pelear con tildes ni espacios. */
function comoTitulo(v) {
  return normalizar(v)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca el renglón de encabezado y en qué columna quedó cada cosa.
 *
 * Hacen falta FECHA, PROVEEDOR, VALOR y NÚMERO DE FACTURA. Con eso, las hojas
 * que no son de facturas se quedan por fuera solas, sin tener que nombrarlas a
 * mano -- y eso importa, porque ella les puede cambiar el nombre cuando quiera.
 */
export function buscarEncabezado(filas) {
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] || [];
    const donde = {};

    for (let c = 0; c < fila.length; c++) {
      const titulo = comoTitulo(fila[c]);
      if (!titulo) continue;
      for (const [campo, nombres] of Object.entries(COLUMNAS)) {
        if (donde[campo] !== undefined) continue;
        if (nombres.includes(titulo)) donde[campo] = c;
      }
    }

    // Hace falta la columna del NÚMERO DE FACTURA, y no es capricho: la hoja
    // "CONTROL PAGOS" del archivo de ella también tiene FECHA, PROVEEDOR y
    // VALOR -- pero es el calendario de a quién se le gira los lunes, no las
    // facturas que llegaron. Sin este filtro se colaba entera y soltaba doce
    // avisos de "no entiendo la fecha" por unos renglones que nunca fueron
    // facturas.
    if (donde.fecha !== undefined && donde.proveedor !== undefined &&
        donde.valor !== undefined && donde.factura !== undefined) {
      return { fila: i, columnas: donde };
    }
  }
  return null;
}

/** El número de la factura, que en Excel puede llegar como número. */
function comoTexto(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

/** El valor. Acepta "$ 170.000" y "170000", y no se inventa lo que no entiende. */
export function aPlata(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : null;
  }
  const txt = String(valor === null || valor === undefined ? "" : valor).trim();
  if (!txt) return null;
  // Se quitan el signo, los espacios y los puntos de miles. La coma decimal
  // colombiana se vuelve punto para poder redondear.
  const limpio = txt.replace(/[$\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Lee una hoja de facturas.
 *
 * La SEDE es el nombre de la hoja: en el archivo de ella las hojas se llaman
 * BOSQUELARGO y LAGOS, que es justo donde llegó la comida.
 */
export function leerHojaDeCompras(nombreHoja, filas) {
  const cab = buscarEncabezado(filas);
  if (!cab) return null;

  const col = cab.columnas;
  const dame = (fila, campo) =>
    col[campo] === undefined ? null : (fila[col[campo]] ?? null);

  const compras = [];
  const avisos = [];

  for (let i = cab.fila + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const enExcel = i + 1;   // como lo ve ella en Excel, empezando en 1

    const crudaFecha = dame(fila, "fecha");
    const proveedor = normalizar(dame(fila, "proveedor"));
    const valor = aPlata(dame(fila, "valor"));

    // Un renglón vacío, un título en la mitad ("FACTURAS DEL 17") o la tablita
    // de totales que ella tiene metida entre las filas 60 a 65: nada de eso es
    // una factura. Se salta en silencio porque no es un error, es adorno.
    //
    // La seña es que NO traiga ni fecha ni número de factura. Con el proveedor
    // no basta: la tablita de totales sí trae nombres de proveedor en su
    // columna, y por eso soltaba avisos de algo que nunca fue una factura.
    const numero = comoTexto(dame(fila, "factura"));
    const sinFecha = crudaFecha === null || crudaFecha === "";
    if (sinFecha && !numero) continue;

    const fecha = aFechaISO(crudaFecha);

    // Esto SÍ se dice: parece una factura y no se pudo leer. En el archivo de
    // ella hay una fecha "28/08/0206" -- año 206 -- que si se colara dejaría
    // una factura perdida en el año 206, fuera de toda semana.
    if (!fecha) {
      if (proveedor || valor !== null) {
        avisos.push({
          hoja: nombreHoja, fila: enExcel, motivo: "la fecha no se entiende",
          dice: comoTexto(crudaFecha), proveedor,
        });
      }
      continue;
    }
    if (!proveedor) {
      avisos.push({ hoja: nombreHoja, fila: enExcel, motivo: "no dice de qué proveedor es", fecha });
      continue;
    }

    compras.push({
      fecha,
      sede: normalizar(nombreHoja),
      proveedor,
      producto: normalizar(dame(fila, "producto")),
      cantidad: comoTexto(dame(fila, "cantidad")),
      valor: valor === null ? 0 : valor,
      factura: comoTexto(dame(fila, "factura")),
      quienRecibe: normalizar(dame(fila, "quienRecibe")),
      observacion: comoTexto(dame(fila, "observacion")),
      pagadaEl: null,
    });

    // Una factura sin valor entra igual -- existe, llegó, hay que pagarla --
    // pero no suma, y callarlo dejaría el pago semanal corto.
    if (valor === null) {
      avisos.push({
        hoja: nombreHoja, fila: enExcel, motivo: "la factura no trae valor",
        fecha, proveedor,
      });
    }
  }

  return { compras, avisos, encabezado: cab };
}

/**
 * Lee el archivo entero y devuelve las compras de todas sus hojas.
 *
 * Las hojas que no son de facturas se dejan por fuera solas: si no tienen el
 * encabezado completo, no se miran. En el archivo de ella se saltan tres de las
 * cinco (CONTROL PAGOS, EFECTIVO y RESUMEN DE PAGOS), que son calendarios de
 * giro y no facturas.
 */
export function importarCompras(hojas) {
  const compras = [];
  const avisos = [];
  const leidas = [];
  const saltadas = [];

  for (const [nombre, filas] of Object.entries(hojas || {})) {
    const r = leerHojaDeCompras(nombre, filas || []);
    if (!r) { saltadas.push(nombre); continue; }
    compras.push(...r.compras);
    avisos.push(...r.avisos);
    leidas.push({ hoja: nombre, facturas: r.compras.length });
  }

  // Facturas repetidas: mismo proveedor y mismo número. Puede ser doble
  // registro -- en el archivo de ella hay dos pares así -- o puede ser real.
  // No se decide por ella: se avisa y se traen las dos.
  const vistas = new Map();
  for (const c of compras) {
    const llave = c.proveedor + "|" + c.factura;
    if (!c.factura) continue;
    vistas.set(llave, (vistas.get(llave) || 0) + 1);
  }
  const repetidas = [...vistas.entries()]
    .filter(([, n]) => n > 1)
    .map(([llave, n]) => {
      const [proveedor, factura] = llave.split("|");
      return { proveedor, factura, veces: n };
    });

  return {
    compras,
    avisos,
    repetidas,
    resumen: {
      facturas: compras.length,
      plata: compras.reduce((a, c) => a + (c.valor || 0), 0),
      sedes: [...new Set(compras.map((c) => c.sede))].sort(),
      proveedores: new Set(compras.map((c) => c.proveedor)).size,
      hojasLeidas: leidas,
      hojasSaltadas: saltadas,
      sinValor: compras.filter((c) => !c.valor).length,
    },
  };
}
