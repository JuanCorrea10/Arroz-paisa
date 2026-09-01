// ============================================================================
//  excel-export.js  -  Sacar todo a un archivo de Excel.
//
//  Para dos cosas:
//    1. Respaldo que se puede abrir en cualquier computador, sin la app.
//    2. Mandarle los datos a otro trabajador que trabaja en Excel.
//
//  El archivo que sale se puede volver a importar en la app: trae las mismas
//  hojas Config, Catalogo, Personas y Registro que leía del Excel viejo.
// ============================================================================

import { archivoDesdeHojas } from "../datos/excel.js";
import { descargarBlob } from "../datos/almacen.js";
import { nombreMes, sedeDeEmpresa, razonSocialDe } from "../nucleo/formato.js";
import {
  indicePorCodigo, quincenaDe, subtotal, delMes, deQuincena, sumar,
  contarFacturas, informePorPersona, clavePrecio,
  loPagaLaEmpresa, formaDeCobro, sumarLoDeLaEmpresa,
} from "../nucleo/calculos.js";

/** Exporta TODO: es el respaldo completo en formato Excel. */
export async function exportarTodoAExcel(datos) {
  const empresas = indicePorCodigo(datos.empresas);
  const codigos = datos.empresas.map((e) => e.codigo);

  const config = [
    ["CONFIGURACIÓN"],
    [],
    ["PERIODO"],
    ["Año", datos.config.anio],
    ["Mes (1-12)", datos.config.mes],
    [],
    ["RESTAURANTE (acreedor)"],
    ["Nombre", datos.config.acreedor.nombre],
    ["NIT", datos.config.acreedor.nit],
    ["Ciudad", datos.config.acreedor.ciudad],
    [],
    ["EMPRESAS"],
    ["Empresa", "Nombre legal (deudor)", "NIT", "Último día Q1", "Último día Q2"],
    ...datos.empresas.map((e) => [e.codigo, e.razonSocial, e.nit, e.ultimoDiaQ1, e.ultimoDiaQ2]),
  ];

  const catalogo = [
    ["Producto", ...codigos.map((c) => "Precio " + c)],
    ...datos.productos.map((p) => [
      p.nombre,
      ...codigos.map((c) => {
        const v = datos.precios[clavePrecio(p.nombre, c)];
        return Number.isFinite(v) ? v : null;
      }),
    ]),
  ];

  const personas = [
    ["Nombre", "Empresa", "Activo"],
    ...datos.personas.map((p) => [p.nombre, p.empresa, p.activa === false ? "N" : "S"]),
  ];

  const registro = [
    ["Fecha", "Día", "Empresa", "Persona", "Producto", "Cantidad",
     "Precio Unit.", "Subtotal", "Quincena", "Facturable", "Observación", "Revisar"],
    ...datos.consumos.map((c) => [
      c.fecha,
      c.fecha ? Number(c.fecha.slice(8, 10)) : "",
      c.empresa,
      c.persona,
      c.producto,
      c.cantidad,
      c.precioUnitario,
      subtotal(c),
      quincenaDe(c.fecha, empresas[c.empresa]) || "",
      { empresa: "EMPRESA", contado: "PAGO DE UNA", cortesia: "CORTESIA" }[formaDeCobro(c)],
      c.observacion || "",
      (c.revisar || []).join(" "),
    ]),
  ];

  // Un resumen listo para mirar, que es lo primero que abre cualquiera.
  const resumen = [
    ["RESUMEN", `${nombreMes(datos.config.mes)} ${datos.config.anio}`],
    [],
    ["Empresa", "Razón social", "Quincena 1", "Quincena 2", "Total del mes", "Facturas"],
  ];
  let granTotal = 0;
  for (const e of datos.empresas) {
    const q1 = sumarLoDeLaEmpresa(deQuincena(datos.consumos, datos.config.anio, datos.config.mes, 1, e));
    const q2 = sumarLoDeLaEmpresa(deQuincena(datos.consumos, datos.config.anio, datos.config.mes, 2, e));
    const suyos = delMes(datos.consumos, datos.config.anio, datos.config.mes).filter((c) => c.empresa === e.codigo);
    resumen.push([e.codigo, e.razonSocial, q1, q2, q1 + q2, contarFacturas(suyos)]);
    granTotal += q1 + q2;
  }
  resumen.push([], ["TOTAL DEL MES", "", "", "", granTotal]);

  const porPersona = [
    ["Persona", "Empresa", "Facturas", "Quincena 1", "Quincena 2", "Mes"],
    ...informePorPersona(datos.consumos, datos.config.anio, datos.config.mes, empresas).map((f) => [
      f.persona, f.empresa, f.facturas, f.q1, f.q2, f.mes,
    ]),
  ];

  const bytes = await archivoDesdeHojas(
    { Resumen: resumen, Config: config, Catalogo: catalogo, Personas: personas, Registro: registro, "Por persona": porPersona },
    {
      Resumen: [16, 34, 14, 14, 16, 10],
      Catalogo: [38, ...codigos.map(() => 14)],
      Personas: [34, 20, 14, 8],
      Registro: [12, 6, 12, 30, 12, 34, 10, 12, 12, 10, 11, 26, 14],
      "Por persona": [34, 20, 14, 10, 14, 14, 14],
    }
  );

  const sello = `${datos.config.anio}-${String(datos.config.mes).padStart(2, "0")}`;
  descargarBlob(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `arroz-paisa-${sello}.xlsx`
  );
}

/**
 * Exporta SOLO lo de una empresa.
 * Sirve para mandarle el archivo al contador de esa fábrica sin que vea
 * ni un dato de las otras: los datos de las demás no van en el archivo.
 */
export async function exportarEmpresaAExcel(datos, codigoEmpresa, anio, mes) {
  const empresas = indicePorCodigo(datos.empresas);
  const empresa = empresas[codigoEmpresa];
  if (!empresa) throw new Error("Esa empresa no existe.");

  const mios = delMes(datos.consumos, anio, mes).filter((c) => c.empresa === codigoEmpresa);

  const detalle = [
    ["Fecha", "Día", "Persona", "Producto", "Cantidad", "Precio Unit.", "Subtotal", "Quincena", "Se cobra"],
    ...mios
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.persona.localeCompare(b.persona, "es"))
      .map((c) => [
        c.fecha, Number(c.fecha.slice(8, 10)), c.persona, c.producto, c.cantidad,
        c.precioUnitario, subtotal(c), quincenaDe(c.fecha, empresa) || "",
        { empresa: "SÍ", contado: "NO, pagó de una", cortesia: "NO, cortesía" }[formaDeCobro(c)],
      ]),
  ];

  const q1 = mios.filter((c) => loPagaLaEmpresa(c) && quincenaDe(c.fecha, empresa) === 1);
  const q2 = mios.filter((c) => loPagaLaEmpresa(c) && quincenaDe(c.fecha, empresa) === 2);

  const portada = [
    ["CONSUMO DE ALMUERZOS"],
    [sedeDeEmpresa(empresa)],
    [razonSocialDe(empresa, { conNit: true })],
    ["NIT", empresa.nit],
    [],
    ["Periodo", `${nombreMes(mes)} ${anio}`],
    ["Proveedor", datos.config.acreedor.nombre],
    ["NIT proveedor", datos.config.acreedor.nit],
    [],
    ["", "Facturas", "Total"],
    ["Quincena 1", contarFacturas(q1), sumar(q1)],
    ["Quincena 2", contarFacturas(q2), sumar(q2)],
    ["TOTAL DEL MES", contarFacturas([...q1, ...q2]), sumar(q1) + sumar(q2)],
  ];

  const personas = [
    ["Persona", "Facturas", "Quincena 1", "Quincena 2", "Mes"],
    ...informePorPersona(datos.consumos, anio, mes, empresas)
      .filter((f) => f.empresa === codigoEmpresa)
      .map((f) => [f.persona, f.facturas, f.q1, f.q2, f.mes]),
  ];

  const bytes = await archivoDesdeHojas(
    { Portada: portada, "Por persona": personas, Detalle: detalle },
    { Portada: [22, 14, 16], "Por persona": [34, 10, 14, 14, 14], Detalle: [12, 6, 30, 34, 10, 13, 13, 10, 10] }
  );

  descargarBlob(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${codigoEmpresa}-${anio}-${String(mes).padStart(2, "0")}.xlsx`
  );
}
