// ============================================================================
//  pdf.js  -  Los documentos que se le entregan a la gente.
//
//  La cuenta de cobro es lo que el cliente recibe en la mano: tiene que verse
//  como un documento serio, no como una captura de pantalla.
// ============================================================================

import { pesos, fechaCorta, fechaLarga, nombreMes } from "../nucleo/formato.js";

const VERDE = [18, 60, 41];
const ACHIOTE = [188, 67, 24];
const GRIS = [109, 125, 116];
const RAYA = [244, 248, 242];

function nuevoDocumento(orientacion = "p") {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("No se pudo cargar el creador de PDF. Recargue la página (Ctrl + F5).");
  }
  return new window.jspdf.jsPDF({ orientation: orientacion, unit: "mm", format: "letter" });
}

/** El encabezado verde que llevan todos los documentos. */
function encabezado(doc, titulo, subtitulo, acreedor) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, ancho, 26, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(titulo, 14, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(subtitulo, 14, 19);

  if (acreedor && acreedor.nombre) {
    doc.setFontSize(9);
    doc.text(acreedor.nombre, ancho - 14, 12, { align: "right" });
    if (acreedor.nit) doc.text("NIT " + acreedor.nit, ancho - 14, 17.5, { align: "right" });
    if (acreedor.ciudad) doc.text(acreedor.ciudad, ancho - 14, 22.5, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
  return 34;
}

/** El pie con la fecha en que se generó y el número de página. */
function pieDePagina(doc) {
  const total = doc.internal.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Generado el ${fechaCorta(new Date().toISOString().slice(0, 10))}`, 14, alto - 8);
    doc.text(`Página ${i} de ${total}`, ancho - 14, alto - 8, { align: "right" });
  }
}

const estiloTabla = {
  theme: "grid",
  headStyles: { fillColor: VERDE, textColor: 255, fontStyle: "bold", fontSize: 9.5 },
  bodyStyles: { fontSize: 9.5, textColor: [22, 33, 27] },
  alternateRowStyles: { fillColor: RAYA },
  styles: { cellPadding: 2.2, lineColor: [207, 219, 203], lineWidth: 0.15 },
  margin: { left: 14, right: 14 },
};

function guardar(doc, nombre) {
  doc.save(nombre);
}

// ---------------------------------------------------------------------------
//  Cuenta de cobro
// ---------------------------------------------------------------------------

export function pdfCuentaDeCobro(cuenta, acreedor) {
  const doc = nuevoDocumento();
  const { empresa, anio, mes, quincena, rango, filas, total, facturas, fechaCuenta } = cuenta;
  const periodo = `Del ${rango.desde} al ${rango.hasta} de ${nombreMes(mes).toLowerCase()} de ${anio}`;

  let y = encabezado(doc, "CUENTA DE COBRO", `${nombreMes(mes)} ${anio} · Quincena ${quincena}`, acreedor);

  // La fecha en que se pasa la cuenta, si ella la puso. No se inventa: un
  // documento con fecha inventada es peor que uno sin fecha.
  if (fechaCuenta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    const ciudad = acreedor && acreedor.ciudad ? acreedor.ciudad + ", " : "";
    doc.text(ciudad + fechaLarga(fechaCuenta), 196, y - 2, { align: "right" });
    y += 4;
  }

  // Quién le cobra a quién. Es lo primero que mira el contador del cliente.
  doc.setDrawColor(207, 219, 203);
  doc.setFillColor(251, 252, 250);
  doc.roundedRect(14, y, 88, 26, 1.5, 1.5, "FD");
  doc.roundedRect(108, y, 88, 26, 1.5, 1.5, "FD");

  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text("QUIEN COBRA", 18, y + 6);
  doc.text("A QUIEN SE LE COBRA", 112, y + 6);

  doc.setTextColor(22, 33, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(acreedor.nombre || "-", 80), 18, y + 12);
  doc.text(doc.splitTextToSize(empresa.razonSocial || empresa.codigo, 80), 112, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("NIT " + (acreedor.nit || "-"), 18, y + 21);
  doc.text("NIT " + (empresa.nit || "-"), 112, y + 21);

  y += 33;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Concepto:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Almuerzos y bebidas suministrados. ${periodo}.`, 36, y);
  y += 8;

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Plato", "Cantidad", "Valor unitario", "Total"]],
    body: filas.map((f) => [f.producto, String(f.cantidad), pesos(f.precioUnitario), pesos(f.total)]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 24 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 34 },
    },
    foot: [["TOTAL A PAGAR", "", "", pesos(total)]],
    footStyles: { fillColor: [255, 255, 255], textColor: VERDE, fontStyle: "bold", fontSize: 12, lineWidth: 0.4, lineColor: VERDE, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
  });

  let fin = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`${facturas} facturas · ${filas.reduce((a, f) => a + f.cantidad, 0)} unidades en total`, 14, fin);

  fin += 26;
  const ancho = doc.internal.pageSize.getWidth();
  doc.setDrawColor(22, 33, 27);
  doc.line(14, fin, 90, fin);
  doc.setTextColor(22, 33, 27);
  doc.setFontSize(9);
  doc.text(acreedor.nombre || "", 14, fin + 5);
  if (acreedor.nit) doc.text("NIT " + acreedor.nit, 14, fin + 10);
  doc.line(ancho - 90, fin, ancho - 14, fin);
  doc.text("Recibido / Aprobado", ancho - 90, fin + 5);

  pieDePagina(doc);
  guardar(doc, `cuenta-de-cobro-${empresa.codigo}-${anio}-${String(mes).padStart(2, "0")}-Q${quincena}.pdf`);
}

// ---------------------------------------------------------------------------
//  Resumen del día
// ---------------------------------------------------------------------------

export function pdfResumenDia(informe, nombreEmpresa, acreedor) {
  const doc = nuevoDocumento();
  const y = encabezado(
    doc,
    "RESUMEN DEL DÍA",
    `${fechaLarga(informe.fecha)} · ${nombreEmpresa}`,
    acreedor
  );
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Plato", "Cantidad", "Valor unitario", "Total"]],
    body: informe.filas.map((f) => [
      f.producto + (f.facturable ? "" : "  (no se cobra)"),
      String(f.cantidad),
      f.facturable ? pesos(f.precioUnitario) : "-",
      f.facturable ? pesos(f.total) : "-",
    ]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 24 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 34 },
    },
    foot: [[`TOTAL · ${informe.facturas} facturas`, "", "", pesos(informe.total)]],
    footStyles: { fillColor: [255, 255, 255], textColor: VERDE, fontStyle: "bold", fontSize: 11.5, lineWidth: 0.4, lineColor: VERDE, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
  });
  pieDePagina(doc);
  guardar(doc, `resumen-${informe.fecha}-${nombreEmpresa.replace(/\s+/g, "-")}.pdf`);
}

// ---------------------------------------------------------------------------
//  Cocina
// ---------------------------------------------------------------------------

export function pdfCocina(filas, fecha, codigos, acreedor) {
  const doc = nuevoDocumento();
  const y = encabezado(doc, "LO QUE HAY QUE PREPARAR", fechaLarga(fecha), acreedor);
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Plato", ...codigos, "TOTAL"]],
    body: filas.map((f) => [f.producto, ...codigos.map((c) => String(f.porEmpresa[c] || 0)), String(f.total)]),
    columnStyles: Object.fromEntries(
      codigos.map((_, i) => [i + 1, { halign: "right", cellWidth: 22 }]).concat([
        [codigos.length + 1, { halign: "right", cellWidth: 22, fontStyle: "bold" }],
      ])
    ),
    foot: [["TOTAL DE PLATOS", ...codigos.map((c) => String(filas.reduce((a, f) => a + (f.porEmpresa[c] || 0), 0))),
      String(filas.reduce((a, f) => a + f.total, 0))]],
    footStyles: { fillColor: [255, 255, 255], textColor: VERDE, fontStyle: "bold", fontSize: 11, lineWidth: 0.4, lineColor: VERDE, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
  });
  pieDePagina(doc);
  guardar(doc, `cocina-${fecha}.pdf`);
}

// ---------------------------------------------------------------------------
//  Consumo por persona
// ---------------------------------------------------------------------------

export function pdfPorPersona(filas, anio, mes, nombreEmpresa, acreedor) {
  const doc = nuevoDocumento();
  const y = encabezado(doc, "CONSUMO POR PERSONA", `${nombreMes(mes)} ${anio} · ${nombreEmpresa}`, acreedor);
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Persona", "Empresa", "Facturas", "Quincena 1", "Quincena 2", "Mes"]],
    body: filas.map((f) => [
      f.persona, f.empresaCome, String(f.facturas), pesos(f.q1), pesos(f.q2), pesos(f.mes),
    ]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 24 },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 28, fontStyle: "bold" },
    },
    foot: [["TOTAL", "", String(filas.reduce((a, f) => a + f.facturas, 0)),
      pesos(filas.reduce((a, f) => a + f.q1, 0)),
      pesos(filas.reduce((a, f) => a + f.q2, 0)),
      pesos(filas.reduce((a, f) => a + f.mes, 0))]],
    footStyles: { fillColor: [255, 255, 255], textColor: VERDE, fontStyle: "bold", fontSize: 10, lineWidth: 0.4, lineColor: VERDE, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index <= 1) d.cell.styles.halign = "left"; },
  });
  pieDePagina(doc);
  guardar(doc, `consumo-por-persona-${anio}-${String(mes).padStart(2, "0")}.pdf`);
}

// ---------------------------------------------------------------------------
//  Cuadre de facturas
// ---------------------------------------------------------------------------

export function pdfCuadre(filas, anio, mes, acreedor) {
  const doc = nuevoDocumento();
  const y = encabezado(doc, "CUADRE DE FACTURAS", `${nombreMes(mes)} ${anio}`, acreedor);
  const conDato = filas.filter((f) => f.declarado !== null);
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Día", "Dijo el trabajador", "Hay registradas", "Diferencia", "Estado"]],
    body: conDato.map((f) => [
      fechaCorta(f.fecha), String(f.declarado), String(f.registradas),
      f.diferencia > 0 ? "+" + f.diferencia : String(f.diferencia),
      f.estado === "cuadra" ? "Cuadra" : "NO cuadra",
    ]),
    columnStyles: {
      0: { cellWidth: 30 },
      1: { halign: "right", cellWidth: 38 },
      2: { halign: "right", cellWidth: 38 },
      3: { halign: "right", cellWidth: 28 },
      4: { cellWidth: "auto" },
    },
    didParseCell: (d) => {
      if (d.section === "body" && conDato[d.row.index] && conDato[d.row.index].estado === "no-cuadra") {
        d.cell.styles.textColor = ACHIOTE;
        if (d.column.index >= 3) d.cell.styles.fontStyle = "bold";
      }
    },
  });
  pieDePagina(doc);
  guardar(doc, `cuadre-${anio}-${String(mes).padStart(2, "0")}.pdf`);
}
