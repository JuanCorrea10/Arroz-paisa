// ============================================================================
//  informes.js  -  Cocina, Resumen del día, Consumo por persona y Cuadre.
//
//  Todas siguen el mismo molde: unos controles arriba, unos números grandes,
//  una tabla, y botones para imprimir o bajar el PDF.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, mensaje, cinta, poner, botonQueTrabaja,
  pedirDatos, colorDeEmpresa, ventana,
} from "./componentes.js";
import { estado, cambio, empresas, empresaPorCodigo } from "./estado.js";
import { pesos, fechaLarga, fechaCorta, nombreMes, diasDelMes, hoyISO } from "../nucleo/formato.js";
import {
  informeCocina, informeDia, informePorPersona, informeCuadre, notasDelDia,
  indicePorCodigo, delDia, contarFacturas, comandasDelDia,
  historialDePersona, esCortesia, yaLoPago,
  A_CREDITO, DE_CONTADO, CORTESIA,
} from "../nucleo/calculos.js";
import { pdfCocina, pdfResumenDia, pdfPorPersona, pdfCuadre } from "../exportar/pdf.js";

/**
 * Cómo se llama una empresa en un papel que se entrega.
 *
 * NO sirve la razón social sola: AGRO, PUNTERAS y BASARILI se llaman las tres
 * "BOTAS AGROINDUSTRIAL SAS". Un PDF de BASARILI que en el encabezado diga
 * solo "BOTAS AGROINDUSTRIAL SAS" es indistinguible del de las otras dos, y
 * quien lo recibe no sabe cuál le tocó.
 *
 * Manda la SEDE, que es lo que la gente conoce, y la razón social va detrás
 * porque es la que importa para la parte legal.
 */
function nombreDeEmpresa(codigo) {
  if (!codigo) return "Todas las empresas";
  const emp = empresaPorCodigo(codigo) || {};
  const razon = (emp.razonSocial || "").trim();
  const sede = emp.codigo || codigo;
  return razon && razon !== sede ? `${sede} · ${razon}` : sede;
}

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

/**
 * Arma el PDF del día: una sección por empresa.
 *
 * Con una empresa escogida sale esa sola. Con "Todas", salen las cuatro, cada
 * una en su hoja, y al final el día completo. Es el documento que ella venía
 * armando a mano pegando pantallazos en un Word.
 *
 * Las empresas que ese día no vendieron nada se quedan por fuera: una hoja
 * que solo dice el nombre y una tabla vacía no le sirve a nadie.
 */
function bajarResumenEnPDF(informe) {
  const codigos = empresaResumen ? [empresaResumen] : empresas().map((e) => e.codigo);
  const secciones = codigos
    .map((cod) => {
      const emp = empresaPorCodigo(cod) || {};
      return {
        codigo: cod,
        razonSocial: emp.razonSocial || "",
        // El mismo color con el que sale en la pantalla. Las tarjetas del PDF
        // lo llevan de cinta arriba, así que quien recibe cuatro hojas
        // reconoce la suya por el color antes de leer el nombre.
        color: colorDeEmpresa(cod),
        informe: informeDia(estado.datos.consumos, estado.fecha, cod),
        comandas: comandasDelDia(estado.datos.consumos, estado.fecha, cod),
      };
    })
    .filter((sec) => sec.informe.filas.length);

  if (!secciones.length) {
    mensaje("Ese día no hay nada anotado.", "ojo");
    return;
  }
  pdfResumenDia(secciones, estado.fecha, estado.datos.config.acreedor, informe);
  mensaje("PDF descargado.", "bien");
}

export function pintarResumenDia(raiz) {
  vaciar(raiz);
  const repintar = () => pintarResumenDia(raiz);
  const informe = informeDia(estado.datos.consumos, estado.fecha, empresaResumen || null);
  const emp = empresaResumen ? empresaPorCodigo(empresaResumen) : null;
  const nombre = nombreDeEmpresa(emp ? emp.codigo : null);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Resumen del día" }),
        el("p", { texto: "Lo que se le manda a la empresa cada día." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => {
            try { bajarResumenEnPDF(informe); }
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
/** Ver solo la gente que comió el día elegido, y no las 268 del mes. */
let soloDelDia = false;
/** Cómo se ordena la lista: "nombre" o "empresa". Igual que en Personas. */
let ordenPorPersona = "nombre";

/**
 * Pregunta qué hay que bajar antes de bajarlo.
 *
 * Se pregunta en vez de poner otro selector arriba: la barra ya lleva seis
 * controles, y esto no se escoge una vez y se deja quieto -- un día se manda
 * lo del día y otro lo de la quincena.
 */
async function bajarPorPersonaEnPDF(filas, nombre) {
  const q = filas.length ? filas[0].quincenaActual : null;
  const r = await pedirDatos({
    titulo: "¿Qué se baja?",
    campos: [
      {
        nombre: "que",
        etiqueta: "Lo que va en el PDF",
        tipo: "seleccion",
        valor: "todo",
        opciones: [
          { valor: "todo", texto: "Las tres: el día, la quincena y el mes" },
          { valor: "dia", texto: `Solo el día (${fechaCorta(estado.fecha)})` },
          { valor: "quincena", texto: q ? `Solo la quincena ${q}` : "Solo la quincena" },
          { valor: "mes", texto: `Solo el mes (${nombreMes(estado.mes)})` },
        ],
        ayuda: "Con una sola columna la hoja sale de pie y se lee mejor en el celular.",
      },
      {
        nombre: "soloValor",
        etiqueta: "Solo el nombre y el valor",
        tipo: "casilla",
        valor: false,
        ayuda: "Queda la lista corta para pasarle a la fábrica: quién y cuánto. Se van la empresa, las facturas y la gente que no consumió nada.",
      },
    ],
    textoAceptar: "Bajar el PDF",
  });
  if (!r) return;

  try {
    pdfPorPersona(filas, estado.anio, estado.mes, nombre,
                  estado.datos.config.acreedor, estado.fecha, r.que, r.soloValor);
    mensaje("PDF descargado.", "bien");
  } catch (e) {
    mensaje(e.message, "malo", 8);
  }
}

/**
 * El historial de una persona, en una ventana.
 *
 * Se abre TOCANDO EL NOMBRE, y no con un botón aparte en otra columna: la
 * tabla ya lleva seis columnas y una séptima de botones deja las de plata por
 * fuera de la pantalla del celular. Además el nombre es donde ella ya está
 * mirando -- busca a la persona por el nombre -- así que es donde la mano va
 * sola.
 *
 * Lleva TODO el historial y no solo el mes que se está mirando, porque lo que
 * le preguntan de frente es "¿yo qué debo?" y "¿cuándo fue que comí?", y para
 * contestar eso hoy toca ir pasando meses uno por uno.
 */
function verHistorial(fila) {
  const h = historialDePersona(estado.datos.consumos, fila.empresa, fila.persona);

  const comoSePago = (c) =>
    esCortesia(c) ? "  (cortesía)" : yaLoPago(c) ? "  (pagó de una)" : "";

  const cuerpo = el("div", { clase: "rejilla" },
    el("p", { clase: "nota", estilo: "margin:0" },
      cinta(h.empresa),
      h.veces
        ? `  Comió ${h.veces} ${h.veces === 1 ? "día" : "días"}, del ${fechaCorta(h.desde)} al ${fechaCorta(h.hasta)}.`
        : "  Todavía no ha pedido nada."),

    h.veces
      // Lo que ya pagó de su bolsillo solo se dice cuando hay algo: si no,
      // "se le descuenta" y "todo lo que ha pedido" son el mismo número
      // repetido, y tres cifras iguales al lado se leen como un error.
      ? el("dl", { clase: "cifras" },
          cifraPlata(`Este mes (${nombreMes(estado.mes).toLowerCase()})`, fila.mes),
          ...(h.deContado > 0
            ? [cifraPlata("Se le descuenta", h.aLaEmpresa), cifraPlata("Ya pagó de una", h.deContado)]
            : []),
          cifraPlata("Todo lo que ha pedido", h.total, true))
      : null,

    // Lo que más pide. Es lo que ella usa para adivinar el pedido cuando la
    // persona llega y dice "lo de siempre".
    h.platos.length
      ? el("p", { clase: "nota", estilo: "margin:0" },
          el("strong", { texto: "Lo que más pide: " }),
          h.platos.slice(0, 3)
            .map((p) => `${p.producto} (${p.cantidad})`)
            .join(",  "))
      : null,

    h.veces
      ? tabla(
          [{ titulo: "Día" }, { titulo: "Qué pidió" }, { titulo: "Total", clase: "n" }],
          h.dias.map((d) =>
            el("tr", {},
              el("td", { clase: "dato", texto: fechaCorta(d.fecha) }),
              el("td", {}, ...d.platos.map((c) =>
                el("div", {
                  estilo: esCortesia(c) || yaLoPago(c) ? "color:var(--tinta-suave)" : "",
                  texto: `${c.cantidad}× ${c.producto}${comoSePago(c)}`,
                })
              )),
              el("td", { clase: "n", texto: pesos(d.total) })
            )
          ),
          el("tr", {},
            el("td", { colspan: "2", texto: "TODO" }),
            el("td", { clase: "n", texto: pesos(h.total) })
          )
        )
      : null
  );

  ventana({
    titulo: h.persona,
    cuerpo,
    botones: [{ texto: "Cerrar", clase: "principal" }],
  });
}

export function pintarPorPersona(raiz) {
  vaciar(raiz);
  const repintar = () => pintarPorPersona(raiz);
  const indice = indicePorCodigo(estado.datos.empresas);
  // Se le pasa el día para que cada renglón traiga también lo de ESE día.
  // Así en una sola fila se ve lo de hoy, lo de la quincena y lo del mes, que
  // es justo lo que le preguntan: "¿cuánto llevo?".
  const todas = informePorPersona(
    estado.datos.consumos, estado.anio, estado.mes, indice,
    empresaPersonas || null, estado.fecha);
  const filas = soloDelDia ? todas.filter((f) => f.dia > 0) : todas;

  // informePorPersona ya las entrega por nombre. Ordenar por empresa no es
  // solo agrupar: dentro de cada una la gente sigue yendo por nombre, o
  // buscar a alguien dentro de AGRO sería recorrer 94 renglones sin orden.
  if (ordenPorPersona === "empresa") {
    filas.sort((a, b) =>
      a.empresa.localeCompare(b.empresa, "es") ||
      a.persona.localeCompare(b.persona, "es"));
  }
  const emp = empresaPersonas ? empresaPorCodigo(empresaPersonas) : null;
  const nombre = nombreDeEmpresa(emp ? emp.codigo : null);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Consumo por persona" }),
        el("p", { texto: "Cuánto lleva cada persona: el día que elija, la quincena que va corriendo y el mes. Toque un nombre para ver todo lo que ha pedido." })
      ),
      acciones(
        botonImprimir(),
        botonQueTrabaja("Bajar PDF", () => bajarPorPersonaEnPDF(filas, nombre))
      )
    ),
    el("div", { clase: "mando" },
      ...selectorDeMes(repintar),
      // El día vive aquí junto al mes, y al cambiarlo el mes se va con él.
      // Si no, se escoge un día de septiembre con el mes en agosto y la
      // columna sale toda en cero sin que se entienda por qué.
      selectorDeDia(() => {
        estado.anio = Number(estado.fecha.slice(0, 4)) || estado.anio;
        estado.mes = Number(estado.fecha.slice(5, 7)) || estado.mes;
        repintar();
      }),
      selectorDeEmpresa(empresaPersonas, (v) => { empresaPersonas = v; repintar(); }),
      el("div", { clase: "campo" },
        el("label", { for: "orden-informe", texto: "Ordenar por" }),
        el("select", {
          id: "orden-informe",
          alCambiar: (e) => { ordenPorPersona = e.target.value; repintar(); },
        },
          el("option", { value: "nombre", selected: ordenPorPersona === "nombre" }, "Nombre"),
          el("option", { value: "empresa", selected: ordenPorPersona === "empresa" }, "Empresa, y luego nombre")
        )
      ),
      el("div", { clase: "campo" },
        el("label", { for: "solo-del-dia", texto: "Ver" }),
        el("label", { clase: "casilla", for: "solo-del-dia" },
          el("input", {
            type: "checkbox", id: "solo-del-dia", checked: soloDelDia,
            alCambiar: (e) => { soloDelDia = e.target.checked; repintar(); },
          }),
          el("span", { texto: "Solo los que comieron ese día" })
        )
      )
    )
  );

  if (!filas.length) {
    poner(raiz, soloDelDia
      ? vacio(`El ${fechaLarga(estado.fecha)} no comió nadie`,
          el("p", { texto: "Cambie el día arriba, o quite el visto para ver a todos los del mes." }))
      : vacio(`No hay nada anotado en ${nombreMes(estado.mes)} de ${estado.anio}`,
          "Elija otro mes u otra empresa."));
    return;
  }

  const tDia = filas.reduce((a, f) => a + f.dia, 0);
  const tEnCurso = filas.reduce((a, f) => a + f.enCurso, 0);
  const tMes = filas.reduce((a, f) => a + f.mes, 0);
  const conDia = filas.filter((f) => f.dia > 0).length;

  // De las dos quincenas se muestra UNA: la que va corriendo el día que se
  // está mirando. La otra ya se cobró, así que ponerla al lado solo da pie a
  // leer el número que no es cuando alguien pregunta cuánto lleva.
  //
  // Cuál es "la que va corriendo" depende de la empresa: MGP cierra el 13 y
  // las demás el 14, así que el día 14 hay gente en la primera y gente en la
  // segunda a la vez. Ese día -- uno al mes -- el rótulo lo dice.
  const quincenas = [...new Set(filas.map((f) => f.quincenaActual))];
  const mezcladas = quincenas.length > 1;
  const rotuloQuincena = mezcladas ? "Quincena en curso" : `Quincena ${quincenas[0]}`;

  poner(raiz,
    el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
      cifra("Personas", String(filas.length)),
      cifraPlata(`El ${fechaCorta(estado.fecha)}`, tDia),
      cifraPlata(rotuloQuincena, tEnCurso),
      cifraPlata("Total del mes", tMes, true)
    ),
    el("p", { clase: "nota" },
      soloDelDia
        ? `Solo las ${filas.length} personas que comieron el ${fechaLarga(estado.fecha)}. ` +
          "La quincena y el mes son los de cada una, completos."
        : conDia
          ? `El ${fechaLarga(estado.fecha)} comieron ${conDia} de estas ${filas.length} personas. ` +
            'Para ver solo esas, marque "Solo los que comieron ese día" arriba.'
          : `El ${fechaLarga(estado.fecha)} no comió nadie. Cambie el día arriba para ver otro.`),
    tabla(
      [
        { titulo: "Persona" }, { titulo: "Empresa" },
        { titulo: "Facturas", clase: "n" },
        { titulo: fechaCorta(estado.fecha), clase: "n" },
        { titulo: rotuloQuincena, clase: "n" },
        { titulo: "Mes", clase: "n" },
      ],
      filas.map((f) =>
        el("tr", {},
          el("td", {},
            el("button", {
              clase: "nombre-historial",
              title: `Ver todo lo que ha pedido ${f.persona}`,
              alHacerClic: () => verHistorial(f),
            }, f.persona)
          ),
          el("td", {}, cinta(f.empresa)),
          el("td", { clase: "n", texto: String(f.facturas) }),
          // El día en $0 va en gris: está, pero no aporta. Así el ojo salta
          // solo a los que sí comieron ese día.
          el("td", { clase: "n", estilo: f.dia ? "" : "color:var(--tinta-suave)",
                     texto: f.dia ? pesos(f.dia) : "—" }),
          el("td", { clase: "n" },
            pesos(f.enCurso),
            // Solo cuando hay de las dos a la vez se dice cuál es cuál.
            mezcladas
              ? el("span", { clase: "marca-quincena", texto: "Q" + f.quincenaActual })
              : null
          ),
          el("td", { clase: "n", estilo: "font-weight:700", texto: pesos(f.mes) })
        )
      ),
      el("tr", {},
        el("td", { colspan: "2", texto: "TOTAL" }),
        el("td", { clase: "n", texto: String(filas.reduce((a, f) => a + f.facturas, 0)) }),
        el("td", { clase: "n", texto: pesos(tDia) }),
        el("td", { clase: "n", texto: pesos(tEnCurso) }),
        el("td", { clase: "n", texto: pesos(tMes) })
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
