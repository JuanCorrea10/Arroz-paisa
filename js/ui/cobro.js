// ============================================================================
//  cobro.js  -  La cuenta de cobro y lo que se le manda a cada empresa.
//
//  Es el documento que el cliente recibe en la mano, así que se ve tal cual
//  va a quedar impreso. De aquí sale también el archivo que se le manda al
//  contador de la fábrica: uno por empresa, con los datos de esa empresa
//  y de ninguna otra.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, mensaje, confirmar, poner } from "./componentes.js";
import { estado, empresas, empresaPorCodigo, asegurarEmpresa } from "./estado.js";
import { pesos, nombreMes, fechaCorta } from "../nucleo/formato.js";
import { cuentaDeCobro, deQuincena, sumar } from "../nucleo/calculos.js";
import { pdfCuentaDeCobro } from "../exportar/pdf.js";
import { descargarReporteEmpresa } from "../exportar/reporte-empresa.js";
import { exportarEmpresaAExcel } from "../exportar/excel-export.js";

let quincena = 1;
let empresaCobro = null;

export function pintarCobro(raiz) {
  vaciar(raiz);
  const repintar = () => pintarCobro(raiz);

  if (!empresas().length) {
    poner(raiz, 
      el("div", { clase: "encabezado-pantalla" }, el("div", {}, el("h1", { texto: "Cuenta de cobro" }))),
      vacio("Todavía no hay empresas", el("p", {}, "Cree las empresas en ", el("a", { href: "#empresas", texto: "Empresas" }), "."))
    );
    return;
  }
  if (!empresaCobro || !empresas().some((e) => e.codigo === empresaCobro)) {
    empresaCobro = (asegurarEmpresa() || empresas()[0]).codigo;
  }

  const empresa = empresaPorCodigo(empresaCobro);
  const acreedor = estado.datos.config.acreedor || {};
  const cuenta = cuentaDeCobro(estado.datos.consumos, estado.anio, estado.mes, quincena, empresa);

  // Aviso importante: si en esa quincena hay algo en $0, la cuenta sale corta.
  const enCero = deQuincena(estado.datos.consumos, estado.anio, estado.mes, quincena, empresa).filter(
    (c) => c.facturable !== false && !(c.precioUnitario > 0)
  );

  poner(raiz, 
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuenta de cobro" }),
        el("p", { texto: "Elija la empresa y la quincena. El documento sale listo para entregar." })
      ),
      acciones(
        el("button", { clase: "chico", alHacerClic: () => window.print() }, "Imprimir"),
        el("button", {
          clase: "principal chico",
          alHacerClic: () => {
            try { pdfCuentaDeCobro(cuenta, acreedor); mensaje("PDF descargado.", "bien"); }
            catch (e) { mensaje(e.message, "malo", 8); }
          },
        }, "Bajar PDF")
      )
    ),
    el("div", { clase: "mando" },
      el("div", { clase: "campo" },
        el("label", { for: "cobro-empresa", texto: "Empresa" }),
        el("select", { id: "cobro-empresa", alCambiar: (e) => { empresaCobro = e.target.value; repintar(); } },
          ...empresas().map((e) => el("option", { value: e.codigo, selected: e.codigo === empresaCobro }, `${e.codigo} — ${e.razonSocial}`)))
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-quincena", texto: "Quincena" }),
        el("select", { id: "cobro-quincena", alCambiar: (e) => { quincena = Number(e.target.value); repintar(); } },
          el("option", { value: 1, selected: quincena === 1 }, `Quincena 1 (día 1 al ${empresa.ultimoDiaQ1})`),
          el("option", { value: 2, selected: quincena === 2 }, `Quincena 2 (día ${empresa.ultimoDiaQ1 + 1} en adelante)`))
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-mes", texto: "Mes" }),
        el("select", { id: "cobro-mes", alCambiar: (e) => { estado.mes = Number(e.target.value); repintar(); } },
          ...Array.from({ length: 12 }, (_, i) => i + 1).map((m) => el("option", { value: m, selected: m === estado.mes }, nombreMes(m))))
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-anio", texto: "Año" }),
        el("select", { id: "cobro-anio", alCambiar: (e) => { estado.anio = Number(e.target.value); repintar(); } },
          ...Array.from({ length: 5 }, (_, i) => estado.anio - 3 + i).map((a) => el("option", { value: a, selected: a === estado.anio }, String(a))))
      )
    )
  );

  if (enCero.length) {
    poner(raiz, 
      el("div", { clase: "nota malo no-imprimir" },
        el("div", {},
          el("strong", { texto: `${enCero.length} ${enCero.length === 1 ? "renglón está" : "renglones están"} en $ 0` }),
          el("p", { texto: "Si manda la cuenta así, va a cobrar de menos. Arréglelos antes de entregarla." })
        ),
        el("div", { clase: "acciones" },
          el("a", { clase: "boton chico", href: "#revisar", texto: "Ver qué falta" }))
      )
    );
  }

  if (!cuenta.filas.length) {
    poner(raiz, vacio(
      `No hay nada que cobrarle a ${empresaCobro} en la quincena ${quincena} de ${nombreMes(estado.mes)}`,
      "Pruebe con la otra quincena, con otro mes o con otra empresa."
    ));
  } else {
    poner(raiz, documentoDeCobro(cuenta, acreedor));
  }

  poner(raiz, paraElCliente(empresa));
}

// ---------------------------------------------------------------------------

function documentoDeCobro(cuenta, acreedor) {
  const { empresa, rango, mes, anio, filas, total, facturas } = cuenta;

  return el("div", { clase: "documento" },
    el("h2", { texto: "Cuenta de cobro" }),

    el("div", { clase: "partes" },
      el("div", { clase: "parte" },
        el("h4", { texto: "Quien cobra" }),
        el("div", { clase: "nombre", texto: acreedor.nombre || "—" }),
        el("div", { clase: "nit", texto: acreedor.nit ? "NIT " + acreedor.nit : "" }),
        el("div", { clase: "nit", texto: acreedor.ciudad || "" })
      ),
      el("div", { clase: "parte" },
        el("h4", { texto: "A quien se le cobra" }),
        el("div", { clase: "nombre", texto: empresa.razonSocial || empresa.codigo }),
        el("div", { clase: "nit", texto: empresa.nit ? "NIT " + empresa.nit : "" }),
        el("div", { clase: "nit", texto: "Sede " + empresa.codigo })
      )
    ),

    el("p", {},
      el("strong", { texto: "Concepto: " }),
      `Almuerzos y bebidas suministrados del ${rango.desde} al ${rango.hasta} de ${nombreMes(mes).toLowerCase()} de ${anio}.`
    ),

    el("dl", { clase: "cifras", estilo: "margin:var(--e4) 0" },
      cifra("Quincena", String(cuenta.quincena)),
      cifra("Facturas", String(facturas)),
      cifra("Unidades", String(filas.reduce((a, f) => a + f.cantidad, 0))),
      cifraPlata("Total a pagar", total, true)
    ),

    tabla(
      [{ titulo: "Plato" }, { titulo: "Cantidad", clase: "n" }, { titulo: "Valor unitario", clase: "n" }, { titulo: "Total", clase: "n" }],
      filas.map((f) =>
        el("tr", {},
          el("td", { texto: f.producto }),
          el("td", { clase: "n", texto: String(f.cantidad) }),
          el("td", { clase: "n", texto: pesos(f.precioUnitario) }),
          el("td", { clase: "n", texto: pesos(f.total) })
        )
      ),
      el("tr", {},
        el("td", { colspan: "3", texto: "TOTAL A PAGAR" }),
        el("td", { clase: "n", texto: pesos(total) })
      )
    ),

    el("div", { clase: "cierre" },
      el("div", { clase: "firma" }, acreedor.nombre || "", el("br"), acreedor.nit ? "NIT " + acreedor.nit : ""),
      el("div", { clase: "firma", texto: "Recibido / Aprobado" })
    )
  );
}

// ---------------------------------------------------------------------------
//  Lo que se le manda al contador de la fábrica
// ---------------------------------------------------------------------------

function paraElCliente(empresa) {
  return el("div", { clase: "tarjeta no-imprimir", estilo: "margin-top:var(--e6)" },
    el("h3", { texto: `Mandarle la información a ${empresa.codigo}` }),
    el("p", { estilo: "color:var(--tinta-media)" },
      "Estos archivos traen ",
      el("strong", { texto: "únicamente" }),
      ` los datos de ${empresa.razonSocial || empresa.codigo}. No hay forma de que vean los de las otras empresas, porque no van adentro del archivo.`
    ),
    el("div", { clase: "fila" },
      el("button", {
        clase: "verde",
        alHacerClic: () => {
          try {
            descargarReporteEmpresa(estado.datos, empresa.codigo, estado.anio, estado.mes);
            mensaje("Reporte descargado. Mándelo por WhatsApp o por correo.", "bien", 6);
          } catch (e) { mensaje(e.message, "malo", 8); }
        },
      }, "Reporte del mes (para ver en el celular)"),
      el("button", {
        alHacerClic: async () => {
          try {
            await exportarEmpresaAExcel(estado.datos, empresa.codigo, estado.anio, estado.mes);
            mensaje("Excel descargado.", "bien");
          } catch (e) { mensaje(e.message, "malo", 8); }
        },
      }, "Excel del mes"),
      el("button", {
        alHacerClic: () => {
          try {
            const acreedor = estado.datos.config.acreedor || {};
            pdfCuentaDeCobro(cuentaDeCobro(estado.datos.consumos, estado.anio, estado.mes, 1, empresa), acreedor);
            pdfCuentaDeCobro(cuentaDeCobro(estado.datos.consumos, estado.anio, estado.mes, 2, empresa), acreedor);
            mensaje("Bajé las dos cuentas de cobro del mes.", "bien");
          } catch (e) { mensaje(e.message, "malo", 8); }
        },
      }, "Las dos cuentas de cobro en PDF")
    ),
    el("p", { estilo: "color:var(--tinta-suave);font-size:var(--t-sm);margin:var(--e3) 0 0" },
      "El reporte es un archivo que se abre con doble clic o desde el celular. Se puede ver e imprimir, pero no se puede modificar."
    )
  );
}

/** Los totales de todas las empresas, para la pantalla de inicio. */
export function totalesDelMes() {
  return empresas().map((e) => {
    const q1 = sumar(deQuincena(estado.datos.consumos, estado.anio, estado.mes, 1, e).filter((c) => c.facturable !== false));
    const q2 = sumar(deQuincena(estado.datos.consumos, estado.anio, estado.mes, 2, e).filter((c) => c.facturable !== false));
    return { empresa: e, q1, q2, total: q1 + q2 };
  });
}

export { fechaCorta };
