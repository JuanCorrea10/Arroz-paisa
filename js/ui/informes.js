// ============================================================================
//  informes.js  -  Cocina, Resumen del día, Consumo por persona y Cuadre.
//
//  Todas siguen el mismo molde: unos controles arriba, unos números grandes,
//  una tabla, y botones para imprimir o bajar el PDF.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, mensaje, cinta, poner, botonQueTrabaja,
} from "./componentes.js";
import { estado, cambio, empresas, empresaPorCodigo } from "./estado.js";
import { pesos, fechaLarga, fechaCorta, nombreMes, diasDelMes, hoyISO } from "../nucleo/formato.js";
import {
  informeCocina, informeDia, informePorPersona, informeCuadre, notasDelDia,
  indicePorCodigo, delDia, contarFacturas,
  A_CREDITO, DE_CONTADO, CORTESIA,
} from "../nucleo/calculos.js";
import { pdfCocina, pdfResumenDia, pdfPorPersona, pdfCuadre } from "../exportar/pdf.js";

/** El selector de día que usan varias pantallas. */
function selectorDeDia(alCambiar) {
  return el("div", { clase: "campo" },
    el("label", { for: "dia-informe", texto: "Día" }),
    el("input", {
      type: "date", id: "dia-informe", value: estado.fecha,
      alCambiar: (e) => { estado.fecha = e.target.value || hoyISO(); alCambiar(); },
    }),
    el("small", { estilo: "color:var(--tinta-suave)", texto: fechaLarga(estado.fecha) })
  );
}

/** El selector de mes y año que usan los informes del mes. */
function selectorDeMes(alCambiar) {
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const anios = [];
  for (let a = estado.anio - 3; a <= estado.anio + 1; a++) anios.push(a);
  return [
    el("div", { clase: "campo" },
      el("label", { for: "mes-informe", texto: "Mes" }),
      el("select", { id: "mes-informe", alCambiar: (e) => { estado.mes = Number(e.target.value); alCambiar(); } },
        ...meses.map((m) => el("option", { value: m, selected: m === estado.mes }, nombreMes(m))))
    ),
    el("div", { clase: "campo" },
      el("label", { for: "anio-informe", texto: "Año" }),
      el("select", { id: "anio-informe", alCambiar: (e) => { estado.anio = Number(e.target.value); alCambiar(); } },
        ...anios.map((a) => el("option", { value: a, selected: a === estado.anio }, String(a))))
    ),
  ];
}

/** Selector de empresa que puede incluir la opción "todas". */
function selectorDeEmpresa(valor, alCambiar, conTodas = true) {
  return el("div", { clase: "campo" },
    el("label", { for: "empresa-informe", texto: "Empresa" }),
    el("select", { id: "empresa-informe", alCambiar: (e) => alCambiar(e.target.value) },
      conTodas ? el("option", { value: "", selected: !valor }, "Todas las empresas") : null,
      ...empresas().map((e) => el("option", { value: e.codigo, selected: e.codigo === valor }, `${e.codigo} — ${e.razonSocial}`))
    ),
    // El renglon de ayuda va aunque este vacio: asi los dos campos miden
    // igual y la caja no cambia de alto al elegir otra empresa.
    el("small", { estilo: "color:var(--tinta-suave)", texto: valor ? (empresaPorCodigo(valor) || {}).razonSocial || "" : "Sirve para ver todo junto" })
  );
}

function botonImprimir() {
  return el("button", { clase: "chico", alHacerClic: () => window.print() }, "Imprimir");
}

// ===========================================================================
//  1. COCINA
// ===========================================================================

export function pintarCocina(raiz) {
  vaciar(raiz);
  const repintar = () => pintarCocina(raiz);
  const codigos = empresas().map((e) => e.codigo);
  // Las notas del día. Se calculan aquí arriba, con lo demás, porque el
  // botón de bajar el PDF las necesita y se crea antes que la tabla.
  const notas = notasDelDia(estado.datos.consumos, estado.fecha, codigos);

  const filas = informeCocina(estado.datos.consumos, estado.fecha, codigos);
  const totalPlatos = filas.reduce((a, f) => a + f.total, 0);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cocina" }),
        el("p", { texto: "Cuánto hay que preparar de cada plato. Se mira en la mañana." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => {
            try { pdfCocina(filas, estado.fecha, codigos, estado.datos.config.acreedor, notas); }
            catch (e) { mensaje(e.message, "malo", 8); }
          })
      )
    ),
    el("div", { clase: "mando" }, selectorDeDia(repintar))
  );

  if (!filas.length) {
    poner(raiz, vacio(`No hay nada anotado para el ${fechaCorta(estado.fecha)}`, "Elija otro día, o vaya a Registrar el día."));
    return;
  }

  poner(raiz,
    el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
      cifra("Platos distintos", String(filas.length)),
      cifra("Unidades a preparar", String(totalPlatos), true)
    ),
    tabla(
      [{ titulo: "Plato" }, ...codigos.map((c) => ({ titulo: c, clase: "n" })), { titulo: "Total", clase: "n" }],
      filas.map((f) =>
        el("tr", {},
          el("td", { texto: f.producto }),
          ...codigos.map((c) => el("td", { clase: "n", texto: f.porEmpresa[c] ? String(f.porEmpresa[c]) : "·" })),
          el("td", { clase: "n", estilo: "font-weight:700", texto: String(f.total) })
        )
      ),
      el("tr", {},
        el("td", { texto: "Total de platos" }),
        ...codigos.map((c) => el("td", { clase: "n", texto: String(filas.reduce((a, f) => a + (f.porEmpresa[c] || 0), 0)) })),
        el("td", { clase: "n", texto: String(totalPlatos) })
      )
    )
  );


  // Van APARTE de la tabla y no dentro, porque la tabla agrupa por plato y
  // una nota es de UNA persona: metida ahí, o se pierde o parte el plato en
  // dos filas por un "sin verduras".
  if (notas.length) {
    poner(raiz,
      el("section", { clase: "tarjeta notas-cocina" },
        el("h2", { texto: notas.length === 1 ? "1 plato con nota" : `${notas.length} platos con nota` }),
        el("p", { clase: "nota", texto: "Estos van distintos. Léalos antes de despachar." }),
        tabla(
          [{ titulo: "Empresa" }, { titulo: "Persona" }, { titulo: "Plato" },
           { titulo: "Cant.", clase: "n" }, { titulo: "Nota" }],
          notas.map((n) =>
            el("tr", {},
              el("td", {}, cinta(n.empresa)),
              el("td", { texto: n.persona }),
              el("td", { texto: n.producto }),
              el("td", { clase: "n", texto: String(n.cantidad) }),
              el("td", {}, el("strong", { clase: "texto-nota", texto: n.nota }))
            )
          )
        )
      )
    );
  }
}

// ===========================================================================
//  2. RESUMEN DEL DÍA
// ===========================================================================

let empresaResumen = "";

export function pintarResumenDia(raiz) {
  vaciar(raiz);
  const repintar = () => pintarResumenDia(raiz);
  const informe = informeDia(estado.datos.consumos, estado.fecha, empresaResumen || null);
  const emp = empresaResumen ? empresaPorCodigo(empresaResumen) : null;
  const nombre = emp ? emp.razonSocial || emp.codigo : "Todas las empresas";

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Resumen del día" }),
        el("p", { texto: "Lo que se le manda a la empresa cada día." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => {
            try { pdfResumenDia(informe, nombre, estado.datos.config.acreedor); }
            catch (e) { mensaje(e.message, "malo", 8); }
          })
      )
    ),
    el("div", { clase: "mando" },
      selectorDeDia(repintar),
      selectorDeEmpresa(empresaResumen, (v) => { empresaResumen = v; repintar(); })
    )
  );

  if (!informe.filas.length) {
    poner(raiz, vacio(`No hay nada anotado para el ${fechaCorta(estado.fecha)}`, "Elija otro día u otra empresa."));
    return;
  }

  poner(raiz,
    el("div", { clase: "documento" },
      el("h2", { texto: "Resumen del día" }),
      el("p", { estilo: "text-align:center;color:var(--tinta-media);margin-bottom:var(--e5)" },
        fechaLarga(informe.fecha), " · ", el("strong", { texto: nombre })),
      el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e4)" },
        cifra("Facturas", String(informe.facturas)),
        cifra("Renglones", String(informe.renglones)),
        cifraPlata("Vendido en el día", informe.total, true)
      ),

      // Cuando hubo pagos de contado, hace falta partir el total: uno es
      // plata que va a llegar en la quincena y el otro es plata que TIENE que
      // estar en la caja ahora mismo. Juntos no sirven para cuadrar nada.
      //
      // Si no hubo ninguno, esto no sale: no hay por qué mostrarle una fila
      // en cero todos los días.
      informe.deContado > 0
        ? el("div", { clase: "caja-del-dia" },
            el("dl", { clase: "cifras" },
              cifraPlata("Se le cobra a la empresa", informe.aCredito),
              cifraPlata("Pagaron de una", informe.deContado)
            ),
            el("p", { clase: "nota" },
              "En la caja tienen que estar esos ",
              el("strong", { texto: pesos(informe.deContado) }),
              ". Lo otro se le cobra a la empresa en la cuenta de la quincena."))
        : null,
      tabla(
        [{ titulo: "Plato" }, { titulo: "Cantidad", clase: "n" }, { titulo: "Valor unitario", clase: "n" }, { titulo: "Total", clase: "n" }],
        informe.filas.map((f) =>
          el("tr", {},
            el("td", {}, f.producto,
              f.forma === DE_CONTADO
                ? el("span", { clase: "marca-cobro contado", texto: "pagó de una" })
                : f.forma === CORTESIA
                  ? el("span", { clase: "marca-cobro cortesia", texto: "cortesía" })
                  : null),
            el("td", { clase: "n", texto: String(f.cantidad) }),
            el("td", { clase: "n", texto: f.forma === CORTESIA ? "—" : pesos(f.precioUnitario) }),
            el("td", { clase: "n", texto: f.forma === CORTESIA ? "—" : pesos(f.total) })
          )
        ),
        el("tr", {},
          el("td", { colspan: "3", texto: "TOTAL" }),
          el("td", { clase: "n", texto: pesos(informe.total) })
        )
      )
    )
  );
}

// ===========================================================================
//  3. CONSUMO POR PERSONA
// ===========================================================================

let empresaPersonas = "";

export function pintarPorPersona(raiz) {
  vaciar(raiz);
  const repintar = () => pintarPorPersona(raiz);
  const indice = indicePorCodigo(estado.datos.empresas);
  const filas = informePorPersona(estado.datos.consumos, estado.anio, estado.mes, indice, empresaPersonas || null);
  const emp = empresaPersonas ? empresaPorCodigo(empresaPersonas) : null;
  const nombre = emp ? emp.razonSocial || emp.codigo : "Todas las empresas";

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Consumo por persona" }),
        el("p", { texto: "Cuánto lleva cada persona en la quincena 1, en la quincena 2 y en el mes." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => {
            try { pdfPorPersona(filas, estado.anio, estado.mes, nombre, estado.datos.config.acreedor); }
            catch (e) { mensaje(e.message, "malo", 8); }
          })
      )
    ),
    el("div", { clase: "mando" },
      ...selectorDeMes(repintar),
      selectorDeEmpresa(empresaPersonas, (v) => { empresaPersonas = v; repintar(); })
    )
  );

  if (!filas.length) {
    poner(raiz, vacio(`No hay nada anotado en ${nombreMes(estado.mes)} de ${estado.anio}`, "Elija otro mes u otra empresa."));
    return;
  }

  const tQ1 = filas.reduce((a, f) => a + f.q1, 0);
  const tQ2 = filas.reduce((a, f) => a + f.q2, 0);

  poner(raiz,
    el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
      cifra("Personas", String(filas.length)),
      cifra("Facturas", String(filas.reduce((a, f) => a + f.facturas, 0))),
      cifraPlata("Quincena 1", tQ1),
      cifraPlata("Quincena 2", tQ2),
      cifraPlata("Total del mes", tQ1 + tQ2, true)
    ),
    tabla(
      [
        { titulo: "Persona" }, { titulo: "Empresa" },
        { titulo: "Facturas", clase: "n" }, { titulo: "Quincena 1", clase: "n" },
        { titulo: "Quincena 2", clase: "n" }, { titulo: "Mes", clase: "n" },
      ],
      filas.map((f) =>
        el("tr", {},
          el("td", { texto: f.persona }),
          el("td", {}, cinta(f.empresa)),
          el("td", { clase: "n", texto: String(f.facturas) }),
          el("td", { clase: "n", texto: pesos(f.q1) }),
          el("td", { clase: "n", texto: pesos(f.q2) }),
          el("td", { clase: "n", estilo: "font-weight:700", texto: pesos(f.mes) })
        )
      ),
      el("tr", {},
        el("td", { colspan: "3", texto: "TOTAL" }),
        el("td", { clase: "n", texto: String(filas.reduce((a, f) => a + f.facturas, 0)) }),
        el("td", { clase: "n", texto: pesos(tQ1) }),
        el("td", { clase: "n", texto: pesos(tQ2) }),
        el("td", { clase: "n", texto: pesos(tQ1 + tQ2) })
      )
    )
  );
}

// ===========================================================================
//  4. CUADRE DE FACTURAS
// ===========================================================================

export function pintarCuadre(raiz) {
  vaciar(raiz);
  const repintar = () => pintarCuadre(raiz);
  const filas = informeCuadre(estado.datos.consumos, estado.anio, estado.mes, estado.datos.cuadres);
  const conDato = filas.filter((f) => f.declarado !== null);
  const malos = conDato.filter((f) => f.estado === "no-cuadra");

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuadre de facturas" }),
        el("p", { texto: "Escriba cuántas facturas dice el trabajador que hizo cada día, y la app le dice si cuadra." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => {
            try { pdfCuadre(filas, estado.anio, estado.mes, estado.datos.config.acreedor); }
            catch (e) { mensaje(e.message, "malo", 8); }
          })
      )
    ),
    el("div", { clase: "mando" }, ...selectorDeMes(repintar))
  );

  poner(raiz,
    malos.length
      ? el("div", { clase: "nota malo" },
          el("div", {},
            el("strong", { texto: `${malos.length} ${malos.length === 1 ? "día no cuadra" : "días no cuadran"}` }),
            el("p", { texto: "Son los días en rojo. Revise si falta anotar alguna comanda o si el trabajador contó de más." })
          ))
      : conDato.length
        ? el("div", { clase: "nota bien" },
            el("div", {},
              el("strong", { texto: "Todo cuadra" }),
              el("p", { texto: `Los ${conDato.length} días que ha revisado dan exacto.` })))
        : el("div", { clase: "nota dato" },
            el("div", {},
              el("strong", { texto: "Todavía no ha escrito ningún dato" }),
              el("p", { texto: "En la columna del medio escriba cuántas facturas le dijo el trabajador. Los días vacíos no se revisan." })))
  );

  const cuerpo = filas.map((f) =>
    el("tr", { datos: { estado: f.estado } },
      el("td", { texto: fechaCorta(f.fecha) }),
      el("td", {},
        el("input", {
          type: "number", min: 0, step: 1,
          value: f.declarado === null ? "" : String(f.declarado),
          "aria-label": `Facturas que dijo el trabajador el ${fechaCorta(f.fecha)}`,
          estilo: "max-width:9rem;min-height:40px",
          alCambiar: (e) => {
            const v = e.target.value.trim();
            if (v === "") delete estado.datos.cuadres[f.fecha];
            else estado.datos.cuadres[f.fecha] = Number(v);
            cambio();
            repintar();
          },
        })
      ),
      el("td", { clase: "n", texto: String(f.registradas) }),
      el("td", { clase: "n diferencia", texto: f.diferencia === null ? "" : f.diferencia > 0 ? "+" + f.diferencia : String(f.diferencia) }),
      el("td", {
        texto: f.estado === "sin-dato" ? "" : f.estado === "cuadra" ? "Cuadra" : "NO cuadra",
        estilo: f.estado === "no-cuadra" ? "color:var(--rojo);font-weight:700" : "color:var(--verde)",
      })
    )
  );

  poner(raiz,
    tabla(
      [
        { titulo: "Día" }, { titulo: "Dijo el trabajador" }, { titulo: "Hay registradas", clase: "n" },
        { titulo: "Diferencia", clase: "n" }, { titulo: "" },
      ],
      cuerpo,
      el("tr", {},
        el("td", { texto: `${nombreMes(estado.mes)} ${estado.anio}` }),
        el("td", { clase: "n", texto: String(conDato.reduce((a, f) => a + f.declarado, 0)) }),
        el("td", { clase: "n", texto: String(filas.reduce((a, f) => a + f.registradas, 0)) }),
        el("td", {}), el("td", {})
      )
    ),
    el("p", { estilo: "color:var(--tinta-suave);font-size:var(--t-sm);margin-top:var(--e3)" },
      `${nombreMes(estado.mes)} tiene ${diasDelMes(estado.anio, estado.mes)} días. ` +
      "Diferencia positiva = la app tiene más facturas de las que dijo el trabajador."
    )
  );
}
