// ============================================================================
//  registrar.js  -  "Registrar el día". La pantalla que se usa todos los días.
//
//  Está armada alrededor de UN PEDIDO = UNA PERSONA, no alrededor de renglones
//  sueltos. Por eso:
//    - la fecha se elige UNA vez, en un calendario, nunca escribiéndola;
//    - la empresa se elige UNA vez;
//    - después se va agregando persona por persona, y a cada persona sus platos.
//
//  Con eso se caen tres de los bugs del Excel de una sola vez: la fecha que
//  entraba como texto, el renglón que se quedaba sin empresa, y el segundo
//  plato de la misma persona que no sumaba en ninguna parte.
// ============================================================================

import { el, vaciar, buscador, mensaje, pedirDatos, confirmar, ventana, tabla, cifra, cifraPlata, cinta, colorDeEmpresa, vacio, poner, acciones, botonQueTrabaja } from "./componentes.js";
import { estado, cambio, empresas, asegurarEmpresa, empresaPorCodigo } from "./estado.js";
import { pesos, fechaLarga, normalizar, hoyISO } from "../nucleo/formato.js";
import {
  delDia, subtotal, contarFacturas, personasDe, precioDe, clavePersona, comandasDelDia,
  A_CREDITO, DE_CONTADO, CORTESIA, formaDeCobro, esCortesia, yaLoPago, esLaCasa,
  comoPagaLaPersona,
} from "../nucleo/calculos.js";
import { pdfComandasDelDia } from "../exportar/pdf.js";
import {
  nuevoConsumo, agregarPersona, agregarProducto, ponerComoPagaLaPersona, ponerFormaDeCobro,
  preciosQueLeFaltan, heredarPrecios,
} from "../nucleo/modelo.js";
import {
  limpiarNombre, parecidasEnEmpresa, tocayosEnOtrasEmpresas,
} from "../nucleo/nombres.js";
import {
  pedidoHabitual, tieneCostumbre, platosFrecuentes, loDelDiaAnterior,
  yaAnotadasHoy, cuantoValdria,
} from "../nucleo/habitos.js";

/** La persona cuya comanda se está llenando ahora mismo. */
let personaActiva = null;

// Por cómo se paga, cuáles tarjetas se están mirando. "" es todas.
//
// Estas tarjetas son las que ella fotografía y le manda a los chefs, y el
// PDF del resumen es el que le manda a la supervisora: son dos papeles
// distintos para dos personas distintas, y a veces necesita mandar solo las
// de una forma de pago.
let filtroDePago = "";

export function pintarRegistrar(raiz) {
  vaciar(raiz);
  asegurarEmpresa();

  if (!empresas().length) {
    poner(raiz,
      el("div", { clase: "encabezado-pantalla" }, el("div", {}, el("h1", { texto: "Registrar el día" }))),
      vacio(
        "Todavía no hay empresas",
        el("p", {}, "Antes de registrar pedidos hay que crear al menos una empresa. ",
          el("a", { href: "#empresas", texto: "Ir a Empresas" }), ".")
      )
    );
    return;
  }

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Registrar el día" }),
        el("p", { texto: "Elija el día y la empresa, y vaya agregando persona por persona." })
      ),
      acciones(botonDePedidosEnPDF())
    ),
    barraDeMando(raiz),
    faltanLosPrecios(raiz),
    tarjetaDeAyer(raiz),
    cajaDeCaptura(raiz),
    resumenEnVivo(),
    listaDeComandas(raiz)
  );
}

/**
 * El aviso de "a esta empresa le faltan los precios", con el botón que lo
 * arregla de un toque.
 *
 * El precio se guarda por plato Y POR EMPRESA, así que una empresa creada
 * antes de este arreglo nació con los 77 platos en blanco. Ella la creó, fue
 * a anotar el primer pedido y todo le decía "sin precio", sin nada que
 * dijera por qué ni cómo salir de ahí.
 *
 * Va AQUÍ, en Registrar, y no en Platos: aquí es donde se queda atascada, y
 * lo que hay que destapar para ella no existe. Y va arriba de la caja de
 * captura, antes de que anote nada: un pedido anotado con el plato en $ 0 ya
 * es plata perdida.
 */
function faltanLosPrecios(raiz) {
  const cod = estado.empresa;
  if (!cod) return null;

  const { sePueden, noSePueden } = preciosQueLeFaltan(estado.datos, cod);
  const faltan = sePueden.length + noSePueden.length;

  // Pedidos de HOY que quedaron en $ 0.
  //
  // Copiar los precios no los arregla, y no puede: el precio se congela en
  // cada renglón a propósito, para que cambiar el catálogo no mueva una
  // cuenta ya entregada. Así que los que ella alcanzó a anotar con la empresa
  // rota siguen valiendo cero, y el botón de arriba se ve como "ya quedó".
  //
  // Solo los del día que está en pantalla, y no los de toda la historia: en
  // los datos de verdad hay 38 renglones viejos en $ 0 repartidos en tres
  // empresas, así que mirando todo el aviso saldría TODOS los días -- y un
  // aviso que sale siempre se deja de leer, justo para cuando importa. Los
  // viejos tienen su sitio: la pestaña Revisar, que aparece sola cuando hay
  // algo y los cuenta todos.
  const enCero = estado.datos.consumos.filter(
    (c) => c.fecha === estado.fecha &&
           normalizar(c.empresa) === normalizar(cod) &&
           !esCortesia(c) && !(Number(c.precioUnitario) > 0)).length;

  if (!faltan && !enCero) return null;

  const copiar = () => {
    const r = heredarPrecios(estado.datos, cod);
    cambio();
    if (r.quedanSinPrecio.length) {
      const nombres = r.quedanSinPrecio.slice(0, 3).map((x) => x.plato).join(", ");
      const mas = r.quedanSinPrecio.length - Math.min(3, r.quedanSinPrecio.length);
      mensaje(
        `Se copiaron ${r.copiados}. Quedan ${r.quedanSinPrecio.length} sin precio ` +
        `(${nombres}${mas ? ` y ${mas} más` : ""}): póngaselos en Platos.`, "ojo", 10);
    } else {
      mensaje(`Listo: ${r.copiados} precios copiados.`, "bien", 6);
    }
    pintarRegistrar(raiz);
  };

  return el("div", {},
    faltan
      ? el("div", { clase: "nota malo no-imprimir" },
          el("div", { estilo: "flex:1 1 auto;min-width:0" },
            el("strong", { texto: `A ${cod} le ${faltan === 1 ? "falta 1 precio" : `faltan ${faltan} precios`}` }),
            el("p", { texto: sePueden.length
              ? "Los platos existen, pero en esta empresa no tienen precio: si anota un " +
                "pedido ahora, se cobra en $ 0. Las otras empresas ya los tienen."
              : "Los platos no tienen precio en ninguna empresa. Póngaselos en Platos " +
                "antes de anotar, o el pedido se cobra en $ 0." })
          ),
          el("div", { clase: "acciones" },
            sePueden.length
              ? el("button", { clase: "boton", alHacerClic: copiar },
                   `Copiar ${sePueden.length === 1 ? "el precio" : `los ${sePueden.length} precios`} de las otras empresas`)
              : el("a", { clase: "boton chico", href: "#catalogo", texto: "Ir a Platos" })))
      : null,

    enCero
      ? el("div", { clase: "nota ojo no-imprimir" },
          el("div", { estilo: "flex:1 1 auto;min-width:0" },
            el("strong", { texto: `${enCero} ${enCero === 1 ? "pedido de hoy" : "pedidos de hoy"} en ${cod} ${enCero === 1 ? "quedó" : "quedaron"} en $ 0` }),
            el("p", { texto:
              "Son los que se anotaron cuando el plato no tenía precio. El precio se " +
              "guarda junto con el pedido, así que ponerlo ahora en el catálogo no los " +
              "cambia: hay que arreglarlos uno por uno." })
          ),
          el("div", { clase: "acciones" },
            el("a", { clase: "boton chico", href: "#revisar", texto: "Arreglarlos en Revisar" })))
      : null
  );
}

/**
 * El PDF de los pedidos del día, para mandárselo a la gente de la fábrica.
 *
 * Es distinto del PDF de la Cocina: ese va por plato ("47 almuerzos") y sirve
 * para saber cuánto preparar. Este va por PERSONA, con lo que pidió y lo que
 * vale, que es lo que necesita quien recibe la lista al otro lado.
 */
function botonDePedidosEnPDF() {
  return botonQueTrabaja("Bajar PDF de los pedidos", () => {
    const comandas = comandasDelDia(estado.datos.consumos, estado.fecha, estado.empresa);
    if (!comandas.length) {
      mensaje("Ese día no hay nada anotado en " + estado.empresa + ".", "ojo");
      return;
    }
    try {
      const emp = empresaPorCodigo(estado.empresa) || {};
      pdfComandasDelDia(
        comandas, estado.fecha,
        emp.codigo || estado.empresa,
        estado.datos.config.acreedor
      );
      mensaje("PDF descargado.", "bien");
    } catch (e) {
      mensaje(e.message, "malo", 8);
    }
  }, "chico");
}

// ---------------------------------------------------------------------------
//  Arriba: el día y la empresa. Se eligen una vez y mandan sobre todo.
// ---------------------------------------------------------------------------

function barraDeMando(raiz) {
  const fecha = el("input", {
    type: "date",
    id: "campo-fecha",
    value: estado.fecha,
    max: "2100-12-31",
    alCambiar: (e) => {
      // Si borra la fecha, el navegador manda "". No dejamos que la app
      // se quede sin día: se vuelve al de hoy y se avisa.
      if (!e.target.value) {
        estado.fecha = hoyISO();
        mensaje("Toda anotación necesita un día. Volví a poner el de hoy.", "ojo");
      } else {
        estado.fecha = e.target.value;
      }
      personaActiva = null;
      pintarRegistrar(raiz);
    },
  });

  const empresa = el("select", {
    id: "campo-empresa",
    alCambiar: (e) => {
      estado.empresa = e.target.value;
      personaActiva = null;
      pintarRegistrar(raiz);
    },
  }, ...empresas().map((emp) => el("option", { value: emp.codigo, selected: emp.codigo === estado.empresa }, emp.codigo)));

  return el("div", { clase: "mando" },
    el("div", { clase: "campo" },
      el("label", { for: "campo-fecha", texto: "Día" }),
      fecha,
      el("small", { estilo: "color:var(--tinta-suave)", texto: fechaLarga(estado.fecha) || "Elija un día" })
    ),
    el("div", { clase: "campo" },
      el("label", { for: "campo-empresa", texto: "Empresa" }),
      empresa,
      el("small", { estilo: "color:var(--tinta-suave)", texto: (empresaPorCodigo(estado.empresa) || {}).razonSocial || "" })
    )
  );
}

// ---------------------------------------------------------------------------
//  El corazón: elegir persona y agregarle platos
// ---------------------------------------------------------------------------

function cajaDeCaptura(raiz) {
  // La clase "caja-captura" no es decorativa: le da a esta tarjeta una capa
  // propia por encima de las siguientes. Sin eso, la lista de nombres que se
  // despliega queda POR DEBAJO de las cifras y las comandas, y no se puede ni
  // leer ni tocar. (Lo provocaron las animaciones: animar transform crea una
  // capa nueva, y una capa nueva encierra a sus hijos.)
  const caja = el("div", { clase: "tarjeta caja-captura" });
  const gente = personasDe(estado.datos, estado.empresa);

  const buscaPersona = buscador({
    etiqueta: "¿Quién comió?",
    placeholder: gente.length === 1
      ? `Escriba el nombre (hay 1 persona en ${estado.empresa})`
      : `Escriba el nombre (hay ${gente.length} personas en ${estado.empresa})`,
    opciones: gente.map((p) => ({ texto: p.nombre, valor: p.nombre })),
    alElegir: (nombre) => { personaActiva = nombre; pintarRegistrar(raiz); },
    alCrear: (nombre) => crearPersona(nombre, raiz),
    textoCrear: (t) => `Crear a "${t}" en ${estado.empresa}`,
  });

  poner(caja,
    el("h3", { texto: "Agregar pedido" }),
    buscaPersona.nodo
  );

  if (personaActiva) {
    poner(caja, comandaEnCurso(raiz));
  } else {
    poner(caja,
      el("p", {
        estilo: "margin:var(--e3) 0 0;color:var(--tinta-suave);font-size:var(--t-sm)",
        texto: "Elija una persona de la lista para empezar a anotarle los platos.",
      })
    );
    setTimeout(() => buscaPersona.enfocar(), 40);
  }
  return caja;
}

/**
 * El botón de la tarjeta: dice cómo paga esa persona y deja cambiarlo.
 *
 * Aquí sí se usa una ventana, al revés que en la comanda abierta: esto es una
 * corrección de vez en cuando y no el paso de todos los días, y en la tarjeta
 * no caben tres botones sin volverla un tablero.
 */
function botonDeComoPagaLaTarjeta(raiz, com, platos) {
  const quien = { empresa: com.empresa, persona: com.persona, fecha: estado.fecha };
  const puesta = comoPagaLaPersona(estado.datos.consumos, quien);
  const cual = COMO_SE_PAGA.find((x) => x.forma === puesta);

  return el("button", {
    clase: "plano chico" + (puesta && puesta !== A_CREDITO ? " marcado-" + puesta : ""),
    title: `Cambiar cómo paga ${com.persona}`,
    alHacerClic: () => elegirComoPagaLaPersona(raiz, com, quien, puesta),
    // El caso normal (a credito) no grita: el boton solo dice para que sirve.
    // Los otros dos SI se nombran, que es lo que hay que ver de un vistazo en
    // cuarenta y seis tarjetas.
  }, !cual ? "Mezclado" : cual.forma === A_CREDITO ? "Cómo paga" : cual.titulo);
}

function elegirComoPagaLaPersona(raiz, com, quien, puesta) {
  const opciones = COMO_SE_PAGA.map((x) =>
    el("button", {
      clase: "opcion-cobro" + (x.forma === puesta ? " puesta" : ""),
      alHacerClic: () => {
        const cambiados = ponerComoPagaLaPersona(estado.datos, quien, x.forma);
        cambio();
        cerrar();
        pintarRegistrar(raiz);
        mensaje(`${com.persona}: ${x.titulo.toLowerCase()} ` +
                `(${cambiados} ${cambiados === 1 ? "plato" : "platos"}).`, "bien", 4);
      },
    },
      el("strong", { texto: x.titulo }),
      el("span", { texto: x.explica })
    )
  );

  const { cerrar } = ventana({
    titulo: `¿Cómo paga ${com.persona}?`,
    cuerpo: el("div", {},
      el("p", { clase: "nota", estilo: "margin:0 0 var(--e3)",
        texto: "Esto cambia TODOS los platos que le anotó hoy." }),
      el("div", { clase: "lista-cobro" }, ...opciones)),
    botones: [{ texto: "Cancelar" }],
  });
}

/**
 * Los tres botones de "cómo paga", para toda la persona.
 *
 * Van a la vista y no dentro de una ventana: ella no explora, y una forma de
 * cobro escondida detrás de un botón es una forma de cobro que nunca se usa.
 * El que está puesto se ve marcado.
 */
function controlDeComoPaga(raiz, laEmpresa) {
  const quien = { empresa: laEmpresa, persona: personaActiva, fecha: estado.fecha };
  const puesta = comoPagaLaPersona(estado.datos.consumos, quien);
  const cuantos = renglonesDe(personaActiva).length;

  return el("div", { clase: "como-paga" },
    el("span", { clase: "como-paga-rotulo", texto: "Cómo paga:" }),
    ...COMO_SE_PAGA.map((x) =>
      el("button", {
        clase: "chico" + (x.forma === puesta ? " marcado-" + x.forma : ""),
        title: x.explica,
        alHacerClic: () => {
          const cambiados = ponerComoPagaLaPersona(estado.datos, quien, x.forma);
          cambio();
          pintarRegistrar(raiz);
          // Si todavía no ha pedido nada, no hay nada que cambiar: lo que pasa
          // es que el PRÓXIMO plato va a nacer así. Hay que decirlo, si no
          // parece que el botón no hizo nada.
          mensaje(
            cuantos === 0
              ? `Listo: lo que le anote a ${personaActiva} entra como "${x.titulo.toLowerCase()}".`
              : `${personaActiva}: ${x.titulo.toLowerCase()} ` +
                `(${cambiados} ${cambiados === 1 ? "plato" : "platos"}).`,
            "bien", 4);
        },
      }, x.titulo)
    ),
    // Mezclado es un caso de verdad, no un error. Se dice en vez de escoger
    // una por su cuenta.
    puesta === null && cuantos > 0
      ? el("span", { clase: "como-paga-mezclado",
          texto: "Ahora tiene platos de varias formas. Toque una para dejarlos todos igual." })
      : null
  );
}

/** La comanda de la persona activa, con su buscador de platos. */
function comandaEnCurso(raiz) {
  const persona = estado.datos.personas.find(
    (p) => clavePersona(p.empresa, p.nombre) === clavePersona(estado.empresa, personaActiva)
  );
  // La empresa de la persona es la de la pantalla: la lista de gente ya viene
  // filtrada por ella. Se deja por si la persona se borró en otra pestaña.
  const laEmpresa = persona ? persona.empresa : estado.empresa;

  const buscaPlato = buscador({
    etiqueta: `¿Qué pidió ${personaActiva}?`,
    placeholder: 'Escriba el plato. Puede poner la cantidad adelante: "3 almuerzo"',
    permiteCantidad: true,
    opciones: estado.datos.productos
      // El nombre en blanco se saca aquí también, aunque completarDatos ya lo
      // bote al cargar. Esta lista se arma al elegir a la persona, que es el
      // paso del que depende toda la mañana: si se cae, ella no puede anotar
      // nada. Una línea de más aquí vale lo que cuesta.
      .filter((p) => p.activo !== false && String(p.nombre || "").trim() !== "")
      .map((p) => {
        const v = precioDe(estado.datos, p.nombre, laEmpresa);
        return { texto: p.nombre, valor: p.nombre, apunte: v === null ? "sin precio" : pesos(v) };
      })
      .sort((a, b) => a.texto.localeCompare(b.texto, "es")),
    alElegir: (plato, _opcion, cuantos) => { agregarPlato(plato, raiz, cuantos); },
    alCrear: (plato) => crearPlato(plato, laEmpresa, raiz),
    textoCrear: (t) => `Crear el plato "${t}"`,
  });

  const mios = renglonesDe(personaActiva);

  // La comanda es una CAJA APARTE, no la continuación de la de arriba.
  //
  // Antes las dos casillas se veían iguales y ella terminaba escribiendo el
  // plato en la casilla del nombre. Eso no es descuido de ella: si dos cosas
  // distintas se ven igual, tarde o temprano se confunden. Aquí la comanda
  // tiene fondo propio, va metida hacia adentro y lleva el nombre arriba,
  // como el papelito que representa.
  const caja = el("div", { clase: "comanda-abierta" });

  poner(caja,
    el("div", { clase: "comanda-abierta-cabeza" },
      el("div", {},
        el("span", { clase: "comanda-abierta-rotulo", texto: "Pedido de" }),
        el("h4", {}, personaActiva, " ", cinta(laEmpresa))
      ),
      el("button", {
        clase: "chico",
        alHacerClic: () => { personaActiva = null; pintarRegistrar(raiz); },
      }, "Terminar con esta persona")
    ),

    // Cómo paga ESTA persona, de una.
    //
    // El botón de cada plato sigue estando para el caso raro (el almuerzo lo
    // paga la empresa y la gaseosa la paga él). Pero lo normal es que la
    // persona entera pague de una forma, y hacerlo plato por plato son tres
    // toques a las seis de la mañana -- y el tercero se olvida. Ese plato
    // olvidado se le cobra a la empresa algo que la persona ya pagó.
    controlDeComoPaga(raiz, laEmpresa),
    atajosDePedido(raiz, laEmpresa, mios.length),
    buscaPlato.nodo,
    mios.length ? tablaDePlatos(mios, raiz) : el("p", {
      clase: "comanda-abierta-vacia",
      texto: "Todavía no le ha anotado nada.",
    })
  );
  // Esc cierra la persona y salta a buscar la siguiente, sin soltar el
  // teclado. Transcribiendo de un audio, cada mano que se levanta cuesta.
  caja.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    personaActiva = null;
    pintarRegistrar(raiz);
  });

  setTimeout(() => buscaPlato.enfocar(), 40);
  return caja;
}

/** Los platos de la persona activa, con sus botones de cantidad y borrar. */
function tablaDePlatos(renglones, raiz) {
  const cuerpo = renglones.map((c) => {
    const problema = !esCortesia(c) && !(c.precioUnitario > 0);
    return el("tr", {},
      el("td", {},
        c.producto,
        problema
          ? el("div", { estilo: "color:var(--rojo);font-size:var(--t-xs)" }, "Sin precio. ",
              el("button", {
                clase: "plano chico",
                estilo: "color:var(--rojo);text-decoration:underline",
                alHacerClic: () => ponerPrecio(c, raiz),
              }, "Póngale precio"))
          : null,
        etiquetaDeCobro(c),

        // La nota del renglon: "sin verduras", "para llevar", lo que sea.
        // Se ve debajo del plato porque es del plato, no de la persona.
        c.observacion
          ? el("button", {
              clase: "nota-renglon",
              title: "Cambiar la nota",
              alHacerClic: () => ponerNota(c, raiz),
            }, c.observacion)
          : el("button", {
              clase: "plano chico agregar-nota",
              alHacerClic: () => ponerNota(c, raiz),
            }, "+ nota")
      ),
      el("td", { clase: "n", estilo: "white-space:nowrap" },
        el("button", { clase: "chico", "aria-label": "Quitar uno", alHacerClic: () => cambiarCantidad(c, -1, raiz) }, "−"),
        el("span", { clase: "num cant", estilo: "display:inline-block;min-width:2ch;text-align:center;margin:0 .3rem", texto: String(c.cantidad) }),
        el("button", { clase: "chico", "aria-label": "Agregar uno", alHacerClic: () => cambiarCantidad(c, +1, raiz) }, "+")
      ),
      el("td", { clase: "n", texto: pesos(c.precioUnitario) }),
      el("td", { clase: "n", texto: pesos(subtotal(c)) }),
      el("td", { clase: "n", estilo: "white-space:nowrap" },
        botonDeCobro(c, raiz),
        el("button", {
          clase: "chico peligro",
          estilo: "margin-left:.3rem",
          "aria-label": `Borrar ${c.producto}`,
          alHacerClic: () => borrarRenglon(c, raiz),
        }, "Borrar")
      )
    );
  });

  const total = renglones.reduce((a, c) => a + subtotal(c), 0);
  return el("div", { clase: "marco-tabla", estilo: "margin-top:var(--e3)" },
    el("table", {},
      el("thead", {}, el("tr", {},
        el("th", { texto: "Plato" }),
        el("th", { clase: "n", texto: "Cantidad" }),
        el("th", { clase: "n", texto: "Precio" }),
        el("th", { clase: "n", texto: "Suma" }),
        el("th", { clase: "n", texto: "" })
      )),
      el("tbody", {}, ...cuerpo),
      el("tfoot", {}, el("tr", {},
        el("td", { colspan: "3", texto: "Total de esta persona" }),
        el("td", { clase: "n", texto: pesos(total) }),
        el("td", {})
      ))
    )
  );
}

// ---------------------------------------------------------------------------
//  Los números del día, en vivo
// ---------------------------------------------------------------------------

function resumenEnVivo() {
  const delDiaTodas = delDia(estado.datos.consumos, estado.fecha);
  const deLaEmpresa = delDiaTodas.filter((c) => c.empresa === estado.empresa);
  const total = deLaEmpresa.reduce((a, c) => a + subtotal(c), 0);
  const totalTodas = delDiaTodas.reduce((a, c) => a + subtotal(c), 0);

  return el("dl", { clase: "cifras", estilo: "margin:0 0 var(--e5)" },
    cifra(`Comandas de ${estado.empresa}`, String(contarFacturas(deLaEmpresa)), true),
    cifraPlata(`Suma de ${estado.empresa}`, total, true),
    cifra("Comandas del día (todas)", String(contarFacturas(delDiaTodas))),
    cifraPlata("Suma del día (todas)", totalTodas)
  );
}

// ---------------------------------------------------------------------------
//  Las comandas ya anotadas
// ---------------------------------------------------------------------------

/**
 * El título de la lista del día, con la sede GRANDE.
 *
 * Esto no es adorno. Ella le manda a los trabajadores un pantallazo de esta
 * lista, y en el pantallazo NO sale la barra de arriba donde uno escoge la
 * empresa: si la sede aparece solo en una cintica de letra chiquita, al otro
 * lado nadie sabe de quién es la lista que está mirando -- y varios de ellos
 * no ven de cerca.
 *
 * Va la SEDE en grande, no la razón social: tres de las sedes se llaman
 * "BOTAS AGROINDUSTRIAL SAS", así que poner eso grande sería decirles lo mismo
 * a las tres. La razón social y el día van debajo, chiquitos, para que el
 * pantallazo se entienda solo y no le toque contestar "es de hoy" cada vez.
 */
function tituloDeLaLista(cuantas, totalDia, deCuantas = null) {
  const emp = empresaPorCodigo(estado.empresa) || {};
  // "hoy" solo cuando de verdad es hoy. Con la fecha ahí abajo, decir "hoy"
  // mirando el lunes pasado se ve como un error de la app.
  const base = estado.fecha === hoyISO() ? "Comandas de hoy" : "Comandas del día";

  // Con un filtro puesto hay que decirlo AQUÍ, en el título, porque esta
  // parte es la que ella fotografía. Una foto a la que le falta gente y no
  // dice que le falta es un papel que engaña a quien lo recibe.
  const cual = COMO_SE_PAGA.find((x) => x.forma === filtroDePago);
  const comoSeLlama = filtroDePago === DE_CONTADO ? "efectivo"
    : cual ? cual.titulo.toLowerCase() : "";
  const arriba = filtroDePago
    ? `${base} · solo ${comoSeLlama}`
    : base;

  const faltan = deCuantas !== null && deCuantas > cuantas ? deCuantas - cuantas : 0;
  const abajo = [
    emp.razonSocial,
    fechaLarga(estado.fecha),
    faltan ? `no salen ${faltan} de ${deCuantas}` : null,
  ].filter(Boolean).join(" · ");

  return el("div", { clase: "titulo-lista", estilo: `--cinta:${colorDeEmpresa(estado.empresa)}` },
    el("div", { clase: "titulo-lista-quien" },
      el("p", { clase: "titulo-lista-arriba", texto: arriba }),
      el("h3", { clase: "titulo-lista-sede", texto: estado.empresa || "?" }),
      abajo ? el("p", { clase: "titulo-lista-pie", texto: abajo }) : null
    ),
    cuantas
      ? el("span", { clase: "titulo-lista-cuenta plata" },
          `${cuantas} comandas · ${pesos(totalDia)}`)
      : null
  );
}

function listaDeComandas(raiz) {
  const renglones = delDia(estado.datos.consumos, estado.fecha).filter((c) => c.empresa === estado.empresa);

  if (!renglones.length) {
    return el("div", {},
      tituloDeLaLista(0, 0),
      vacio(`Todavía no hay nada anotado para ${estado.empresa}`, "Busque la primera persona arriba y agréguele sus platos.")
    );
  }

  // La agrupación por persona la hace el núcleo, para que el papel que se
  // manda y lo que se ve en la pantalla salgan del MISMO sitio. Cuando se
  // agrupa dos veces, tarde o temprano una de las dos cuenta distinto.
  const todas = comandasDelDia(estado.datos.consumos, estado.fecha, estado.empresa);

  // Una comanda entra si TIENE algo de esa forma de pago, no si toda ella es
  // de esa forma: la mezclada (almuerzo a crédito, gaseosa pagada) le
  // interesa a los dos lados, y esconderla de uno sería mandar una foto
  // incompleta.
  const orden = filtroDePago
    ? todas.filter((com) => formasDe(com).has(filtroDePago))
    : todas;

  const tarjetas = orden.map((com, i) => {
    const nombre = com.persona;
    const platos = com.platos;
    const total = com.total;
    const hayProblema = platos.some((c) => c.revisar && c.revisar.length);

    return el("article", {
      clase: "comanda",
      datos: { revisar: hayProblema ? "si" : "no" },
      estilo: `--cinta:${colorDeEmpresa(platos[0].empresa)}`,
    },
      el("header", { clase: "comanda-cabeza" },
        el("span", { clase: "comanda-numero", texto: String(i + 1).padStart(2, "0") }),
        el("h4", { clase: "comanda-nombre", texto: nombre }),
        cinta(com.empresa)
      ),
      el("ul", { clase: "comanda-platos" },
        ...platos.map((c) =>
          el("li", { clase: esCortesia(c) ? "gratis" : yaLoPago(c) ? "pagado" : "" },
            el("span", { clase: "comanda-cant", texto: c.cantidad + "×" }),
            // La nota va DEBAJO del plato, dentro de su misma casilla.
            //
            // Estaba solo en la vista abierta, así que para saber si algo
            // llevaba nota tocaba abrir persona por persona. Y esta tarjeta es
            // justo la que se fotografía para mandarle a la gente: una nota que
            // no sale aquí, no llega.
            el("span", { clase: "comanda-plato" },
              c.producto,
              c.observacion
                ? el("span", { clase: "nota-en-comanda", texto: c.observacion })
                : null
            ),
            // La plata va en su propia casilla para que NO se parta: "$ 12.000"
            // repartido en dos renglones se lee como dos cifras, y esta
            // tarjeta es la que leen los cocineros.
            el("span", { clase: "comanda-valor" },
              esCortesia(c)
                ? el("span", { clase: "comanda-plata", texto: "cortesía" })
                : el("span", {},
                    yaLoPago(c) ? el("span", { texto: "pagó · " }) : null,
                    el("span", { clase: "comanda-plata", texto: pesos(subtotal(c)) }))
            ),
            el("button", {
              clase: "plano chico",
              "aria-label": `Borrar ${c.producto} de ${nombre}`,
              title: "Borrar este plato",
              alHacerClic: () => borrarRenglon(c, raiz),
            }, "×")
          )
        )
      ),
      hayProblema
        ? el("p", { estilo: "margin:0;padding:0 var(--e3) var(--e2);color:var(--rojo);font-size:var(--t-xs)", texto: "Hay un plato sin precio. Ábrala para arreglarlo." })
        : null,
      el("footer", { clase: "comanda-pie" },
        // Cambiar cómo paga, desde la tarjeta.
        //
        // Antes, para corregirlo había que volver a abrir la persona: buscarla
        // otra vez en el buscador, cambiarlo plato por plato y cerrarla. Ella
        // ve el día en estas tarjetas, así que si aquí no se puede, en la
        // práctica no se corrige.
        botonDeComoPagaLaTarjeta(raiz, com, platos),
        el("button", {
          clase: "chico",
          alHacerClic: () => { personaActiva = nombre; pintarRegistrar(raiz); window.scrollTo({ top: 0, behavior: "smooth" }); },
        }, "Abrir"),
        el("span", { clase: "comanda-total", texto: pesos(total) })
      )
    );
  });

  // El total es el de lo que se está mirando, no el del día entero: con un
  // filtro puesto, un total del día completo encima de nueve tarjetas se lee
  // como si esas nueve sumaran eso.
  const totalDia = orden.reduce((a, com) => a + com.total, 0);

  return el("div", {},
    tituloDeLaLista(orden.length, totalDia, todas.length),
    filtrosDePago(todas, raiz),
    orden.length
      ? el("div", { clase: "comandas" }, ...tarjetas)
      : vacio("Ninguna comanda de hoy es de esa forma de pago",
              "Toque “Todas” aquí arriba para verlas todas.")
  );
}

/**
 * ¿Cuáles formas de pago tiene esta comanda?
 *
 * Una sola comanda puede tener dos: el almuerzo lo paga la empresa y la
 * gaseosa la paga él. Por eso devuelve un conjunto y no una forma: si
 * devolviera una sola, la tarjeta mezclada desaparecería de los dos filtros
 * y ella mandaría una foto sin esa persona, sin que nada lo dijera.
 */
function formasDe(com) {
  return new Set(com.platos.map(formaDeCobro));
}

/**
 * La tira para filtrar las tarjetas por cómo se paga.
 *
 * Con el número al lado de cada una: así ella sabe cuántas va a mandar
 * antes de tocar nada, y si una queda en cero se ve que está vacía en vez
 * de tocarla y encontrarse la lista en blanco.
 *
 * La cortesía solo sale cuando de verdad hay alguna: casi nunca hay, y un
 * botón que siempre dice cero es un botón que estorba.
 */
function filtrosDePago(comandas, raiz) {
  const cuantas = (forma) => comandas.filter((c) => formasDe(c).has(forma)).length;
  const opciones = [
    { forma: "", titulo: "Todas", cuantas: comandas.length },
    { forma: A_CREDITO, titulo: "A crédito", cuantas: cuantas(A_CREDITO) },
    { forma: DE_CONTADO, titulo: "Efectivo", cuantas: cuantas(DE_CONTADO) },
  ];
  const cortesias = cuantas(CORTESIA);
  if (cortesias) opciones.push({ forma: CORTESIA, titulo: "Cortesía", cuantas: cortesias });

  return el("div", { clase: "filtro-pago no-imprimir" },
    el("span", { clase: "filtro-pago-rotulo", texto: "Mostrar:" }),
    ...opciones.map((o) =>
      el("button", {
        clase: "filtro-pago-boton" + (filtroDePago === o.forma ? " puesta" : ""),
        "aria-pressed": filtroDePago === o.forma ? "true" : "false",
        alHacerClic: () => { filtroDePago = o.forma; pintarRegistrar(raiz); },
      }, `${o.titulo} (${o.cuantas})`)
    ),
    // "Efectivo" es la palabra de ella; el botón de la tarjeta dice "Pagó
    // de una". Se dice aquí una vez para que no queden dos nombres sueltos.
    el("small", { clase: "filtro-pago-nota",
      texto: "Efectivo es lo que en las tarjetas dice “Pagó de una”." })
  );
}

// ---------------------------------------------------------------------------
//  Las acciones
// ---------------------------------------------------------------------------

function renglonesDe(nombre) {
  return estado.datos.consumos.filter(
    (c) => c.fecha === estado.fecha && c.empresa === estado.empresa && c.persona === nombre
  );
}

// ---------------------------------------------------------------------------
//  "Los mismos de ayer"
//
//  En una fábrica come casi siempre la misma gente. Buscar a las 18 personas
//  una por una, todos los días, es el grueso del trabajo. Aquí se trae la
//  lista del último día registrado y ella solo desmarca a los que faltaron.
//
//  Solo aparece cuando el día está en blanco: si ya empezó a anotar, meterle
//  la lista de ayer encima sería duplicarle el trabajo, no ahorrárselo.
// ---------------------------------------------------------------------------

function tarjetaDeAyer(raiz) {
  const hoyEnEstaEmpresa = delDia(estado.datos.consumos, estado.fecha)
    .filter((c) => normalizar(c.empresa) === normalizar(estado.empresa));
  if (hoyEnEstaEmpresa.length) return null;

  const ayer = loDelDiaAnterior(estado.datos, estado.empresa, estado.fecha);
  if (!ayer || !ayer.gente.length) return null;

  return el("section", { clase: "tarjeta tarjeta-ayer" },
    el("div", { clase: "fila entre" },
      el("div", {},
        el("h3", { texto: `El ${fechaLarga(ayer.fecha)} comieron ${ayer.gente.length} en ${estado.empresa}` }),
        el("p", { clase: "nota", texto: "Si hoy es parecido, tráigalos y quite a los que faltaron." })
      ),
      el("button", {
        clase: "principal",
        alHacerClic: () => ventanaDeAyer(raiz, ayer),
      }, "Traer la lista de ese día")
    )
  );
}

function ventanaDeAyer(raiz, ayer) {
  const yaEstan = yaAnotadasHoy(estado.datos, estado.empresa, estado.fecha);
  const marcados = new Map(ayer.gente.map((g) => [g.persona, !yaEstan.has(g.persona)]));

  const filas = ayer.gente.map((g) => {
    const resumen = g.platos
      .map((p) => (p.cantidad > 1 ? `${p.cantidad} ${p.producto}` : p.producto))
      .join(" + ");
    const casilla = el("input", {
      type: "checkbox",
      checked: marcados.get(g.persona),
      alCambiar: (ev) => marcados.set(g.persona, ev.target.checked),
    });
    return el("tr", { clase: yaEstan.has(g.persona) ? "apagada" : "" },
      el("td", {}, casilla),
      el("td", {}, el("strong", { texto: g.persona })),
      el("td", { texto: resumen }),
      el("td", { clase: "dato", texto: yaEstan.has(g.persona) ? "ya está hoy" : "" })
    );
  });

  const cuerpo = el("div", {},
    el("p", {},
      "Se les va a anotar hoy lo mismo que pidieron el ",
      el("strong", { texto: fechaLarga(ayer.fecha) }), "."),
    el("p", { clase: "nota" },
      "Los precios que se guardan son los de HOY, no los de ese día. Después " +
      "puede cambiarle el pedido a cualquiera."),
    el("div", { clase: "fila" },
      el("button", {
        clase: "plano chico",
        alHacerClic: (ev) => {
          const cuadros = ev.target.closest(".ventana-cuerpo").querySelectorAll('input[type="checkbox"]');
          const prender = [...cuadros].some((c) => !c.checked);
          cuadros.forEach((c, i) => {
            c.checked = prender;
            marcados.set(ayer.gente[i].persona, prender);
          });
        },
      }, "Marcar o desmarcar todos")
    ),
    tabla([{ titulo: "" }, { titulo: "Persona" }, { titulo: "Pidió" }, { titulo: "", clase: "dato" }], filas)
  );

  ventana({
    titulo: "Los mismos de ese día",
    cuerpo,
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Anotarlos",
        clase: "principal",
        alHacerClic: () => {
          const elegidos = ayer.gente.filter((g) => marcados.get(g.persona));
          if (!elegidos.length) { mensaje("No marcó a nadie.", "ojo"); return; }

          let personas = 0;
          let renglones = 0;
          for (const g of elegidos) {
            const persona = estado.datos.personas.find(
              (p) => clavePersona(p.empresa, p.nombre) === clavePersona(estado.empresa, g.persona)
            );
            if (!persona) continue; // ya no está en la empresa: se salta
            for (const plato of g.platos) {
              // El precio se congela con el catálogo de HOY, no con el de ese
              // día: si subió el almuerzo, lo de hoy se cobra a lo de hoy.
              const precio = precioDe(estado.datos, plato.producto, estado.empresa);
              estado.datos.consumos.push(nuevoConsumo({
                fecha: estado.fecha,
                empresa: estado.empresa,
                persona: persona.nombre,
                producto: plato.producto,
                cantidad: plato.cantidad,
                precioUnitario: precio === null ? 0 : precio,
              }));
              renglones++;
            }
            personas++;
          }
          cambio();
          pintarRegistrar(raiz);
          mensaje(`Anotadas ${personas} personas, ${renglones} renglones.`, "bien", 6);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
//  Atajos: lo que hace que no haya que escribir nada
//
//  De los 896 pedidos de agosto, el 61 % es exactamente lo que esa misma
//  persona pide todos los días, y un solo plato (ALMUERZO) es el 37 % de todo.
//  Así que la mayoría de las veces no hay nada que buscar: ya sabemos qué va
//  a pedir. Estos botones convierten "buscar, escribir, elegir" en un toque.
//
//  Ojo: son ATAJOS, no automatismos. Nada se anota sin que ella lo toque.
// ---------------------------------------------------------------------------

function atajosDePedido(raiz, laEmpresa, yaTieneAlgo) {
  const caja = el("div", { clase: "atajos" });

  // 1) Lo de siempre. Solo si todavía no le ha anotado nada hoy: si ya empezó,
  //    ofrecerle "repetir" sería confuso y podría duplicarle el pedido.
  if (!yaTieneAlgo) {
    const habito = pedidoHabitual(estado.datos, estado.empresa, personaActiva, estado.fecha);
    if (tieneCostumbre(habito)) {
      const { total, faltaPrecio } = cuantoValdria(estado.datos, habito.platos, laEmpresa);
      const resumen = habito.platos
        .map((p) => (p.cantidad > 1 ? `${p.cantidad} ${p.producto}` : p.producto))
        .join(" + ");

      poner(caja,
        el("button", {
          clase: "principal lo-de-siempre",
          alHacerClic: () => {
            for (const p of habito.platos) {
              for (let i = 0; i < p.cantidad; i++) agregarPlato(p.producto, raiz);
            }
          },
        },
          el("strong", { texto: "Lo de siempre" }),
          el("small", { texto: resumen + (faltaPrecio ? "  ·  ojo, falta un precio" : `  ·  ${pesos(total)}`) })
        ),
        el("span", { clase: "nota atajo-porque" },
          habito.veces === habito.dias
            ? `es lo que ha pedido las ${habito.dias} veces`
            : `${habito.veces} de sus ${habito.dias} días`)
      );
    }
  }

  // 2) Los platos que más se piden en esta empresa, a un toque.
  const frecuentes = platosFrecuentes(estado.datos, estado.empresa, { limite: 5 });
  if (frecuentes.length) {
    poner(caja,
      el("div", { clase: "fila fichas-platos" },
        ...frecuentes.map((f) =>
          el("button", {
            clase: "ficha-plato",
            title: `${f.producto} — ${pesos(f.precio)}`,
            alHacerClic: () => agregarPlato(f.producto, raiz),
          },
            el("span", { texto: f.producto }),
            el("small", { texto: pesos(f.precio) })
          )
        )
      )
    );
  }

  return caja.children.length ? caja : null;
}

/**
 * Ponerle una nota a un renglon: "sin verduras", "para llevar".
 *
 * La nota NO cambia el precio ni la cantidad. Es un recado para la cocina, y
 * sale en la pantalla de Cocina junto al nombre de quien lo pidio.
 */
async function ponerNota(renglon, raiz) {
  const r = await pedirDatos({
    titulo: `Nota para ${renglon.producto}`,
    campos: [
      {
        nombre: "nota",
        etiqueta: "¿Qué hay que tener en cuenta?",
        valor: renglon.observacion || "",
        ayuda: 'Por ejemplo: "sin verduras", "para llevar", "sin cebolla". ' +
               "Sale en la pantalla de Cocina. No cambia el precio.",
      },
    ],
    textoAceptar: "Guardar la nota",
  });
  if (r === null) return;

  renglon.observacion = String(r.nota || "").trim();
  cambio();
  pintarRegistrar(raiz);
  mensaje(
    renglon.observacion
      ? `Anotado: "${renglon.observacion}". Sale en Cocina.`
      : "Nota quitada.",
    "bien", 4
  );
}

function agregarPlato(plato, raiz, cuantos = 1) {
  const cantidad = Math.max(1, Math.min(Number(cuantos) || 1, 99));
  const persona = estado.datos.personas.find(
    (p) => clavePersona(p.empresa, p.nombre) === clavePersona(estado.empresa, personaActiva)
  );
  if (!persona) {
    mensaje(`${personaActiva} ya no está en ${estado.empresa}. Vuelva a elegir la persona.`, "malo", 7);
    personaActiva = null;
    pintarRegistrar(raiz);
    return;
  }
  const laEmpresa = persona.empresa || estado.empresa;

  // Si ya le habían anotado ese mismo plato hoy, se le suma uno en vez de
  // abrir un renglón nuevo. Así la comanda no se llena de renglones repetidos.
  const yaEsta = renglonesDe(personaActiva).find(
    (c) => c.producto === normalizar(plato) && !esCortesia(c)
  );
  if (yaEsta) {
    yaEsta.cantidad += cantidad;
    recalcularRevisar(yaEsta);
    cambio();
    pintarRegistrar(raiz);
    mensaje(`${plato}: van ${yaEsta.cantidad}.`, "bien", 2);
    return;
  }

  const precio = precioDe(estado.datos, plato, laEmpresa);

  // La gente del propio restaurante paga de una, de su bolsillo. Si el renglón
  // naciera "a crédito" como los de las fábricas, esa plata quedaría anotada
  // como deuda de una empresa a la que nunca se le va a pasar cuenta: no
  // entraría a la caja y el cuadre no daría nunca. Y ella no se iba a acordar
  // de marcar plato por plato a las seis de la mañana.
  const esCasa = esLaCasa(empresaPorCodigo(laEmpresa));

  // El plato nuevo nace como los que esa persona YA tiene hoy.
  //
  // Sin esto, ella marcaba "pagó de una", agregaba la gaseosa, y la gaseosa
  // entraba a crédito sin decir nada. A fin de quincena se le cobraba a la
  // empresa una gaseosa que la persona ya había pagado: cobrada dos veces.
  const comoViene = comoPagaLaPersona(estado.datos.consumos, {
    empresa: laEmpresa, persona: personaActiva, fecha: estado.fecha,
  });

  const renglon = nuevoConsumo({
    fecha: estado.fecha,
    empresa: laEmpresa,
    persona: personaActiva,
    producto: plato,
    cantidad,
    precioUnitario: precio === null ? 0 : precio,
    cobro: comoViene || (esCasa ? DE_CONTADO : null),
  });
  estado.datos.consumos.push(renglon);
  cambio();
  pintarRegistrar(raiz);
  if (precio === null) {
    mensaje(`"${plato}" no tiene precio para ${laEmpresa}. Quedó en $ 0 y marcado en rojo.`, "ojo", 7);
  }
}

function cambiarCantidad(renglon, delta, raiz) {
  const nueva = renglon.cantidad + delta;
  if (nueva <= 0) { borrarRenglon(renglon, raiz); return; }
  renglon.cantidad = nueva;
  recalcularRevisar(renglon);
  cambio();
  pintarRegistrar(raiz);
}

async function borrarRenglon(renglon, raiz) {
  const seguro = await confirmar({
    titulo: "Borrar este plato",
    mensaje: `Se va a borrar ${renglon.cantidad} × ${renglon.producto} de ${renglon.persona}. Esto no se puede deshacer.`,
    siTexto: "Sí, borrarlo",
    peligroso: true,
  });
  if (!seguro) return;
  const i = estado.datos.consumos.indexOf(renglon);
  if (i >= 0) estado.datos.consumos.splice(i, 1);
  cambio();
  pintarRegistrar(raiz);
  mensaje("Plato borrado.", "bien", 2);
}

async function ponerPrecio(renglon, raiz) {
  const datos = await pedirDatos({
    titulo: `Precio de ${renglon.producto}`,
    campos: [
      {
        nombre: "precio",
        etiqueta: `¿Cuánto vale para ${renglon.empresa}?`,
        tipo: "number",
        valor: "",
        requerido: true,
        min: 0,
      },
      {
        nombre: "guardarEnCatalogo",
        etiqueta: "Guardarlo también en el catálogo, para las próximas veces",
        tipo: "casilla",
        valor: true,
      },
    ],
    textoAceptar: "Poner el precio",
  });
  if (!datos) return;
  const valor = Number(datos.precio) || 0;
  renglon.precioUnitario = valor;
  recalcularRevisar(renglon);
  if (datos.guardarEnCatalogo) {
    // El catálogo guarda el nombre ya limpio, así que este renglón tiene que
    // quedar con ese mismo nombre limpio. Si no, el precio quedaría guardado
    // bajo "ARROZ" y el renglón seguiría diciendo "ARROZ." y nunca se
    // encontrarían: es exactamente el error que estamos matando.
    renglon.producto = limpiarNombre(renglon.producto);
    agregarProducto(estado.datos, renglon.producto, { [renglon.empresa]: valor });
  }
  cambio();
  pintarRegistrar(raiz);
  mensaje(`${renglon.producto} quedó en ${pesos(valor)}.`, "bien");
}

/** Vuelve a mirar si el renglón tiene algún problema. Se llama en cada cambio. */
function recalcularRevisar(c) {
  const revisar = [];
  if (!esCortesia(c) && !(c.precioUnitario > 0)) revisar.push("SIN_PRECIO");
  if (!(c.cantidad > 0)) revisar.push("SIN_CANTIDAD");
  c.revisar = revisar;
}

/**
 * La defensa contra los nombres repetidos, en el momento exacto en que se
 * podrían crear. Un duplicado que nunca nace no hay que arreglarlo después.
 *
 * Devuelve el nombre de la persona que hay que usar, o "ES OTRA" si de verdad
 * es alguien nuevo, o null si prefirió cancelar.
 */
function preguntarSiEsLaMisma(nombre, parecidas) {
  return new Promise((resolver) => {
    let respuesta = null;

    const cuerpo = el("div", {},
      el("p", {},
        "Antes de crear a ", el("strong", { texto: nombre }),
        `, mire: en ${estado.empresa} ya hay `,
        parecidas.length === 1 ? "alguien con un nombre casi igual." : "gente con nombres casi iguales."),
      el("p", { clase: "nota" },
        "Si es la misma persona, tóquela y seguimos con ella. Así no queda el " +
        "consumo partido en dos.")
    );

    const opciones = el("div", { clase: "opciones-parecidas" });
    for (const p of parecidas.slice(0, 6)) {
      opciones.append(
        el("button", {
          clase: "opcion-parecida",
          alHacerClic: () => { respuesta = p.persona.nombre; cerrar(); },
        },
          el("strong", { texto: p.persona.nombre }),
          el("small", { texto: p.razon })
        )
      );
    }
    opciones.append(
      el("button", {
        clase: "opcion-parecida es-otra",
        alHacerClic: () => { respuesta = "ES OTRA"; cerrar(); },
      },
        el("strong", { texto: `No, ${nombre} es otra persona` }),
        el("small", { texto: "Se crea nueva, aparte de las de arriba" })
      )
    );
    cuerpo.append(opciones);

    const { cerrar } = ventana({
      titulo: "¿Es la misma persona?",
      cuerpo,
      botones: [{ texto: "Cancelar", alHacerClic: () => { respuesta = null; } }],
      alCerrar: () => resolver(respuesta),
    });
  });
}

async function crearPersona(nombreEscrito, raiz) {
  // Lo primero: quitarle los puntos y los espacios de sobra a lo que escribió.
  const nombre = limpiarNombre(nombreEscrito);
  if (!nombre) { mensaje("Escriba un nombre.", "ojo"); return; }

  // Lo segundo: ¿ya hay alguien casi igual en ESTA empresa?
  // Solo miramos esta empresa: los tocayos de otras sedes son personas
  // distintas y no tienen nada que ver.
  const parecidas = parecidasEnEmpresa(estado.datos, nombre, estado.empresa)
    .filter((p) => p.fuerza >= 2);

  if (parecidas.length) {
    const elegida = await preguntarSiEsLaMisma(nombre, parecidas);
    if (elegida === null) return;            // canceló
    if (elegida !== "ES OTRA") {             // era una que ya existía
      personaActiva = elegida;
      pintarRegistrar(raiz);
      mensaje(`Seguimos con ${elegida}, que ya estaba.`, "bien");
      return;
    }
  }

  const lista = empresas();
  const datos = await pedirDatos({
    titulo: `Crear a ${nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "text", valor: nombre, requerido: true },
      // Ya no se pregunta a qué empresa se le cobra: es la de la pantalla.
      {
        nombre: "empresa",
        etiqueta: "Empresa",
        tipo: "seleccion",
        valor: estado.empresa,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
        ayuda: "Casi siempre es la misma donde come. Cámbielo solo si se le cobra a otra.",
      },
      {
        nombre: "documento", etiqueta: "Cédula (opcional)", tipo: "text",
        ayuda: "Sirve para no confundirla con otra del mismo nombre. La app " +
               "guarda solo los últimos 5 números, nada más.",
      },
    ],
    textoAceptar: "Crear y usar",
  });
  if (!datos) return;
  try {
    agregarPersona(estado.datos, {
      nombre: datos.nombre,
      empresa: datos.empresa || estado.empresa,
      documento: datos.documento,
    });
  } catch (e) {
    mensaje(e.message, "malo", 6);
    return;
  }
  personaActiva = limpiarNombre(datos.nombre);
  cambio();
  pintarRegistrar(raiz);

  // Si el mismo nombre existe en otra empresa, se lo decimos. No es un error
  // (son personas distintas), pero si no se avisa, después ve el nombre
  // repetido en las listas y cree que se dañó algo.
  const tocayos = tocayosEnOtrasEmpresas(estado.datos, personaActiva, estado.empresa);
  if (tocayos.length) {
    const donde = [...new Set(tocayos.map((t) => t.empresa))].join(" y ");
    mensaje(
      `${personaActiva} quedó en ${estado.empresa}. Ojo: hay otra persona con ` +
      `ese mismo nombre en ${donde}, y son distintas.`,
      "ojo", 8
    );
  } else {
    mensaje(`${personaActiva} quedó en ${estado.empresa}.`, "bien");
  }
}

async function crearPlato(plato, laEmpresa, raiz) {
  const lista = empresas();
  const datos = await pedirDatos({
    titulo: `Crear el plato "${plato}"`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre del plato", tipo: "text", valor: plato, requerido: true },
      { nombre: "precio", etiqueta: `Precio para ${laEmpresa}`, tipo: "number", valor: "", requerido: true, min: 0 },
      {
        nombre: "todas",
        etiqueta: "Vale lo mismo en todas las empresas",
        tipo: "casilla",
        valor: true,
        ayuda: "Si en alguna vale distinto, después se cambia en la pantalla Catálogo.",
      },
    ],
    textoAceptar: "Crear y anotar",
  });
  if (!datos) return;
  const valor = Number(datos.precio) || 0;
  const precios = {};
  if (datos.todas) for (const e of lista) precios[e.codigo] = valor;
  else precios[laEmpresa] = valor;
  agregarProducto(estado.datos, datos.nombre, precios);
  cambio();
  agregarPlato(limpiarNombre(datos.nombre), raiz);
  mensaje(`"${limpiarNombre(datos.nombre)}" quedó en el catálogo a ${pesos(valor)}.`, "bien");
}


// ===========================================================================
//  CÓMO SE PAGA CADA PLATO
//
//  Antes había un solo botón, "No cobrar", y no alcanzaba. Si alguien pagaba
//  de una, las dos salidas estaban malas: dejarlo normal le cobraba a la
//  empresa algo ya pagado, y marcarlo "no cobrar" hacía desaparecer la venta.
//
//  El caso normal (a crédito) va callado a propósito. De veinte platos del
//  día, diecinueve son a crédito: si cada uno gritara su estado, el día que
//  uno sea distinto no se notaría. Solo se marcan las excepciones.
// ===========================================================================

const COMO_SE_PAGA = [
  {
    forma: A_CREDITO,
    titulo: "A crédito",
    corto: "Pago",
    explica: "Se le cobra a la empresa en la cuenta de la quincena. Es lo normal.",
  },
  {
    forma: DE_CONTADO,
    titulo: "Pagó de una",
    corto: "Pagó de una",
    explica: "La persona ya pagó de su bolsillo. NO se le cobra a la empresa, " +
             "pero sí cuenta como venta del día y tiene que estar en la caja.",
  },
  {
    forma: CORTESIA,
    titulo: "Cortesía",
    corto: "Cortesía",
    explica: "No lo paga nadie. No se le cobra a la empresa ni entra a la caja: " +
             "vale cero en todas partes.",
  },
];

function etiquetaDeCobro(c) {
  if (loNormal(c)) return null;
  const cual = COMO_SE_PAGA.find((x) => x.forma === formaDeCobro(c));
  return el("div", { clase: "marca-cobro " + formaDeCobro(c), texto: cual.titulo });
}

const loNormal = (c) => formaDeCobro(c) === A_CREDITO;

function botonDeCobro(c, raiz) {
  const cual = COMO_SE_PAGA.find((x) => x.forma === formaDeCobro(c));
  return el("button", {
    clase: loNormal(c) ? "chico" : "chico marcado-" + formaDeCobro(c),
    title: "Cómo se paga este plato",
    alHacerClic: () => elegirComoSePaga(c, raiz),
  }, cual.corto);
}

function elegirComoSePaga(renglon, raiz) {
  const actual = formaDeCobro(renglon);

  const opciones = COMO_SE_PAGA.map((x) =>
    el("button", {
      clase: "opcion-cobro" + (x.forma === actual ? " puesta" : ""),
      alHacerClic: () => {
        ponerFormaDeCobro(renglon, x.forma);
        cambio();
        cerrar();
        pintarRegistrar(raiz);
        if (x.forma !== actual) {
          mensaje(`${renglon.producto}: ${x.titulo.toLowerCase()}.`, "bien", 4);
        }
      },
    },
      el("strong", { texto: x.titulo }),
      el("span", { texto: x.explica })
    )
  );

  const { cerrar } = ventana({
    titulo: `¿Cómo se paga ${renglon.producto}?`,
    cuerpo: el("div", { clase: "lista-cobro" }, ...opciones),
    botones: [{ texto: "Cancelar" }],
  });
}

/**
 * Deja el renglón en la forma escogida.
 *
 * Escribe también el "facturable" viejo. No hace falta para las cuentas -- el
 * núcleo ya lee el campo nuevo -- pero si mañana quedara un pedazo de código
 * mirando el viejo, va a leer algo coherente en vez de lo contrario. Es un
 * campo de más en el archivo; una cuenta equivocada cuesta bastante más.
 */

