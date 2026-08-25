// ============================================================================
//  reporte-empresa.js  -  El archivo que se le manda al cliente.
//
//  El problema a resolver: las personas que controlan los pagos en cada
//  fábrica quieren ver la información, pero NINGUNA puede ver la de las otras.
//
//  La solución es sencilla y no necesita ni servidor ni contraseñas: se genera
//  un archivo .html con SOLO los datos de esa empresa. Es imposible que vea
//  las otras, porque los datos de las otras no están adentro del archivo.
//  Se manda por WhatsApp o por correo y se abre con doble clic o desde el
//  celular. Se ve como una página, se puede imprimir y no se puede editar.
// ============================================================================

import { descargarBlob } from "../datos/almacen.js";
import { pesos, fechaCorta, fechaLarga, nombreMes } from "../nucleo/formato.js";
import {
  indicePorCodigo, quincenaDe, subtotal, delMes, sumar, contarFacturas,
  informePorPersona, rangoQuincena,
} from "../nucleo/calculos.js";

/** Nada de lo que escriba la señora puede convertirse en código HTML. */
function esc(txt) {
  return String(txt === null || txt === undefined ? "" : txt)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generarReporteEmpresa(datos, codigoEmpresa, anio, mes) {
  const empresas = indicePorCodigo(datos.empresas);
  const empresa = empresas[codigoEmpresa];
  if (!empresa) throw new Error("Esa empresa no existe.");

  // Solo lo de esta empresa. Nada más entra en el archivo.
  const mios = delMes(datos.consumos, anio, mes).filter((c) => c.empresaFactura === codigoEmpresa);
  const cobrables = mios.filter((c) => c.facturable !== false);
  const q1 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 1);
  const q2 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 2);
  const r1 = rangoQuincena(anio, mes, 1, empresa);
  const r2 = rangoQuincena(anio, mes, 2, empresa);

  // Por día
  const porDia = new Map();
  for (const c of mios) {
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, []);
    porDia.get(c.fecha).push(c);
  }
  const dias = [...porDia.keys()].sort();

  // Por plato
  const porPlato = new Map();
  for (const c of cobrables) {
    const llave = c.producto + "|" + c.precioUnitario;
    if (!porPlato.has(llave)) porPlato.set(llave, { producto: c.producto, precio: c.precioUnitario, cantidad: 0, total: 0 });
    const f = porPlato.get(llave);
    f.cantidad += c.cantidad;
    f.total += subtotal(c);
  }
  const platos = [...porPlato.values()].sort((a, b) => b.total - a.total);

  const personas = informePorPersona(datos.consumos, anio, mes, empresas).filter(
    (f) => f.empresaFactura === codigoEmpresa
  );

  const total = sumar(cobrables);
  const acreedor = datos.config.acreedor || {};

  const html = `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(empresa.razonSocial || empresa.codigo)} · Almuerzos ${esc(nombreMes(mes))} ${anio}</title>
<style>
  :root{--verde:#123c29;--verde2:#23684a;--achiote:#bc4318;--tinta:#16211b;--suave:#6d7d74;--borde:#cfdbcb;--raya:#f4f8f2;--papel:#fff;--fondo:#e9efe6}
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--tinta);font:16px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif}
  header{background:var(--verde);color:#fff;padding:24px 20px}
  .caja{max-width:960px;margin:0 auto}
  header h1{margin:0;font-size:1.5rem;letter-spacing:-.01em}
  header .sub{color:#9dc9b0;font-size:.92rem;margin-top:4px}
  header .prov{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2);font-size:.85rem;color:#bcd8c8}
  main{max-width:960px;margin:0 auto;padding:22px 20px 60px}
  section{background:var(--papel);border:1px solid var(--borde);border-radius:8px;padding:18px;margin-bottom:20px}
  h2{font-size:1.15rem;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--verde)}
  .cifras{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0}
  .cifra{border:1px solid var(--borde);border-radius:6px;padding:12px 14px}
  .cifra dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--suave);font-weight:600}
  .cifra dd{margin:4px 0 0;font-size:1.35rem;font-weight:700;font-variant-numeric:tabular-nums}
  .cifra.total{background:var(--verde);border-color:var(--verde)}
  .cifra.total dt{color:#9dc9b0}.cifra.total dd{color:#fff}
  .marco{overflow-x:auto;border:1px solid var(--borde);border-radius:6px}
  table{width:100%;border-collapse:collapse;font-size:.92rem}
  th{background:var(--verde);color:#fff;text-align:left;padding:9px 10px;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
  td{padding:8px 10px;border-top:1px solid var(--borde);vertical-align:top}
  tr:nth-child(even) td{background:var(--raya)}
  .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tfoot td{border-top:2px solid var(--verde);font-weight:700;background:#fbfcfa}
  .dia{margin-bottom:18px}
  .dia h3{font-size:1rem;margin:0 0 8px;display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
  .dia h3 span{font-weight:400;color:var(--suave);font-size:.85rem}
  .nocobra{color:var(--suave);font-style:italic}
  footer{max-width:960px;margin:0 auto;padding:0 20px 40px;color:var(--suave);font-size:.82rem}
  .aviso{background:#fdf1d8;border:1px solid #ecd9ac;border-left:4px solid #b47500;border-radius:6px;padding:12px 14px;font-size:.88rem;margin-bottom:20px}
  @media print{body{background:#fff}section{border:none;padding:0;margin-bottom:24px;break-inside:avoid}header{background:#123c29!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}th{background:#123c29!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<header>
  <div class="caja">
    <h1>${esc(empresa.razonSocial || empresa.codigo)}</h1>
    <div class="sub">Consumo de almuerzos · ${esc(nombreMes(mes))} de ${anio} · Sede ${esc(empresa.codigo)}${empresa.nit ? " · NIT " + esc(empresa.nit) : ""}</div>
    <div class="prov">Proveedor: ${esc(acreedor.nombre || "")}${acreedor.nit ? " · NIT " + esc(acreedor.nit) : ""}${acreedor.ciudad ? " · " + esc(acreedor.ciudad) : ""}</div>
  </div>
</header>

<main>
  <section>
    <h2>Resumen del mes</h2>
    <dl class="cifras">
      <div class="cifra"><dt>Quincena 1 (${r1.desde} al ${r1.hasta})</dt><dd>${esc(pesos(sumar(q1)))}</dd></div>
      <div class="cifra"><dt>Quincena 2 (${r2.desde} al ${r2.hasta})</dt><dd>${esc(pesos(sumar(q2)))}</dd></div>
      <div class="cifra"><dt>Facturas</dt><dd>${contarFacturas(cobrables)}</dd></div>
      <div class="cifra total"><dt>Total del mes</dt><dd>${esc(pesos(total))}</dd></div>
    </dl>
  </section>

  <section>
    <h2>Qué se consumió</h2>
    <div class="marco"><table>
      <thead><tr><th>Plato</th><th class="n">Cantidad</th><th class="n">Valor unitario</th><th class="n">Total</th></tr></thead>
      <tbody>
        ${platos.map((p) => `<tr><td>${esc(p.producto)}</td><td class="n">${p.cantidad}</td><td class="n">${esc(pesos(p.precio))}</td><td class="n">${esc(pesos(p.total))}</td></tr>`).join("\n        ")}
      </tbody>
      <tfoot><tr><td>TOTAL</td><td class="n">${platos.reduce((a, p) => a + p.cantidad, 0)}</td><td></td><td class="n">${esc(pesos(total))}</td></tr></tfoot>
    </table></div>
  </section>

  <section>
    <h2>Quién consumió</h2>
    <div class="marco"><table>
      <thead><tr><th>Persona</th><th class="n">Facturas</th><th class="n">Quincena 1</th><th class="n">Quincena 2</th><th class="n">Mes</th></tr></thead>
      <tbody>
        ${personas.map((p) => `<tr><td>${esc(p.persona)}</td><td class="n">${p.facturas}</td><td class="n">${esc(pesos(p.q1))}</td><td class="n">${esc(pesos(p.q2))}</td><td class="n">${esc(pesos(p.mes))}</td></tr>`).join("\n        ")}
      </tbody>
      <tfoot><tr><td>TOTAL</td><td class="n">${personas.reduce((a, p) => a + p.facturas, 0)}</td><td class="n">${esc(pesos(sumar(q1)))}</td><td class="n">${esc(pesos(sumar(q2)))}</td><td class="n">${esc(pesos(total))}</td></tr></tfoot>
    </table></div>
  </section>

  <section>
    <h2>Día por día</h2>
    ${dias.map((f) => {
      const renglones = porDia.get(f);
      const totalDia = sumar(renglones);
      return `<div class="dia">
      <h3>${esc(fechaLarga(f))} <span>${contarFacturas(renglones)} facturas · ${esc(pesos(totalDia))}</span></h3>
      <div class="marco"><table>
        <thead><tr><th>Persona</th><th>Plato</th><th class="n">Cant.</th><th class="n">Valor</th></tr></thead>
        <tbody>
          ${renglones
            .slice()
            .sort((a, b) => a.persona.localeCompare(b.persona, "es"))
            .map((c) => `<tr><td>${esc(c.persona)}</td><td${c.facturable === false ? ' class="nocobra"' : ""}>${esc(c.producto)}${c.facturable === false ? " (no se cobra)" : ""}</td><td class="n">${c.cantidad}</td><td class="n">${c.facturable === false ? "—" : esc(pesos(subtotal(c)))}</td></tr>`)
            .join("\n          ")}
        </tbody>
      </table></div></div>`;
    }).join("\n    ")}
  </section>
</main>

<footer>
  Documento generado el ${esc(fechaCorta(new Date().toISOString().slice(0, 10)))} por ${esc(acreedor.nombre || "el proveedor")}.
  Contiene únicamente la información de ${esc(empresa.razonSocial || empresa.codigo)} — sede ${esc(empresa.codigo)}.
</footer>
</body>
</html>`;

  return { html, empresa, total, renglones: mios.length };
}

/** Genera el reporte y lo baja como archivo, listo para mandar. */
export function descargarReporteEmpresa(datos, codigoEmpresa, anio, mes) {
  const { html } = generarReporteEmpresa(datos, codigoEmpresa, anio, mes);
  descargarBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${codigoEmpresa}-almuerzos-${anio}-${String(mes).padStart(2, "0")}.html`
  );
}
