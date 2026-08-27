// ============================================================================
//  importador.js  -  Convierte el Excel viejo en los datos de la app.
//
//  Este archivo también es PURO. NO sabe leer archivos .xlsx: recibe las hojas
//  ya convertidas en listas de filas (js/datos/excel.js hace esa parte).
//  Así lo podemos probar con Node, sin navegador y sin abrir nada.
//
//  Regla de oro: ningún renglón se pierde y ningún renglón se inventa.
//  Lo que venga mal, entra igual pero MARCADO, para que ella lo vea y lo
//  arregle. El Excel fallaba en silencio; aquí no.
// ============================================================================

import { normalizar, aEntero } from "./formato.js";
import { clavePersona, clavePrecio } from "./calculos.js";

// ---------------------------------------------------------------------------
//  Fechas: el bug número 1 del Excel
//
//  En el Excel, cuando el formato regional de Windows no era colombiano, las
//  fechas se guardaban como TEXTO y esos renglones desaparecían de todos lados
//  sin avisar. Aquí las rescatamos todas: vengan como fecha de verdad, como
//  número de Excel o como texto en cualquiera de los formatos comunes.
// ---------------------------------------------------------------------------

export function aFechaISO(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  // 1) Ya es un objeto Date (así las entrega la librería de Excel).
  if (valor instanceof Date && !isNaN(valor)) {
    const dos = (n) => String(n).padStart(2, "0");
    // Ojo: usamos la hora UTC. Si usáramos la local, una fecha guardada como
    // "2026-08-01 00:00" se podría correr al 31 de julio según la zona horaria.
    return `${valor.getUTCFullYear()}-${dos(valor.getUTCMonth() + 1)}-${dos(valor.getUTCDate())}`;
  }

  // 2) Es un número: Excel cuenta los días desde el 30/12/1899.
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 0) {
    const ms = Math.round(valor) * 86400000;
    const base = Date.UTC(1899, 11, 30);
    return aFechaISO(new Date(base + ms));
  }

  // 3) Es texto. Probamos los formatos que de verdad aparecen.
  const txt = String(valor).trim();

  //    2026-08-01  ó  2026-08-01 00:00:00
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return armarFecha(m[1], m[2], m[3]);

  //    01/08/2026  ó  1-8-2026   (día primero: formato colombiano)
  m = txt.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return armarFecha(m[3], m[2], m[1]);

  //    08/01/2026 con año de 2 cifras: 01/08/26
  m = txt.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) return armarFecha("20" + m[3], m[2], m[1]);

  return null; // No se pudo. El renglón entra marcado, no se descarta.
}

function armarFecha(a, m, d) {
  const anio = Number(a), mes = Number(m), dia = Number(d);
  if (!(anio >= 1900 && anio <= 2200)) return null;
  if (!(mes >= 1 && mes <= 12)) return null;
  if (!(dia >= 1 && dia <= 31)) return null;
  const dos = (n) => String(n).padStart(2, "0");
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

// ---------------------------------------------------------------------------
//  Ayudas para leer las hojas sin depender de en qué columna quedó cada cosa
// ---------------------------------------------------------------------------

const celda = (fila, i) => (fila && fila[i] !== undefined ? fila[i] : null);
const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** Busca en qué columna está un encabezado. Devuelve -1 si no aparece. */
function columnaDe(encabezados, ...nombres) {
  const buscados = nombres.map((n) => normalizar(n));
  for (let i = 0; i < encabezados.length; i++) {
    const h = normalizar(encabezados[i]);
    if (buscados.some((b) => h === b || h.startsWith(b))) return i;
  }
  return -1;
}

/** Busca la primera fila cuya columna A empiece con este texto. */
function filaQueEmpiezaCon(hoja, texto1) {
  const b = normalizar(texto1);
  for (let i = 0; i < hoja.length; i++) {
    if (normalizar(celda(hoja[i], 0)).startsWith(b)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
//  Hoja Config
// ---------------------------------------------------------------------------

export function leerConfig(hoja) {
  const avisos = [];
  const config = {
    anio: null,
    mes: null,
    acreedor: { nombre: "", nit: "", ciudad: "" },
  };
  const empresas = [];
  if (!hoja || !hoja.length) {
    avisos.push({ hoja: "Config", mensaje: "La hoja Config está vacía o no existe." });
    return { config, empresas, avisos };
  }

  const valorDe = (etiqueta) => {
    const i = filaQueEmpiezaCon(hoja, etiqueta);
    return i === -1 ? null : celda(hoja[i], 1);
  };

  config.anio = aEntero(valorDe("Año") ?? valorDe("Ano") ?? valorDe("AÑO"), 0) || null;
  config.mes = aEntero(valorDe("Mes"), 0) || null;
  config.acreedor.nombre = texto(valorDe("Nombre"));
  config.acreedor.nit = texto(valorDe("NIT"));
  config.acreedor.ciudad = texto(valorDe("Ciudad"));

  // Las empresas van debajo de la fila que dice EMPRESAS, con su encabezado.
  const iTitulo = filaQueEmpiezaCon(hoja, "EMPRESAS");
  if (iTitulo === -1) {
    avisos.push({ hoja: "Config", mensaje: "No encontré la sección EMPRESAS." });
    return { config, empresas, avisos };
  }
  let iEncabezado = -1;
  for (let i = iTitulo + 1; i < Math.min(iTitulo + 5, hoja.length); i++) {
    if (normalizar(celda(hoja[i], 0)) === "EMPRESA") { iEncabezado = i; break; }
  }
  const desde = iEncabezado === -1 ? iTitulo + 1 : iEncabezado + 1;

  for (let i = desde; i < hoja.length; i++) {
    const codigo = normalizar(celda(hoja[i], 0));
    if (!codigo) continue;
    // "TODAS" es una opción de las hojas del Excel, no una empresa real.
    if (codigo === "TODAS") continue;
    // Si llegamos al texto de instrucciones del final, paramos.
    if (codigo.length > 30) break;

    const q1 = aEntero(celda(hoja[i], 3), 0);
    const q2 = aEntero(celda(hoja[i], 4), 0);
    if (!(q1 >= 1 && q1 <= 31)) {
      avisos.push({
        hoja: "Config",
        mensaje: `La empresa ${codigo} no tiene un "último día Q1" válido. Le puse 15.`,
      });
    }
    empresas.push({
      codigo,
      razonSocial: texto(celda(hoja[i], 1)),
      nit: texto(celda(hoja[i], 2)),
      ultimoDiaQ1: q1 >= 1 && q1 <= 31 ? q1 : 15,
      ultimoDiaQ2: q2 >= 1 && q2 <= 31 ? q2 : 31,
      activa: true,
    });
  }
  if (!empresas.length) {
    avisos.push({ hoja: "Config", mensaje: "No encontré ninguna empresa en la hoja Config." });
  }
  return { config, empresas, avisos };
}

// ---------------------------------------------------------------------------
//  Hoja Catalogo
//
//  Columna A el producto; las columnas que dicen "Precio XXX" son el precio
//  para la empresa XXX. Guardamos los precios en una tabla aparte
//  (producto + empresa -> valor) y NO como columnas fijas, para que mañana
//  pueda entrar una empresa nueva sin tocar el código.
// ---------------------------------------------------------------------------

export function leerCatalogo(hoja) {
  const avisos = [];
  const productos = [];
  const precios = {};
  if (!hoja || hoja.length < 2) {
    avisos.push({ hoja: "Catalogo", mensaje: "La hoja Catalogo está vacía." });
    return { productos, precios, avisos };
  }
  const encabezados = hoja[0] || [];
  const columnasDePrecio = [];
  for (let i = 0; i < encabezados.length; i++) {
    const h = normalizar(encabezados[i]);
    if (h.startsWith("PRECIO ")) {
      columnasDePrecio.push({ indice: i, empresa: h.slice("PRECIO ".length).trim() });
    }
  }
  if (!columnasDePrecio.length) {
    avisos.push({
      hoja: "Catalogo",
      mensaje: 'No encontré columnas de precio (deben llamarse "Precio MGP", "Precio AGRO"...).',
    });
  }

  const yaVistos = new Set();
  for (let i = 1; i < hoja.length; i++) {
    const nombre = normalizar(celda(hoja[i], 0));
    if (!nombre) continue;
    if (yaVistos.has(nombre)) {
      avisos.push({
        hoja: "Catalogo",
        fila: i + 1,
        mensaje: `El plato "${nombre}" está repetido en el catálogo. Dejé el primero.`,
      });
      continue;
    }
    yaVistos.add(nombre);
    productos.push({ nombre, activo: true });
    for (const col of columnasDePrecio) {
      const bruto = celda(hoja[i], col.indice);
      if (bruto === null || bruto === undefined || bruto === "") continue;
      const valor = aEntero(bruto, -1);
      if (valor < 0) {
        avisos.push({
          hoja: "Catalogo",
          fila: i + 1,
          mensaje: `El precio de "${nombre}" para ${col.empresa} no se entiende ("${bruto}").`,
        });
        continue;
      }
      precios[clavePrecio(nombre, col.empresa)] = valor;
    }
  }
  return { productos, precios, avisos };
}

// ---------------------------------------------------------------------------
//  Hoja Personas
// ---------------------------------------------------------------------------

export function leerPersonas(hoja) {
  const avisos = [];
  const personas = [];
  if (!hoja || hoja.length < 2) {
    avisos.push({ hoja: "Personas", mensaje: "La hoja Personas está vacía." });
    return { personas, avisos };
  }
  const enc = hoja[0] || [];
  const cNombre = Math.max(0, columnaDe(enc, "Nombre"));
  const cCome = columnaDe(enc, "Empresa donde come", "Empresa");
  const cFactura = columnaDe(enc, "Facturar a", "Facturar");
  const cActivo = columnaDe(enc, "Activo", "Activa");

  const yaVistas = new Set();
  for (let i = 1; i < hoja.length; i++) {
    const nombre = normalizar(celda(hoja[i], cNombre));
    if (!nombre) continue;
    const empresa = normalizar(celda(hoja[i], cCome === -1 ? 1 : cCome));
    if (!empresa) {
      avisos.push({
        hoja: "Personas",
        fila: i + 1,
        mensaje: `${nombre} no tiene empresa. No se puede saber a quién cobrarle, la dejé por fuera.`,
      });
      continue;
    }
    // La llave real es EMPRESA + NOMBRE. Puede haber dos personas con el
    // mismo nombre en empresas distintas, y son personas diferentes.
    const llave = clavePersona(empresa, nombre);
    if (yaVistas.has(llave)) {
      avisos.push({
        hoja: "Personas",
        fila: i + 1,
        mensaje: `${nombre} aparece dos veces en ${empresa}. Dejé la primera.`,
      });
      continue;
    }
    yaVistas.add(llave);
    // El Excel viejo traía una columna "Facturar a" aparte de la empresa. Ya
    // no hay dos empresas, pero los archivos viejos siguen existiendo: si esa
    // columna está y dice algo, manda ella, porque es a la que se le pasó la
    // cuenta de verdad. Ver unificarEmpresa() en modelo.js.
    //
    // Ojo con el "si no está": antes se caía a la casilla 2 a ciegas. En el
    // Excel nuevo la casilla 2 es "Activo", así que eso metía una "S" donde
    // va el nombre de una empresa. Si la columna no está, no se inventa nada.
    const facturaBruto = cFactura === -1 ? "" : normalizar(celda(hoja[i], cFactura));
    const activoBruto = normalizar(celda(hoja[i], cActivo === -1 ? cCome + 1 : cActivo));
    personas.push({
      nombre,
      empresa: facturaBruto || empresa,
      activa: activoBruto !== "N" && activoBruto !== "NO",
    });
  }
  return { personas, avisos };
}

// ---------------------------------------------------------------------------
//  Hoja Registro  -  el corazón
//
//  Del Excel solo creemos: fecha, empresa, persona, producto, cantidad,
//  facturable y observación. Todo lo demás (a quién se le factura, el precio,
//  el subtotal, la quincena) lo RECALCULAMOS, porque en el Excel eran fórmulas
//  y las fórmulas son justamente las que se dañaban.
// ---------------------------------------------------------------------------

export function leerRegistro(hoja, { personas, productos, precios }) {
  const avisos = [];
  const consumos = [];
  if (!hoja || hoja.length < 2) {
    avisos.push({ hoja: "Registro", mensaje: "La hoja Registro está vacía." });
    return { consumos, avisos };
  }

  const porLlave = new Map();
  for (const p of personas) porLlave.set(clavePersona(p.empresa, p.nombre), p);
  const nombresConocidos = new Map();
  for (const p of personas) {
    const n = normalizar(p.nombre);
    if (!nombresConocidos.has(n)) nombresConocidos.set(n, []);
    nombresConocidos.get(n).push(p.empresa);
  }
  const productosConocidos = new Set(productos.map((p) => normalizar(p.nombre)));

  const enc = hoja[0] || [];
  const c = {
    fecha: pos(columnaDe(enc, "Fecha"), 0),
    empresa: pos(columnaDe(enc, "Empresa"), 2),
    persona: pos(columnaDe(enc, "Persona"), 3),
    producto: pos(columnaDe(enc, "Producto"), 5),
    cantidad: pos(columnaDe(enc, "Cantidad"), 6),
    facturable: pos(columnaDe(enc, "Facturable"), 10),
    observacion: pos(columnaDe(enc, "Observación", "Observacion"), 11),
  };

  for (let i = 1; i < hoja.length; i++) {
    const fila = hoja[i];
    if (!fila) continue;
    const brutoFecha = celda(fila, c.fecha);
    // Dos cosas distintas con nombres distintos, a propósito:
    //   escrita   lo que dice la casilla del Excel
    //   empresa   la que vale, que sale de la persona en la hoja Personas
    // Antes se llamaban empresaCome y empresaFactura. Ya no son dos empresas
    // -- es una sola -- pero el Excel puede traerla mal escrita en el renglón
    // y bien en la lista de personas, y ahí manda la lista.
    const escrita = normalizar(celda(fila, c.empresa));
    const persona = normalizar(celda(fila, c.persona));
    const producto = normalizar(celda(fila, c.producto));

    // Fila totalmente vacía: se salta en silencio, es normal en un Excel.
    if (!brutoFecha && !escrita && !persona && !producto) continue;

    const revisar = [];
    const fecha = aFechaISO(brutoFecha);
    if (!fecha) {
      revisar.push("FECHA_MALA");
      avisos.push({
        hoja: "Registro",
        fila: i + 1,
        mensaje: `La fecha "${texto(brutoFecha)}" no se entiende. El renglón entró sin fecha.`,
      });
    }

    let empresa = escrita;
    const p = porLlave.get(clavePersona(escrita, persona));
    if (p) {
      empresa = p.empresa || escrita;
    } else {
      revisar.push("PERSONA_NO_ESTA");
      const dondeSiEsta = nombresConocidos.get(persona);
      avisos.push({
        hoja: "Registro",
        fila: i + 1,
        mensaje: dondeSiEsta
          ? `${persona} no está en ${escrita}. Está en ${dondeSiEsta.join(", ")}.`
          : `${persona} no aparece en la hoja Personas.`,
      });
    }

    // El precio se busca con la empresa del renglón y queda CONGELADO ahí
    // para siempre: si mañana sube el almuerzo, lo ya cobrado no cambia.
    let precioUnitario = precios[clavePrecio(producto, empresa)];
    if (!Number.isFinite(precioUnitario)) {
      precioUnitario = 0;
      revisar.push("SIN_PRECIO");
      avisos.push({
        hoja: "Registro",
        fila: i + 1,
        mensaje: productosConocidos.has(producto)
          ? `"${producto}" no tiene precio para ${empresa}. Entró en $ 0.`
          : `"${producto}" no está en el catálogo. Entró en $ 0.`,
      });
    }

    const cantidad = aEntero(celda(fila, c.cantidad), 0);
    if (cantidad <= 0) revisar.push("SIN_CANTIDAD");

    consumos.push({
      id: "imp-" + (consumos.length + 1),
      fecha: fecha || "",
      empresa,
      persona,
      producto,
      cantidad,
      precioUnitario,
      facturable: normalizar(celda(fila, c.facturable)) !== "N",
      observacion: texto(celda(fila, c.observacion)),
      revisar,
    });
  }
  return { consumos, avisos };
}

function pos(encontrada, porDefecto) {
  return encontrada === -1 ? porDefecto : encontrada;
}

// ---------------------------------------------------------------------------
//  La importación completa
// ---------------------------------------------------------------------------

/**
 * hojas = { Config: [[...]], Catalogo: [[...]], Personas: [[...]], Registro: [[...]] }
 * Cada hoja es una lista de filas, y cada fila una lista de celdas.
 *
 * Las hojas Cocina, Resumen, Factura y Cuadre del Excel NO se importan:
 * son cuentas hechas a partir de las otras, y la app las vuelve a hacer sola.
 */
export function importar(hojas) {
  const cfg = leerConfig(hojas.Config);
  const cat = leerCatalogo(hojas.Catalogo);
  const per = leerPersonas(hojas.Personas);
  const reg = leerRegistro(hojas.Registro, {
    personas: per.personas,
    productos: cat.productos,
    precios: cat.precios,
  });

  const datos = {
    version: 1,
    config: cfg.config,
    empresas: cfg.empresas,
    productos: cat.productos,
    precios: cat.precios,
    personas: per.personas,
    consumos: reg.consumos,
    cuadres: {},
  };

  const avisos = [...cfg.avisos, ...cat.avisos, ...per.avisos, ...reg.avisos];

  // Un resumen en números para que ella (y los tests) puedan verificar que
  // no se perdió nada por el camino.
  const nombres = per.personas.map((p) => normalizar(p.nombre));
  const cuantasVeces = new Map();
  for (const n of nombres) cuantasVeces.set(n, (cuantasVeces.get(n) || 0) + 1);
  const fechas = reg.consumos.map((c) => c.fecha).filter(Boolean).sort();

  const resumen = {
    empresas: cfg.empresas.length,
    productos: cat.productos.length,
    personas: per.personas.length,
    nombresUnicos: cuantasVeces.size,
    nombresEnVariasEmpresas: [...cuantasVeces.values()].filter((v) => v > 1).length,
    renglones: reg.consumos.length,
    desde: fechas[0] || null,
    hasta: fechas[fechas.length - 1] || null,
    total: reg.consumos.reduce(
      (a, c) => a + (c.facturable === false ? 0 : c.cantidad * c.precioUnitario),
      0
    ),
    sinPrecio: reg.consumos.filter((c) => c.revisar.includes("SIN_PRECIO")).length,
    sinPersona: reg.consumos.filter((c) => c.revisar.includes("PERSONA_NO_ESTA")).length,
    sinFecha: reg.consumos.filter((c) => c.revisar.includes("FECHA_MALA")).length,
    paraRevisar: reg.consumos.filter((c) => c.revisar.length > 0).length,
  };

  return { datos, avisos, resumen };
}
