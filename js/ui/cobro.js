// ============================================================================
//  cobro.js  -  La cuenta de cobro y lo que se le manda a cada empresa.
//
//  Es el documento que el cliente recibe en la mano, así que se ve tal cual
//  va a quedar impreso. De aquí sale también el archivo que se le manda al
//  contador de la fábrica: uno por empresa, con los datos de esa empresa
//  y de ninguna otra.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, mensaje, confirmar, poner, botonQueTrabaja,
} from "./componentes.js";
import { estado, cambio, empresas, empresaPorCodigo, asegurarEmpresa } from "./estado.js";
import { pesos, nombreMes, fechaCorta, fechaLarga, diaDe, diasDelMes } from "../nucleo/formato.js";
import {
  cuentaDeCobro, deQuincena, sumar, fechaDeCobro, ponerFechaDeCobro,
  esCortesia, sumarLoDeLaEmpresa, fueraDelRango,
  rangoQuincena, rangoDeCobro, ponerRangoDeCobro,
} from "../nucleo/calculos.js";
import { diceElRango } from "./mantenimiento.js";
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
  const laFecha = fechaDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena);

  // El rango de ESTA cuenta. Si no hay ninguno escogido, manda la quincena de
  // la empresa; si lo hay, manda él y no se toca la empresa -- cambiarle los
  // días a la empresa cambiaría todas las cuentas del año, las ya entregadas
  // incluidas.
  const finDeMes = diasDelMes(estado.anio, estado.mes);
  const propio = rangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena);
  const cubre = propio || rangoQuincena(estado.anio, estado.mes, quincena, empresa);

  const ponerElRango = (desde, hasta) => {
    const d = Math.max(1, Math.min(finDeMes, Number(desde) || 1));
    const h = Math.max(1, Math.min(finDeMes, Number(hasta) || finDeMes));
    if (d > h) {
      mensaje("El primer día no puede ser mayor que el último.", "malo", 6);
      repintar();
      return;
    }
    ponerRangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena, { desde: d, hasta: h });
    cambio();
    repintar();
  };

  const cuenta = cuentaDeCobro(
    estado.datos.consumos, estado.anio, estado.mes, quincena, empresa, laFecha, propio);

  // Aviso importante: si en esa quincena hay algo en $0, la cuenta sale corta.
  const enCero = deQuincena(estado.datos.consumos, estado.anio, estado.mes, quincena, empresa).filter(
    (c) => !esCortesia(c) && !(c.precioUnitario > 0)
  );

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuenta de cobro" }),
        el("p", { texto: "Elija la empresa, la quincena y los días que cubre. El documento sale listo para entregar." })
      ),
      acciones(
        el("button", { clase: "chico", alHacerClic: () => window.print() }, "Imprimir"),
        botonQueTrabaja("Bajar PDF", () => {
            try { pdfCuentaDeCobro(cuenta, acreedor); mensaje("PDF descargado.", "bien"); }
            catch (e) { mensaje(e.message, "malo", 8); }
          })
      )
    ),
    el("div", { clase: "mando" },
      el("div", { clase: "campo" },
        el("label", { for: "cobro-empresa", texto: "Empresa" }),
        el("select", { id: "cobro-empresa", alCambiar: (e) => { empresaCobro = e.target.value; repintar(); } },
          ...empresas().map((e) => el("option", { value: e.codigo, selected: e.codigo === empresaCobro }, `${e.codigo} — ${e.razonSocial}`)))
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-fecha", texto: "Fecha de la cuenta" }),
        el("input", {
          type: "date",
          id: "cobro-fecha",
          value: laFecha || "",
          alCambiar: (e) => {
            ponerFechaDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes,
                              quincena, e.target.value);
            cambio();
            repintar();
          },
        }),
        el("small", { estilo: "color:var(--tinta-suave)",
          texto: laFecha ? fechaLarga(laFecha) : "Sin poner: no sale en el documento" })
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-quincena", texto: "Quincena" }),
        el("select", { id: "cobro-quincena", alCambiar: (e) => { quincena = Number(e.target.value); repintar(); } },
          el("option", { value: 1, selected: quincena === 1 }, `Quincena 1 (${diceElRango(empresa, 1)})`),
          el("option", { value: 2, selected: quincena === 2 }, `Quincena 2 (${diceElRango(empresa, 2)})`))
      ),

      // De qué día a qué día va ESTA cuenta.
      //
      // Está aquí y no en Empresas a propósito: los días de la empresa son la
      // regla ("cortamos el 14"), pero una cuenta suelta puede cubrir otra
      // cosa, y el momento en que ella se da cuenta es este -- con la cuenta
      // en pantalla y a punto de entregarla.
      el("div", { clase: "campo no-imprimir" },
        el("label", { for: "cobro-desde", texto: `Días que cubre (${nombreMes(estado.mes).toLowerCase()})` }),
        el("div", { clase: "fila", estilo: "align-items:center;gap:var(--e2)" },
          el("span", { texto: "del" }),
          el("input", {
            type: "number", id: "cobro-desde", min: 1, max: finDeMes, value: String(cubre.desde),
            estilo: "width:5rem",
            alCambiar: (e) => ponerElRango(e.target.value, cubre.hasta),
          }),
          el("span", { texto: "al" }),
          el("input", {
            type: "number", id: "cobro-hasta", min: 1, max: finDeMes, value: String(cubre.hasta),
            estilo: "width:5rem",
            alCambiar: (e) => ponerElRango(cubre.desde, e.target.value),
          })
        ),
        propio
          ? el("small", { estilo: "color:var(--tinta-suave)" },
              `Escogidos solo para esta cuenta. La quincena ${quincena} va ${diceElRango(empresa, quincena)}. `,
              el("button", {
                clase: "plano chico",
                alHacerClic: () => {
                  ponerRangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena, null);
                  cambio();
                  repintar();
                },
              }, "Volver a la quincena"))
          : el("small", {
              estilo: "color:var(--tinta-suave)",
              texto: `Es la quincena ${quincena} completa. Si los cambia, aplica solo a esta cuenta.`,
            })
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

  // Plata de esta quincena que los días escogidos dejaron por fuera.
  //
  // No se mete a la fuerza (ella escogió esos días) ni se calla (sería cobrar
  // de menos sin que nadie se entere): se le dice cuánto y de qué días es, y
  // se le deja el botón para taparlo de un solo toque.
  const afuera = fueraDelRango(estado.datos.consumos, estado.anio, estado.mes, quincena, empresa, cubre);
  if (afuera.length) {
    const dias = [...new Set(afuera.map((c) => diaDe(c.fecha)))].sort((a, b) => a - b);
    poner(raiz,
      el("div", { clase: "nota malo no-imprimir" },
        el("div", {},
          el("strong", { texto: `${pesos(sumarLoDeLaEmpresa(afuera))} de esta quincena no entran en la cuenta` }),
          el("p", { texto:
            `La cuenta cubre del ${cubre.desde} al ${cubre.hasta}, así que ` +
            `${dias.length === 1 ? "el día" : "los días"} ${dias.join(", ")} ` +
            `${dias.length === 1 ? "se queda" : "se quedan"} por fuera. Si no es a propósito, ` +
            `amplíe los días; y si esos pedidos están anotados en la fecha equivocada, ` +
            `arréglelos antes de entregar.` })
        ),
        el("div", { clase: "acciones" },
          el("button", {
            clase: "boton chico",
            alHacerClic: () => ponerElRango(
              Math.min(cubre.desde, dias[0]),
              Math.max(cubre.hasta, dias[dias.length - 1])
            ),
          }, "Cubrir esos días"))
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
  const { empresa, rango, mes, anio, personas, total, facturas, fechaCuenta } = cuenta;

  return el("div", { clase: "documento" },

    // El logo va AQUI y no en la barra de la app: este es el papel que se le
    // entrega al cliente, y aqui se ve grande y con el fondo blanco del
    // documento, que es como esta hecho para verse.
    el("img", {
      clase: "logo-documento",
      src: "img/logo.jpg",
      alt: "Arroz Paisa, Ibagué",
    }),

    el("h2", { texto: "Cuenta de cobro" }),

    // La fecha en que se pasa la cuenta. Si ella no la ha puesto, NO se
    // inventa ninguna: un documento con una fecha inventada es peor que uno
    // sin fecha, porque nadie se da cuenta de que esta mal.
    fechaCuenta
      ? el("p", { clase: "fecha-cuenta" },
          (acreedor.ciudad ? acreedor.ciudad + ", " : "") + fechaLarga(fechaCuenta))
      : null,

    // Primero el que debe y después a quién, para que se lea como la frase
    // que es: "BOTAS AGROINDUSTRIAL SAS debe a VALENTINA SÁNCHEZ GUZMÁN".
    // Al revés -- que es como estaba -- hay que armar la frase de memoria, y
    // en un papel que se entrega eso se presta para leerlo al contrario.
    el("div", { clase: "partes" },
      el("div", { clase: "parte" },
        el("h4", { texto: "Quien debe" }),
        el("div", { clase: "nombre", texto: empresa.razonSocial || empresa.codigo }),
        el("div", { clase: "nit", texto: empresa.nit ? "NIT " + empresa.nit : "" }),
        el("div", { clase: "nit", texto: "Sede " + empresa.codigo })
      ),
      el("div", { clase: "parte" },
        el("h4", { texto: "Debe a" }),
        el("div", { clase: "nombre", texto: acreedor.nombre || "—" }),
        el("div", { clase: "nit", texto: acreedor.nit ? "NIT " + acreedor.nit : "" }),
        el("div", { clase: "nit", texto: acreedor.ciudad || "" })
      )
    ),

    el("p", {},
      el("strong", { texto: "Concepto: " }),
      `Almuerzos y bebidas suministrados del ${rango.desde} al ${rango.hasta} de ${nombreMes(mes).toLowerCase()} de ${anio}.`
    ),

    el("dl", { clase: "cifras", estilo: "margin:var(--e4) 0" },
      cifra("Personas", String(personas.length)),
      cifra("Facturas", String(facturas)),
      cifraPlata("Total a pagar", total, true)
    ),

    // Una persona por renglón y su valor, sin platos.
    //
    // Es lo que el cliente pide: el contador de la fábrica descuenta esto por
    // nómina, y para eso lo que necesita es un nombre y un número. El desglose
    // de qué comió cada quien sigue estando en el Excel y en el reporte del
    // mes, que es donde se va a buscar el día que alguien reclame.
    tabla(
      [{ titulo: "Persona" }, { titulo: "Total", clase: "n" }],
      personas.map((p) =>
        el("tr", {},
          el("td", { texto: p.persona }),
          el("td", { clase: "n", texto: pesos(p.total) })
        )
      ),
      el("tr", {},
        el("td", { texto: "TOTAL A PAGAR" }),
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
            for (const q of [1, 2]) {
              pdfCuentaDeCobro(
                cuentaDeCobro(estado.datos.consumos, estado.anio, estado.mes, q, empresa,
                  fechaDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, q),
                  rangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, q)),
                acreedor);
            }
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
    // Solo lo que le toca pagar a la empresa. Si aqui entrara lo de contado,
    // este avance diria que la empresa debe mas de lo que debe, y ella lo
    // notaria hasta el dia de cobrar.
    const q1 = sumarLoDeLaEmpresa(deQuincena(estado.datos.consumos, estado.anio, estado.mes, 1, e));
    const q2 = sumarLoDeLaEmpresa(deQuincena(estado.datos.consumos, estado.anio, estado.mes, 2, e));
    return { empresa: e, q1, q2, total: q1 + q2 };
  });
}

export { fechaCorta };
