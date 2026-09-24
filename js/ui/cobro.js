// ============================================================================
//  cobro.js  -  La cuenta de cobro y lo que se le manda a cada empresa.
//
//  Es el documento que el cliente recibe en la mano, así que se ve tal cual
//  va a quedar impreso. De aquí sale también el archivo que se le manda al
//  contador de la fábrica: uno por empresa, con los datos de esa empresa
//  y de ninguna otra.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, mensaje, confirmar, poner, botonQueTrabaja,
  pedirDatos, cinta,
} from "./componentes.js";
import {
  estado, cambio, empresas, empresaPorCodigo, asegurarEmpresa, empresasClientes,
} from "./estado.js";
import { pesos, nombreMes, fechaCorta, fechaLarga, normalizar,
  esFechaISO, rangoEnPalabras, diasDichos, sedeDeEmpresa,
  razonSocialDe } from "../nucleo/formato.js";
import {
  cuentaDeCobro, deQuincena, sumar, fechaDeCobro, ponerFechaDeCobro,
  esCortesia, sumarLoDeLaEmpresa, sumarLoDeContado, loPagaLaEmpresa,
  contarFacturas, fueraDelRango, deRango, esLaCasa,
  rangoQuincena, rangoDeCobro, ponerRangoDeCobro, rangoEnFechas,
} from "../nucleo/calculos.js";
import { ponerlePrecio } from "../nucleo/modelo.js";
import { diceElRango } from "./mantenimiento.js";
import { pdfCuentaDeCobro } from "../exportar/pdf.js";
import { descargarReporteEmpresa } from "../exportar/reporte-empresa.js";
import { exportarEmpresaAExcel } from "../exportar/excel-export.js";

let quincena = 1;
let empresaCobro = null;

// "" quiere decir TODAS. Cadena vacia y no null porque es el value de la
// opcion en el <select>, y un <select> solo sabe de texto.
const TODAS = "";

export function pintarCobro(raiz) {
  vaciar(raiz);
  const repintar = () => pintarCobro(raiz);

  // A la casa no se le cobra: es el restaurante mismo. Ni se ofrece.
  if (!empresasClientes().length) {
    poner(raiz,
      el("div", { clase: "encabezado-pantalla" }, el("div", {}, el("h1", { texto: "Cuenta de cobro" }))),
      vacio("Todavía no hay empresas", el("p", {}, "Cree las empresas en ", el("a", { href: "#empresas", texto: "Empresas" }), "."))
    );
    return;
  }
  // "Todas" es una eleccion valida y no se pisa. Sin esto, cada repintada la
  // devolvia a la primera empresa y el selector no se dejaba poner en Todas.
  if (empresaCobro !== TODAS &&
      (!empresaCobro || !empresasClientes().some((e) => e.codigo === empresaCobro))) {
    const puesta = asegurarEmpresa();
    const sirve = puesta && empresasClientes().some((e) => e.codigo === puesta.codigo);
    empresaCobro = (sirve ? puesta : empresasClientes()[0]).codigo;
  }

  // Con una empresa escogida, "las que estan en juego" es ella sola. Con
  // Todas, son las cuatro, y todo lo de abajo -- la fecha, la quincena, los
  // avisos, los documentos -- se hace para cada una.
  const empresa = empresaCobro === TODAS ? null : empresaPorCodigo(empresaCobro);
  const enJuego = empresa ? [empresa] : empresasClientes();
  const acreedor = estado.datos.config.acreedor || {};

  // La fecha que va escrita en el documento. Con Todas se muestra solo si las
  // cuatro tienen la misma: si difieren, el campo sale vacio en vez de
  // mostrar la de una y hacer creer que es la de todas.
  const susFechas = enJuego.map(
    (e) => fechaDeCobro(estado.datos, e.codigo, estado.anio, estado.mes, quincena) || "");
  const laFecha = susFechas.every((f) => f === susFechas[0]) ? susFechas[0] : "";

  // El rango de ESTA cuenta. Si no hay ninguno escogido, manda la quincena de
  // la empresa; si lo hay, manda él y no se toca la empresa -- cambiarle los
  // días a la empresa cambiaría todas las cuentas del año, las ya entregadas
  // incluidas.
  // El rango va en FECHAS completas, no en días sueltos: una cuenta puede
  // cubrir "del 1 de enero al 31 de diciembre" cuando una fábrica se atrasa,
  // y dos números de día no dicen de qué mes son.
  const propio = empresa
    ? rangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena)
    : null;
  const cubre = empresa
    ? rangoEnFechas(estado.anio, estado.mes,
        propio || rangoQuincena(estado.anio, estado.mes, quincena, empresa))
    : null;

  const ponerElRango = (desde, hasta) => {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) {
      mensaje("Escoja las dos fechas en el calendario.", "malo", 6);
      repintar();
      return;
    }
    if (desde > hasta) {
      mensaje("La primera fecha no puede ser después de la última.", "malo", 6);
      repintar();
      return;
    }
    ponerRangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena,
      { desde, hasta });
    cambio();
    repintar();
  };

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuenta de cobro" }),
        el("p", { texto: empresa
          ? "Elija la empresa y las fechas que cubre. El documento sale listo para entregar."
          : "Las cuentas de las cuatro empresas, una detras de otra. Imprimir las saca en hojas aparte." })
      ),
      acciones(
        el("button", { clase: "chico", alHacerClic: () => window.print() },
           empresa ? "Imprimir" : `Imprimir las ${enJuego.length}`),
        // El PDF va por empresa y no todo junto: una cuenta de cobro nombra a
        // UN deudor, y un archivo con cuatro deudores adentro no se le puede
        // entregar a ninguno. Con Todas, cada seccion trae su propio boton.
        empresa
          ? botonQueTrabaja("Bajar PDF", () => {
              try { bajarElPdf(empresa, quincena, acreedor); }
              catch (e) { mensaje(e.message, "malo", 8); }
            })
          : null
      )
    ),
    el("div", { clase: "mando" },
      el("div", { clase: "campo" },
        el("label", { for: "cobro-empresa", texto: "Empresa" }),
        el("select", { id: "cobro-empresa", alCambiar: (e) => { empresaCobro = e.target.value; repintar(); } },
          // Va de primera, como en Resumen del dia y en Cuanto vendi: las tres
          // pantallas se eligen igual, y asi no hay que aprenderse cada una.
          el("option", { value: TODAS, selected: empresaCobro === TODAS }, "Todas las empresas"),
          ...empresasClientes().map((e) => el("option", { value: e.codigo, selected: e.codigo === empresaCobro }, `${e.codigo} — ${e.razonSocial}`)))
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-fecha", texto: "Fecha de la cuenta" }),
        el("input", {
          type: "date",
          id: "cobro-fecha",
          value: laFecha || "",
          alCambiar: (e) => {
            for (const emp of enJuego) {
              ponerFechaDeCobro(estado.datos, emp.codigo, estado.anio, estado.mes,
                                quincena, e.target.value);
            }
            cambio();
            repintar();
          },
        }),
        el("small", { estilo: "color:var(--tinta-suave)",
          texto: laFecha ? fechaLarga(laFecha)
            : (empresa ? "Sin poner: no sale en el documento"
                       : `Sin poner: no sale en el documento. Lo que ponga aqui va en las ${enJuego.length}.`) })
      ),
      el("div", { clase: "campo" },
        el("label", { for: "cobro-quincena", texto: "Quincena" }),
        el("select", { id: "cobro-quincena", alCambiar: (e) => { quincena = Number(e.target.value); repintar(); } },
          // Con Todas no se dicen los dias porque cada empresa corta distinto
          // (MGP el 13, las demas el 14): un solo rango seria falso para tres.
          el("option", { value: 1, selected: quincena === 1 },
             empresa ? `Quincena 1 (${diceElRango(empresa, 1)})` : "Quincena 1"),
          el("option", { value: 2, selected: quincena === 2 },
             empresa ? `Quincena 2 (${diceElRango(empresa, 2)})` : "Quincena 2"))
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
      ),
      // De qué fecha a qué fecha va ESTA cuenta.
      //
      // Está aquí y no en Empresas a propósito: los días de la empresa son la
      // regla ("cortamos el 14"), pero una cuenta suelta puede cubrir otra
      // cosa, y el momento en que ella se da cuenta es este -- con la cuenta
      // en pantalla y a punto de entregarla.
      //
      // Va en su propio renglón y de último: dos calendarios no caben en una
      // columna de 210 px, se apilaban y dejaban un hueco al lado que hacía
      // ver la barra rota.
      !empresa
        // Con Todas no hay un rango que valga para las cuatro: cada empresa
        // corta la quincena en su dia. Se dice, y se dice como cambiarlo, en
        // vez de dejar dos casillas que mentirian para tres de ellas.
        ? el("div", { clase: "campo campo-rango no-imprimir" },
            el("label", { texto: "Fechas que cubre" }),
            el("small", { estilo: "color:var(--tinta-suave)",
              texto: `Cada empresa va por su quincena ${quincena}. Para cambiarle las ` +
                     `fechas a una, escojala aqui arriba.` }))
        : el("div", { clase: "campo campo-rango no-imprimir" },
        el("label", { for: "cobro-desde", texto: "Fechas que cubre" }),
        el("div", { clase: "rango-fechas" },
          el("span", { clase: "rango-palabra", texto: "del" }),
          el("input", {
            type: "date", id: "cobro-desde", value: cubre.desde,
            alCambiar: (e) => ponerElRango(e.target.value, cubre.hasta),
          }),
          el("span", { clase: "rango-palabra", texto: "al" }),
          el("input", {
            type: "date", id: "cobro-hasta", value: cubre.hasta,
            alCambiar: (e) => ponerElRango(cubre.desde, e.target.value),
          }),
          // En palabras al lado, porque el calendario muestra 01/01/2026 y a
          // ella le cuesta leer eso de un vistazo. Es lo mismo que va a decir
          // el papel, así que lo ve antes de imprimir.
          el("strong", { clase: "rango-dice", texto: rangoEnPalabras(cubre.desde, cubre.hasta) }),
          propio
            ? el("button", {
                clase: "plano chico",
                alHacerClic: () => {
                  ponerRangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena, null);
                  cambio();
                  repintar();
                },
              }, "Volver a la quincena")
            : null
        ),
        el("small", {
          estilo: "color:var(--tinta-suave)",
          texto: propio
            ? `Escogidas solo para esta cuenta. La quincena ${quincena} va ${diceElRango(empresa, quincena)}.`
            : `Es la quincena ${quincena} completa. Puede ampliarla hasta donde necesite ` +
              `-- sirve para cobrar varios meses de una -- y solo cambia esta cuenta.`,
        })
      )
    )
  );

  // El resumen va DEBAJO de los controles, no encima.
  //
  // Lo puse arriba la primera vez, y con eso empujé el selector de quincena
  // fuera de la primera pantalla: ella entraba y no lo veía, así que "no puedo
  // poner la cuenta por quincena". Además rompía el orden que tienen las trece
  // pantallas -- título, controles, contenido -- que es lo que hace que no haya
  // que aprenderse cada una por aparte.
  poner(raiz, lasQueNoSalenAqui());
  poner(raiz, tarjetaDeTodasLasEmpresas());

  // Una seccion por empresa. Con una escogida es una sola; con Todas son las
  // cuatro, cada una con sus avisos y su documento. El CSS ya las manda a
  // hojas distintas al imprimir, que es como ella las entrega.
  for (const emp of enJuego) {
    seccionDeCobro(raiz, emp, quincena, acreedor, repintar, !empresa);
  }

  // Los archivos que se le mandan al cliente van por empresa. Con Todas no se
  // repiten cuatro veces: para eso esta Compartir, que es donde ella los busca.
  if (empresa) poner(raiz, paraElCliente(empresa));
}

// ---------------------------------------------------------------------------

/**
 * Baja el PDF de la cuenta de UNA empresa.
 *
 * Una cuenta de cobro nombra a un solo deudor, asi que no hay "el PDF de las
 * cuatro": son cuatro archivos, cada uno para su fabrica.
 */
function bajarElPdf(empresa, quincena, acreedor) {
  const propio = rangoDeCobro(estado.datos, empresa.codigo, estado.anio, estado.mes, quincena);
  const laFecha = fechaDeCobro(estado.datos, empresa.codigo, estado.anio, estado.mes, quincena);
  const cuenta = cuentaDeCobro(estado.datos.consumos, estado.anio, estado.mes,
                               quincena, empresa, laFecha, propio);
  pdfCuentaDeCobro(cuenta, acreedor);
  mensaje(`PDF de ${empresa.codigo} descargado.`, "bien");
}

/**
 * Los avisos y el documento de UNA empresa.
 *
 * Esto vivia suelto dentro de pintarCobro. Salio de ahi el dia que se pudo
 * escoger "Todas las empresas": es lo mismo pintado una vez o cuatro, y
 * dejarlo adentro obligaba a copiarlo.
 */
function seccionDeCobro(raiz, empresa, quincena, acreedor, repintar, conTitulo) {
  const empresaCobro = empresa.codigo;
  const propio = rangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena);
  const cubre = rangoEnFechas(estado.anio, estado.mes,
    propio || rangoQuincena(estado.anio, estado.mes, quincena, empresa));
  const laFecha = fechaDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena);
  const cuenta = cuentaDeCobro(
    estado.datos.consumos, estado.anio, estado.mes, quincena, empresa, laFecha, propio);

  // Aviso importante: si en el periodo hay algo en $ 0, la cuenta sale corta.
  // Se miran los renglones que ESTA cuenta cubre, no los de la quincena, que
  // pueden ser otros si los dias se escogieron a mano.
  const delPeriodo = propio
    ? deRango(estado.datos.consumos, estado.anio, estado.mes, propio, empresa)
    : deQuincena(estado.datos.consumos, estado.anio, estado.mes, quincena, empresa);
  const enCero = delPeriodo.filter((c) => !esCortesia(c) && !(c.precioUnitario > 0));

  // Ampliar el rango desde aqui: es el mismo gesto que arriba, pero para ESTA
  // empresa, que con Todas en pantalla no es la que dice el selector.
  const ponerElRango = (desde, hasta) => {
    if (!esFechaISO(desde) || !esFechaISO(hasta) || desde > hasta) {
      mensaje("Esas fechas no sirven.", "malo", 6);
      return;
    }
    ponerRangoDeCobro(estado.datos, empresaCobro, estado.anio, estado.mes, quincena,
                      { desde, hasta });
    cambio();
    repintar();
  };

  // Con las cuatro en pantalla hay que decir de cual es cada pedazo -- si no,
  // son cuatro tablas seguidas y no se sabe cual es de quien -- y dejarle a la
  // mano el PDF de esa, que es lo que le manda a esa fabrica.
  if (conTitulo) {
    poner(raiz,
      el("div", { clase: "fila entre cobro-cual no-imprimir" },
        el("div", { clase: "fila", estilo: "align-items:center;gap:var(--e2)" },
          cinta(empresa.codigo),
          el("strong", { texto: razonSocialDe(empresa) })
        ),
        botonQueTrabaja("Bajar PDF", () => {
          try { bajarElPdf(empresa, quincena, acreedor); }
          catch (e) { mensaje(e.message, "malo", 8); }
        })
      )
    );
  }

  if (enCero.length) {
    // Agrupados por PLATO, y no un renglón por renglón.
    //
    // El precio es del plato y de la empresa, así que los cinco renglones de
    // SOPA GRANDE de esta cuenta valen todos lo mismo: preguntarlo cinco veces
    // sería hacerla escribir el mismo número cinco veces y arriesgar que en
    // una se equivoque. Se pregunta una vez y se arreglan los cinco.
    const porPlato = new Map();
    for (const c of enCero) {
      const llave = normalizar(c.producto);
      if (!porPlato.has(llave)) porPlato.set(llave, []);
      porPlato.get(llave).push(c);
    }
    const grupos = [...porPlato.entries()].sort((a, b) => b[1].length - a[1].length);

    poner(raiz,
      el("div", { clase: "nota malo no-imprimir" },
        el("div", { estilo: "flex:1 1 auto;min-width:0" },
          el("strong", { texto: `${enCero.length} ${enCero.length === 1 ? "renglón está" : "renglones están"} en $ 0` }),
          el("p", { texto:
            "Se pidieron y no se están cobrando: si manda la cuenta así, va a " +
            "cobrar de menos. Póngales el precio aquí mismo." }),
          el("ul", { clase: "lista-arreglable" },
            ...grupos.map(([plato, suyos]) => {
              const quienes = [...new Set(suyos.map((c) => c.persona))];
              // En fechas y no en días sueltos: una cuenta puede cubrir varios
              // meses, y ahí "el 3" no dice de cuál. Se muestran los primeros y
              // se cuentan los demás: la lista es para ubicarlos, no para
              // llenar la pantalla con trescientas fechas.
              const fechas = [...new Set(suyos.map((c) => c.fecha))].sort();
              const dias = diasDichos(fechas).slice(0, 6);
              const masDias = fechas.length - dias.length;
              return el("li", {},
                el("div", { clase: "quien" },
                  el("strong", { texto: plato }),
                  el("div", { clase: "apunte" },
                    `${suyos.length} ${suyos.length === 1 ? "renglón" : "renglones"} · ` +
                    `${quienes.slice(0, 3).join(", ")}${quienes.length > 3 ? ` y ${quienes.length - 3} más` : ""} · ` +
                    `${fechas.length === 1 ? "día" : "días"} ${dias.join(", ")}` +
                    `${masDias > 0 ? ` y ${masDias} más` : ""}`)
                ),
                el("button", {
                  clase: "chico",
                  alHacerClic: () => arreglarElPrecio(empresa, plato, suyos, repintar),
                }, "Póngale precio")
              );
            })
          )
        )
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
    // Por FECHA y no por día: con un rango que cruza meses, "el 3" no dice
    // de qué mes es, y puede haber dos.
    const fechas = [...new Set(afuera.map((c) => c.fecha))].sort();
    const dias = diasDichos(fechas);
    poner(raiz,
      el("div", { clase: "nota malo no-imprimir" },
        el("div", {},
          el("strong", { texto: `${pesos(sumarLoDeLaEmpresa(afuera))} de esta quincena no entran en la cuenta` }),
          el("p", { texto:
            `La cuenta cubre ${rangoEnPalabras(cubre.desde, cubre.hasta).toLowerCase()}, así que ` +
            `${dias.length === 1 ? "el día" : "los días"} ${dias.join(", ")} ` +
            `${dias.length === 1 ? "se queda" : "se quedan"} por fuera. Si no es a propósito, ` +
            `amplíe los días; y si esos pedidos están anotados en la fecha equivocada, ` +
            `arréglelos antes de entregar.` })
        ),
        el("div", { clase: "acciones" },
          el("button", {
            clase: "boton chico",
            alHacerClic: () => ponerElRango(
              cubre.desde < fechas[0] ? cubre.desde : fechas[0],
              cubre.hasta > fechas[fechas.length - 1]
                ? cubre.hasta : fechas[fechas.length - 1]
            ),
          }, "Cubrir esos días"))
      )
    );
  }

  if (!cuenta.personas.length) {
    poner(raiz, vacio(
      `No hay nada que cobrarle a ${empresaCobro} en la quincena ${quincena} de ${nombreMes(estado.mes)}`,
      "Pruebe con la otra quincena, con otro mes o con otra empresa."
    ));
  } else {
    poner(raiz, documentoDeCobro(cuenta, acreedor));
  }

}

// ---------------------------------------------------------------------------

/**
 * Las empresas que existen pero NO salen en este selector, y por qué.
 *
 * Ella creó la empresa de su propio restaurante, la marcó como "es mi propio
 * restaurante" y después no la encontró aquí. La app hacía lo correcto -- a
 * la casa no se le cobra -- pero lo hacía EN SILENCIO: la empresa
 * simplemente no estaba en la lista, y no había forma de saber si era a
 * propósito, si se borró o si la app estaba mala.
 *
 * Una empresa que desaparece sin explicación se busca media hora. Una que
 * dice por qué no está, y cómo traerla, se resuelve en diez segundos.
 */
function lasQueNoSalenAqui() {
  const salen = new Set(empresasClientes().map((e) => normalizar(e.codigo)));
  const faltantes = (estado.datos.empresas || [])
    .filter((e) => !salen.has(normalizar(e.codigo)))
    .map((e) => ({
      codigo: e.codigo,
      porque: esLaCasa(e)
        ? "es su propio restaurante: su gente paga de una, así que entra a la caja y no se le cobra a nadie"
        : "está apagada",
      comoSeArregla: esLaCasa(e)
        ? "Si a esa sí hay que cobrarle, quítele la marca de “Es mi propio restaurante”"
        : "Vuelva a prenderla",
    }));

  if (!faltantes.length) return null;

  return el("div", { clase: "nota dato no-imprimir" },
    el("div", {},
      el("strong", { texto: faltantes.length === 1
        ? `${faltantes[0].codigo} no sale en esta lista`
        : `${faltantes.length} empresas no salen en esta lista` }),
      ...faltantes.map((f) =>
        el("p", { texto: faltantes.length === 1
          ? `Porque ${f.porque}. ${f.comoSeArregla} en Empresas.`
          : `${f.codigo}: ${f.porque}. ${f.comoSeArregla} en Empresas.` })),
      el("p", {}, el("a", { href: "#empresas", texto: "Ir a Empresas" }))
    )
  );
}

/**
 * Las cuatro empresas y sus dos quincenas, de una sola mirada.
 *
 * Va ARRIBA de todo y antes del selector a propósito. La pregunta "¿cuánto va
 * de cada empresa?" se contestaba eligiendo una por una y acordándose de los
 * tres números anteriores; ahora está contestada al entrar, sin tocar nada, y
 * el selector de abajo pasa a ser solo "cuál imprimo".
 */
function tarjetaDeTodasLasEmpresas() {
  const filas = totalesDelMes();
  if (!filas.length) return null;

  const granTotal = filas.reduce((a, f) => a + f.total, 0);
  const contado = filas.reduce((a, f) => a + f.deContado, 0);

  return el("section", { clase: "tarjeta" },
    el("div", { clase: "fila entre" },
      el("h2", { texto: `Lo que va de ${nombreMes(estado.mes)} de ${estado.anio}` }),
      el("span", { clase: "comanda-total", texto: pesos(granTotal) })
    ),

    tabla(
      [
        { titulo: "Empresa" },
        { titulo: "Quincena 1", clase: "n" },
        { titulo: "Quincena 2", clase: "n" },
        { titulo: "Facturas", clase: "n" },
        { titulo: "Todo el mes", clase: "n" },
      ],
      filas.map((f) =>
        el("tr", {},
          // La cinta arriba y la razón social DEBAJO, no al lado: "apunte-suelto"
          // es inline-flex, así que pegada quedaba "AGROBOTAS AGROINDUSTRIAL".
          el("td", {},
            cinta(f.empresa.codigo),
            razonSocialDe(f.empresa)
              ? el("div", {
                  estilo: "margin-top:3px;font-size:var(--t-sm);color:var(--tinta-suave)",
                  texto: razonSocialDe(f.empresa),
                })
              : null
          ),
          el("td", { clase: "n", texto: pesos(f.q1) }),
          el("td", { clase: "n", texto: pesos(f.q2) }),
          el("td", { clase: "n", texto: String(f.facturas) }),
          el("td", { clase: "n", estilo: "font-weight:700", texto: pesos(f.total) })
        )
      ),
      el("tr", {},
        el("td", { colspan: "4", texto: "TODAS LAS EMPRESAS" }),
        el("td", { clase: "n", texto: pesos(granTotal) })
      )
    ),

    // Lo de contado se dice aparte y solo cuando lo hay: está vendido, pero no
    // se le cobra a nadie más. Sumarlo aquí haría que este resumen no cuadrara
    // con la cuenta de cobro, que es de lo peor que puede pasar.
    contado > 0
      ? el("p", { clase: "nota ojo", estilo: "margin:var(--e3) 0 0" },
          el("div", {},
            el("strong", { texto: `Además hay ${pesos(contado)} que se pagaron de una` }),
            el("p", { texto: "Eso ya está en la caja y NO va en ninguna cuenta de cobro." })))
      : null
  );
}

/**
 * Ponerle precio a los renglones de un plato que quedaron en $ 0.
 *
 * Esto SUBE la cuenta de una empresa, así que se dice cuánto sube antes de
 * hacerlo y cuánto subió después. Que una cuenta cambie de valor está bien --
 * el plato se vendió y no se cobró -- pero enterarse cuando el cliente
 * reclama, no.
 */
async function arreglarElPrecio(empresa, plato, renglones, repintar) {
  const cuantos = renglones.reduce((a, c) => a + (Number(c.cantidad) || 0), 0);
  const r = await pedirDatos({
    titulo: `Precio de ${plato}`,
    campos: [
      {
        nombre: "precio",
        etiqueta: `¿Cuánto vale para ${empresa.codigo}?`,
        tipo: "number",
        valor: "",
        requerido: true,
        min: 0,
        ayuda: `Se pidió ${cuantos} ${cuantos === 1 ? "vez" : "veces"} en ` +
               `${renglones.length} ${renglones.length === 1 ? "renglón" : "renglones"}. ` +
               "A todos les queda este precio, y la cuenta sube.",
      },
      {
        nombre: "enCatalogo",
        etiqueta: "Guardarlo también en el catálogo, para las próximas veces",
        tipo: "casilla",
        valor: true,
      },
    ],
    textoAceptar: "Poner el precio",
  });
  if (!r) return;

  const valor = Number(r.precio) || 0;
  if (!(valor > 0)) {
    mensaje("Un precio en $ 0 deja el problema igual. Escriba cuánto vale.", "malo", 7);
    return;
  }

  const { arreglados, sube } = ponerlePrecio(estado.datos, renglones, valor, r.enCatalogo);
  cambio();
  repintar();
  mensaje(
    `${plato} quedó en ${pesos(valor)}. Se arreglaron ${arreglados} ` +
    `${arreglados === 1 ? "renglón" : "renglones"} y la cuenta subió ${pesos(sube)}.`,
    "bien", 8
  );
}

function documentoDeCobro(cuenta, acreedor) {
  const { empresa, rango, personas, total, facturas, fechaCuenta } = cuenta;

  // "aparte" = esta hoja no se junta con la anterior al imprimir. Con una sola
  // empresa no cambia nada; con las cuatro es lo que evita que la cuenta de
  // MGP y la de AGRO salgan en la misma hoja, que no se le puede dar a nadie.
  return el("div", { clase: "documento aparte" },

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
        // La SEDE en grande: tres empresas comparten la razón social, así que
        // esta parte del papel salía idéntica en las tres.
        el("div", { clase: "nombre", texto: sedeDeEmpresa(empresa) }),
        el("div", { clase: "nit", texto: razonSocialDe(empresa) }),
        el("div", { clase: "nit", texto: empresa.nit ? "NIT " + empresa.nit : "" })
      ),
      el("div", { clase: "parte" },
        el("h4", { texto: "Debe a" }),
        el("div", { clase: "nombre", texto: acreedor.nombre || "—" }),
        el("div", { clase: "nit", texto: acreedor.nit ? "NIT " + acreedor.nit : "" }),
        el("div", { clase: "nit", texto: acreedor.ciudad || "" })
      )
    ),

    // El mismo periodo que dice el PDF, y dicho igual. Se quedo escribiendo
    // "del 2026-08-01 al 2026-08-13 de agosto de 2026" cuando el rango paso a
    // ser fechas: la pantalla y el papel decian cosas distintas.
    el("p", {},
      el("strong", { texto: "Concepto: " }),
      `Almuerzos y bebidas suministrados. ${rangoEnPalabras(rango.desde, rango.hasta)}.`
    ),

    el("dl", { clase: "cifras", estilo: "margin:var(--e4) 0" },
      cifra("Personas", String(personas.length)),
      cifra("Facturas", String(facturas)),
      cifraPlata("Total a pagar", total, true)
    ),

    // Cada persona con sus pedidos día por día, igual que en el PDF.
    //
    // Esta pantalla existe para ver el documento TAL CUAL va a quedar impreso,
    // así que las dos tienen que mostrar lo mismo: si aquí se viera un resumen
    // y en el papel el detalle, ella revisaría una cosa y entregaría otra.
    tabla(
      [
        { titulo: "Día" }, { titulo: "Qué pidió" },
        { titulo: "Cant.", clase: "n" }, { titulo: "Valor", clase: "n" },
      ],
      personas.flatMap((p) => [
        el("tr", { clase: "renglon-persona" },
          el("td", { colspan: "3", texto: p.persona }),
          el("td", { clase: "n", texto: pesos(p.total) })
        ),
        ...p.renglones.map((r) =>
          el("tr", {},
            el("td", { clase: "dato", texto: fechaCorta(r.fecha) }),
            el("td", { texto: r.producto }),
            el("td", { clase: "n cant", texto: String(r.cantidad) }),
            el("td", { clase: "n", texto: pesos(r.total) })
          )
        ),
      ]),
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
      ` los datos de ${sedeDeEmpresa(empresa)}. No hay forma de que vean los de las otras empresas, porque no van adentro del archivo.`
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

/**
 * Lo que va de cada empresa este mes, quincena por quincena.
 *
 * Esta función estaba escrita hace rato y no la llamaba NADIE: su comentario
 * decía "para la pantalla de inicio" y esa pantalla nunca se hizo. Mientras
 * tanto, la misma tabla se armaba otra vez en el Excel, así que para ver estos
 * cuatro números había que bajar un archivo y abrirlo.
 *
 * Ahora sale arriba en la cuenta de cobro, ANTES de elegir empresa: si toca
 * elegir para verlo, para quien usa esto no existe.
 *
 * Cuidado con lo que suma: es "lo que se le cobra a la empresa", no "lo que se
 * vendió". Lo que alguien pagó de contado se vendió, pero NO va en la cuenta de
 * cobro. Por eso va aparte, con su rótulo: si este resumen dijera un número y
 * la cuenta de cobro otro, ella dejaría de creerle a los dos.
 */
export function totalesDelMes() {
  return empresasClientes().map((e) => {
    const q1 = deQuincena(estado.datos.consumos, estado.anio, estado.mes, 1, e);
    const q2 = deQuincena(estado.datos.consumos, estado.anio, estado.mes, 2, e);
    const cobraQ1 = sumarLoDeLaEmpresa(q1);
    const cobraQ2 = sumarLoDeLaEmpresa(q2);
    return {
      empresa: e,
      q1: cobraQ1,
      q2: cobraQ2,
      total: cobraQ1 + cobraQ2,
      facturas: contarFacturas(q1.filter(loPagaLaEmpresa)) + contarFacturas(q2.filter(loPagaLaEmpresa)),
      deContado: sumarLoDeContado(q1) + sumarLoDeContado(q2),
    };
  });
}

export { fechaCorta };
