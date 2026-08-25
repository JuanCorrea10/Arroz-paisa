// ============================================================================
//  aceptacion.test.mjs
//
//  Las pruebas que deciden si la importación está bien o está mal.
//  Los números de aquí NO son inventados: salieron de contar a mano el Excel
//  real de agosto de 2026. Si alguno de estos falla, la migración está mal
//  y NO se puede usar la app, por bonita que se vea.
// ============================================================================

import { bytesDelArchivo } from "./leer-archivo.mjs";
import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { hojasDesdeArchivo } from "../js/datos/excel.js";
import { importar, aFechaISO } from "../js/nucleo/importador.js";
import {
  indicePorCodigo,
  deQuincena,
  sumar,
  facturasPorEmpresa,
  delDia,
  contarFacturas,
  informeDia,
  informeCocina,
} from "../js/nucleo/calculos.js";

// Importamos una sola vez y todas las pruebas miran el mismo resultado.
const bytes = await bytesDelArchivo("ARROZ_PAISA_CONTROL.xlsx");
const hojas = await hojasDesdeArchivo(bytes);
const { datos, resumen, avisos } = importar(hojas);
const empresas = indicePorCodigo(datos.empresas);

// ---------------------------------------------------------------------------
grupo("Importación: lo que tiene que traer el Excel de agosto 2026");

prueba("trae las 4 empresas con sus días de corte", () => {
  igual(resumen.empresas, 4);
  igual(empresas.MGP.ultimoDiaQ1, 13, "MGP corta el 13");
  igual(empresas.AGRO.ultimoDiaQ1, 14, "AGRO corta el 14");
  igual(empresas.PUNTERAS.ultimoDiaQ1, 14, "PUNTERAS corta el 14");
  igual(empresas.BASARILI.ultimoDiaQ1, 14, "BASARILI corta el 14");
  igual(empresas.MGP.razonSocial, "INDUSTRIAS MGP");
  igual(empresas.AGRO.razonSocial, "BOTAS AGROINDUSTRIAL SAS");
});

prueba("trae los datos de quien cobra", () => {
  igual(datos.config.acreedor.nombre, "VALENTINA SÁNCHEZ GUZMÁN");
  cierto(datos.config.acreedor.nit.includes("1110586117"), "el NIT del acreedor");
  igual(datos.config.acreedor.ciudad, "Ibagué");
  igual(datos.config.anio, 2026);
  igual(datos.config.mes, 8);
});

prueba("trae 75 productos", () => {
  igual(resumen.productos, 75);
});

prueba("trae 561 personas, 477 nombres únicos, 79 nombres repetidos", () => {
  igual(resumen.personas, 561, "renglones de personas");
  igual(resumen.nombresUnicos, 477, "nombres distintos");
  igual(resumen.nombresEnVariasEmpresas, 79, "nombres que están en 2+ empresas");
});

prueba("trae 1.029 renglones, del 01/08/2026 al 22/08/2026", () => {
  igual(resumen.renglones, 1029);
  igual(resumen.desde, "2026-08-01");
  igual(resumen.hasta, "2026-08-22");
});

prueba("la suma de todos los subtotales da $11.075.000", () => {
  igual(resumen.total, 11075000);
});

prueba("36 renglones quedan sin precio, marcados y NO descartados", () => {
  igual(resumen.sinPrecio, 36);
  const marcados = datos.consumos.filter((c) => c.revisar.includes("SIN_PRECIO"));
  igual(marcados.length, 36);
  cierto(marcados.every((c) => c.precioUnitario === 0), "todos entraron en $ 0");
  // Y siguen contando para la cocina: hay que cocinarlos igual.
  cierto(marcados.every((c) => c.cantidad > 0), "todos conservan su cantidad");
});

prueba("no se pierde ningún renglón por fecha ni por persona", () => {
  igual(resumen.sinFecha, 0, "renglones con fecha ilegible");
  igual(resumen.sinPersona, 0, "renglones cuya persona no existe");
});

// ---------------------------------------------------------------------------
grupo("Totales por empresa y quincena (empresa a facturar, sin no-facturables)");

const ESPERADO = {
  MGP: { 1: 1742500, 2: 916500 },
  AGRO: { 1: 2833000, 2: 1142000 },
  BASARILI: { 1: 2757000, 2: 1041000 },
  PUNTERAS: { 1: 405000, 2: 238000 },
};

for (const [codigo, porQuincena] of Object.entries(ESPERADO)) {
  for (const q of [1, 2]) {
    prueba(`${codigo} quincena ${q} = $${porQuincena[q].toLocaleString("es-CO")}`, () => {
      const lista = deQuincena(datos.consumos, 2026, 8, q, empresas[codigo]).filter(
        (c) => c.facturable !== false
      );
      igual(sumar(lista), porQuincena[q]);
    });
  }
}

prueba("las dos quincenas suman el total del mes", () => {
  let suma = 0;
  for (const codigo of Object.keys(ESPERADO)) {
    for (const q of [1, 2]) {
      suma += sumar(
        deQuincena(datos.consumos, 2026, 8, q, empresas[codigo]).filter((c) => c.facturable !== false)
      );
    }
  }
  igual(suma, 11075000, "ningún renglón se puede quedar por fuera de las dos quincenas");
});

// ---------------------------------------------------------------------------
grupo("Facturas: una factura = una persona que comió un día");

prueba("814 facturas repartidas 204 / 260 / 293 / 57", () => {
  const f = facturasPorEmpresa(datos.consumos);
  igual(f.MGP, 204);
  igual(f.AGRO, 260);
  igual(f.BASARILI, 293);
  igual(f.PUNTERAS, 57);
  igual(f.MGP + f.AGRO + f.BASARILI + f.PUNTERAS, 814);
});

prueba("hay menos facturas que renglones (la gente pide más de una cosa)", () => {
  cierto(contarFacturas(datos.consumos) < datos.consumos.length);
  igual(contarFacturas(datos.consumos), 814);
});

// ---------------------------------------------------------------------------
grupo("Día de muestra: 20 de agosto de 2026");

prueba("44 renglones y $488.000", () => {
  const dia = delDia(datos.consumos, "2026-08-20");
  igual(dia.length, 44);
  igual(sumar(dia), 488000);
});

prueba("por empresa: AGRO 11/11, BASARILI 12/12, MGP 16/12, PUNTERAS 5/4", () => {
  const esperado = {
    AGRO: [11, 11],
    BASARILI: [12, 12],
    MGP: [16, 12],
    PUNTERAS: [5, 4],
  };
  for (const [codigo, [renglones, facturas]] of Object.entries(esperado)) {
    const informe = informeDia(datos.consumos, "2026-08-20", codigo);
    igual(informe.renglones, renglones, `${codigo}: renglones`);
    igual(informe.facturas, facturas, `${codigo}: facturas`);
  }
});

prueba("el resumen del día cuadra con la suma de sus renglones", () => {
  const informe = informeDia(datos.consumos, "2026-08-20");
  igual(informe.total, 488000);
  igual(
    informe.filas.reduce((a, f) => a + f.cantidad, 0),
    delDia(datos.consumos, "2026-08-20").reduce((a, c) => a + c.cantidad, 0),
    "las cantidades del resumen tienen que ser las mismas del día"
  );
});

prueba("cocina cuenta TODOS los platos del día, incluso los que no tienen precio", () => {
  const codigos = datos.empresas.map((e) => e.codigo);
  const filas = informeCocina(datos.consumos, "2026-08-20", codigos);
  const platosDelDia = new Set(delDia(datos.consumos, "2026-08-20").map((c) => c.producto));
  igual(filas.length, platosDelDia.size, "no se puede perder ni un plato de la cocina");
  igual(
    filas.reduce((a, f) => a + f.total, 0),
    delDia(datos.consumos, "2026-08-20").reduce((a, c) => a + c.cantidad, 0)
  );
});

// ---------------------------------------------------------------------------
grupo("Los avisos: nada queda mal y callado");

prueba("hay un aviso por cada renglón sin precio", () => {
  const deRegistro = avisos.filter((a) => a.hoja === "Registro");
  igual(deRegistro.length, 36, "36 renglones con problema = 36 avisos");
  cierto(
    deRegistro.every((a) => a.fila > 1 && a.mensaje.length > 10),
    "cada aviso dice en qué fila del Excel estaba y qué pasó"
  );
});

prueba("resumen.paraRevisar coincide con los renglones marcados", () => {
  igual(resumen.paraRevisar, datos.consumos.filter((c) => c.revisar.length > 0).length);
  igual(resumen.paraRevisar, 36);
});

// ---------------------------------------------------------------------------
grupo("Fechas: el bug número 1 del Excel");

prueba("entiende fechas de verdad, texto colombiano y números de Excel", () => {
  igual(aFechaISO(new Date(Date.UTC(2026, 7, 20))), "2026-08-20", "objeto Date");
  igual(aFechaISO("2026-08-20"), "2026-08-20", "texto ISO");
  igual(aFechaISO("2026-08-20 00:00:00"), "2026-08-20", "texto ISO con hora");
  igual(aFechaISO("20/08/2026"), "2026-08-20", "texto colombiano (el bug del Excel)");
  igual(aFechaISO("1/8/2026"), "2026-08-01", "texto colombiano sin ceros");
  igual(aFechaISO("20/08/26"), "2026-08-20", "año de dos cifras");
  igual(aFechaISO(46254), "2026-08-20", "número serial de Excel");
});

prueba("una fecha imposible no se cuela disfrazada", () => {
  igual(aFechaISO("32/08/2026"), null, "el día 32 no existe");
  igual(aFechaISO("20/13/2026"), null, "el mes 13 no existe");
  igual(aFechaISO("no es una fecha"), null);
  igual(aFechaISO(""), null);
  igual(aFechaISO(null), null);
});

// ---------------------------------------------------------------------------
grupo("El otro Excel (PEDIDOS AUTOMATIZADOS) también entra");

prueba("importa el archivo nuevo sin romperse", async () => {
  const otros = await bytesDelArchivo("PEDIDOS_AUTOMATIZADOS.xlsx");
  const h2 = await hojasDesdeArchivo(otros);
  const r2 = importar(h2);
  cierto(r2.resumen.renglones > 1000, "trae los renglones");
  cierto(r2.resumen.empresas === 4, "trae las 4 empresas");
  cierto(r2.resumen.sinFecha === 0, "ninguna fecha se pierde");
  console.log(
    `         (informativo: ${r2.resumen.renglones} renglones, ` +
      `${r2.resumen.personas} personas, ${r2.resumen.productos} platos, ` +
      `total $${r2.resumen.total.toLocaleString("es-CO")})`
  );
});
