// ============================================================================
//  proveedores.js  -  Las facturas que entran y lo que hay que pagar
//
//  El otro lado del negocio. Dos pantallas:
//
//    Facturas     anotar la factura que acaba de traer el proveedor.
//    Pago semanal LA META, dicha por ella: "totalizar el pago semanal de
//                 proveedores". Los lunes se gira, y esa mañana lo que
//                 necesita es UN número por proveedor.
//
//  Lo que reemplaza: un Excel de cinco hojas donde el estado del pago vivía en
//  texto libre ("PAGAS", "PAGADA", "PAGA", "YA SE PAGO", y números sueltos en
//  la misma columna). O sea que "¿qué me falta por pagar?" no se podía
//  contestar sin leer 141 renglones a ojo.
// ============================================================================

import {
  el, vaciar, poner, tabla, cifra, cifraPlata, acciones, vacio, mensaje,
  buscador, confirmar,
} from "./componentes.js";
import { estado, cambio } from "./estado.js";
import {
  pesos, fechaLarga, fechaCorta, hoyISO, sumarDias, normalizar,
} from "../nucleo/formato.js";
import {
  pagoSemanal, laSemanaDe, comprasEnRango, loQueFaltaPorPagar,
  estaPagada, sinValor, proveedoresDe, sedesDe, proveedoresParecidos,
} from "../nucleo/compras.js";
import { nuevaCompra, ponerPagada } from "../nucleo/modelo.js";

// La semana y la sede que se están mirando. Viven aquí y no en estado.js
// porque son de estas pantallas: cambiarlas no puede moverle el día a
// Registrar, que es donde ella trabaja cada mañana.
let semana = null;
let sedeVista = "";

/** De qué lunes a qué domingo se está mirando. */
function laSemana() {
  if (semana && semana.desde && semana.hasta) return semana;
  return laSemanaDe(hoyISO());
}

function sedes() {
  return sedesDe(estado.datos.compras);
}

// ===========================================================================
//  1. PAGO SEMANAL  -  la meta
// ===========================================================================

export function pintarPagos(raiz) {
  vaciar(raiz);
  const repintar = () => pintarPagos(raiz);
  const cual = laSemana();
  const pago = pagoSemanal(estado.datos.compras, cual.desde, cual.hasta, sedeVista || null);
  const debiendo = loQueFaltaPorPagar(estado.datos.compras, sedeVista || null);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Pago semanal" }),
        el("p", { texto: "Cuánto hay que girarle a cada proveedor esta semana." })
      ),
      acciones(el("button", { clase: "chico", alHacerClic: () => window.print() }, "Imprimir"))
    ),
    mandoDeSemana(repintar)
  );

  if (!estado.datos.compras.length) {
    poner(raiz, vacio("Todavía no hay facturas anotadas",
      el("p", {}, "Vaya a ", el("a", { href: "#compras", texto: "Facturas" }),
        " y anote la primera.")));
    return;
  }

  poner(raiz,
    el("div", { clase: "documento" },
      el("div", { clase: "titulo-lista", estilo: "--cinta:var(--marca)" },
        el("div", { clase: "titulo-lista-quien" },
          el("p", { clase: "titulo-lista-arriba", texto: "Hay que girar" }),
          el("h3", { clase: "titulo-lista-sede", texto: pesos(pago.total.porPagar) }),
          el("p", { clase: "titulo-lista-pie",
            texto: `Del ${fechaCorta(cual.desde)} al ${fechaCorta(cual.hasta)} · ` +
                   `${pago.total.proveedores} proveedores · ${pago.total.facturas} facturas` })
        )
      ),

      // Proveedores escritos de dos formas. Es lo más caro que puede pasar en
      // esta pantalla: son dos filas, ella gira las dos, y le paga dos veces
      // al mismo. Se avisa aquí y no en otra pantalla porque es aquí donde
      // está a punto de girar.
      avisoDeParecidos(),

      // Una factura sin valor no suma -- no se puede inventar lo que vale --
      // pero callarla dejaría el giro corto sin que nada lo dijera.
      pago.total.sinValor
        ? el("p", { clase: "aviso-ojo" },
            el("strong", { texto: `Ojo: ${pago.total.sinValor} ` +
              (pago.total.sinValor === 1 ? "factura llegó" : "facturas llegaron") + " sin valor. " }),
            "No están sumando, así que hay que pagar más de lo que dice aquí.")
        : null,

      el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
        cifraPlata("Por pagar esta semana", pago.total.porPagar, true),
        cifraPlata("Ya pagado", pago.total.pagado),
        cifraPlata("Todo lo que entró", pago.total.total)
      ),

      pago.filas.length
        ? tablaDeProveedores(pago, repintar)
        : vacio(`No entró ninguna factura del ${fechaCorta(cual.desde)} al ${fechaCorta(cual.hasta)}`,
                el("p", { texto: "Pruebe con otra semana." }))
    )
  );

  // Lo que se quedó debiendo de semanas pasadas. Es lo que el Excel no podía
  // contestar, y es plata que se puede quedar sin pagar sin que nadie lo note.
  const viejas = debiendo.filter((c) => c.fecha < cual.desde);
  if (viejas.length) {
    poner(raiz,
      el("div", { clase: "documento" },
        el("h2", { texto: "Viene debiendo de antes" }),
        el("p", { clase: "nota", estilo: "margin:var(--e2) 0 var(--e4)" },
          `${viejas.length} ${viejas.length === 1 ? "factura" : "facturas"} de antes ` +
          `del ${fechaCorta(cual.desde)} que siguen sin pagar.`),
        tablaDeFacturas(viejas, repintar)
      )
    );
  }
}

function mandoDeSemana(repintar) {
  const cual = laSemana();
  const mover = (dias) => {
    const otro = sumarDias(cual.desde, dias);
    semana = laSemanaDe(otro);
    repintar();
  };

  return el("div", { clase: "mando" },
    el("div", { clase: "campo" },
      el("label", { texto: "Semana" }),
      el("div", { clase: "atajos-rango" },
        el("button", { clase: "chico", alHacerClic: () => mover(-7) }, "‹ La anterior"),
        el("button", { clase: "chico", alHacerClic: () => { semana = null; repintar(); } }, "Esta semana"),
        el("button", { clase: "chico", alHacerClic: () => mover(7) }, "La siguiente ›")
      ),
      el("small", { estilo: "color:var(--tinta-suave)",
        texto: `Del ${fechaLarga(cual.desde)} al ${fechaLarga(cual.hasta)}` })
    ),
    selectorDeSede(repintar)
  );
}

function selectorDeSede(repintar) {
  const lista = sedes();
  if (lista.length < 2) return null;
  return el("div", { clase: "campo" },
    el("label", { for: "sede-compras", texto: "Sede" }),
    el("select", {
      id: "sede-compras",
      alCambiar: (e) => { sedeVista = e.target.value; repintar(); },
    },
      el("option", { value: "", selected: !sedeVista }, "Todas las sedes"),
      ...lista.map((s) => el("option", { value: s, selected: s === sedeVista }, s))
    )
  );
}

/**
 * Una fila por proveedor: el número que ella necesita el lunes.
 *
 * "Por pagar" es la columna que manda y va destacada. "Ya pagado" va aparte y
 * discreto: si se sumaran, giraría otra vez algo que ya pagó.
 */
function tablaDeProveedores(pago, repintar) {
  const hayPagado = pago.total.pagado > 0;
  return tabla(
    [
      { titulo: "Proveedor" },
      { titulo: "Facturas", clase: "n" },
      ...(hayPagado ? [{ titulo: "Ya pagado", clase: "n" }] : []),
      { titulo: "POR PAGAR", clase: "n" },
    ],
    pago.filas.map((f) =>
      el("tr", {},
        el("td", {},
          el("strong", { texto: f.proveedor }),
          el("div", { clase: "que-pidio",
            texto: f.compras.map((c) => c.producto).filter(Boolean).join(", ") }),
          f.sinValor
            ? el("div", { clase: "nota malo",
                texto: `${f.sinValor} sin valor: no están sumando` })
            : null
        ),
        el("td", { clase: "n cant", texto: String(f.facturas) }),
        ...(hayPagado
          ? [el("td", { clase: "n", texto: f.pagado ? pesos(f.pagado) : "·" })]
          : []),
        el("td", { clase: "n plata-fila",
                   estilo: f.porPagar ? "font-size:1.1em" : "color:var(--tinta-suave)",
                   texto: f.porPagar ? pesos(f.porPagar) : "al día" })
      )
    ),
    el("tr", {},
      el("td", { texto: `TOTAL · ${pago.total.proveedores} proveedores` }),
      el("td", { clase: "n cant", texto: String(pago.total.facturas) }),
      ...(hayPagado ? [el("td", { clase: "n", texto: pesos(pago.total.pagado) })] : []),
      el("td", { clase: "n", texto: pesos(pago.total.porPagar) })
    )
  );
}

// ===========================================================================
//  2. FACTURAS  -  anotar la que acaba de llegar
// ===========================================================================

export function pintarCompras(raiz) {
  vaciar(raiz);
  const repintar = () => pintarCompras(raiz);
  const cual = laSemana();
  const deLaSemana = comprasEnRango(
    estado.datos.compras, cual.desde, cual.hasta, sedeVista || null);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Facturas de proveedores" }),
        el("p", { texto: "Anote la factura que acaba de traer el proveedor." })
      )
    ),
    cajaDeFactura(raiz),
    mandoDeSemana(repintar)
  );

  poner(raiz,
    el("div", { clase: "documento" },
      el("div", { clase: "fila entre" },
        el("h2", { texto: `Del ${fechaCorta(cual.desde)} al ${fechaCorta(cual.hasta)}` }),
        el("span", { clase: "comanda-total",
          texto: pesos(deLaSemana.reduce((a, c) => a + (Number(c.valor) || 0), 0)) })
      ),
      deLaSemana.length
        ? tablaDeFacturas(deLaSemana, repintar)
        : vacio("Esta semana no hay facturas anotadas",
                el("p", { texto: "Anote la primera arriba." }))
    )
  );
}

/**
 * La caja de anotar, a la vista y no dentro de una ventana.
 *
 * Es el mismo molde de Registrar: primero se elige de QUIÉN es la factura y
 * después se llenan los datos. Ella ya conoce ese camino.
 */
function cajaDeFactura(raiz) {
  const caja = el("div", { clase: "tarjeta caja-captura" });
  const lista = proveedoresDe(estado.datos.compras);

  const busca = buscador({
    etiqueta: "¿De qué proveedor es la factura?",
    placeholder: lista.length
      ? `Escriba el nombre (hay ${lista.length} proveedores)`
      : "Escriba el nombre del proveedor",
    opciones: lista.map((p) => ({ texto: p.nombre, valor: p.nombre, apunte: `${p.veces} facturas` })),
    alElegir: (nombre) => formularioDeFactura(raiz, nombre),
    alCrear: (nombre) => formularioDeFactura(raiz, nombre),
    textoCrear: (t) => `Es de "${t}" (proveedor nuevo)`,
  });

  poner(caja, el("h3", { texto: "Anotar una factura" }), busca.nodo);
  return caja;
}

async function formularioDeFactura(raiz, proveedor) {
  const lista = sedes();
  const { pedirDatos } = await import("./componentes.js");

  const datos = await pedirDatos({
    titulo: `Factura de ${normalizar(proveedor)}`,
    campos: [
      { nombre: "fecha", etiqueta: "¿Qué día llegó?", tipo: "date",
        valor: hoyISO(), requerido: true },
      lista.length
        ? { nombre: "sede", etiqueta: "¿A qué sede?", tipo: "seleccion",
            valor: sedeVista || lista[0],
            opciones: lista.map((s) => ({ valor: s, texto: s })) }
        : { nombre: "sede", etiqueta: "¿A qué sede?", valor: "", requerido: true,
            ayuda: "Como BOSQUE LARGO o LAGOS. Es dónde llegó la comida." },
      { nombre: "factura", etiqueta: "Número de la factura", valor: "", requerido: true },
      { nombre: "producto", etiqueta: "¿Qué trajo?", valor: "", requerido: true,
        ayuda: "Como TOCINO o PECHUGA. Lo que dice la factura." },
      { nombre: "cantidad", etiqueta: "¿Cuánto?", valor: "",
        ayuda: 'Tal cual viene escrito: "20 KILOS", "8,29 KG". No se usa para sumar.' },
      { nombre: "valor", etiqueta: "¿Cuánto vale?", tipo: "number", valor: "",
        requerido: true, min: 0,
        ayuda: "Este SÍ es el que se suma para el pago del lunes." },
      { nombre: "quienRecibe", etiqueta: "¿Quién la recibió?", valor: "",
        ayuda: "El supervisor que la ingresó." },
    ],
    textoAceptar: "Anotar la factura",
  });
  if (!datos) return;

  const compra = nuevaCompra({ ...datos, proveedor });

  // Dos facturas con el mismo número del mismo proveedor puede ser un doble
  // registro -- en su Excel hay dos pares así -- o puede ser de verdad. No se
  // decide por ella: se pregunta.
  const repetida = estado.datos.compras.find(
    (c) => normalizar(c.proveedor) === compra.proveedor &&
           normalizar(c.factura) === normalizar(compra.factura));
  if (repetida) {
    const seguir = await confirmar({
      titulo: "Esa factura ya está anotada",
      mensaje: `La factura ${compra.factura} de ${compra.proveedor} ya está, ` +
               `del ${fechaCorta(repetida.fecha)} por ${pesos(repetida.valor)}.` +
               "\n\n¿La anoto otra vez de todos modos?",
      siTexto: "Sí, anotarla igual",
      noTexto: "No, dejarlo así",
    });
    if (!seguir) return;
  }

  estado.datos.compras.push(compra);
  cambio();
  pintarCompras(raiz);
  mensaje(`Factura ${compra.factura} de ${compra.proveedor}: ${pesos(compra.valor)}.`, "bien", 5);
}

function tablaDeFacturas(compras, repintar) {
  return tabla(
    [
      { titulo: "Día" }, { titulo: "Factura" }, { titulo: "Proveedor" },
      { titulo: "Qué trajo" }, { titulo: "Valor", clase: "n" }, { titulo: "Pago" },
    ],
    compras.map((c) =>
      el("tr", {},
        el("td", { clase: "dato", texto: fechaCorta(c.fecha) }),
        el("td", { clase: "dato", texto: c.factura || "—" }),
        el("td", {}, el("strong", { texto: c.proveedor }),
          c.sede ? el("div", { clase: "que-pidio", texto: c.sede }) : null),
        el("td", {}, c.producto,
          c.cantidad ? el("div", { clase: "que-pidio", texto: c.cantidad }) : null),
        el("td", { clase: "n plata-fila" },
          sinValor(c)
            ? el("span", { clase: "marca-cobro cortesia", texto: "sin valor" })
            : pesos(c.valor)),
        el("td", {}, botonDePago(c, repintar))
      )
    )
  );
}

function botonDePago(compra, repintar) {
  const pagada = estaPagada(compra);
  return el("button", {
    clase: "chico" + (pagada ? " marcado-contado" : ""),
    title: pagada
      ? `Pagada el ${fechaCorta(compra.pagadaEl)}. Tóquela para quitarle la marca.`
      : "Marcarla como pagada hoy",
    alHacerClic: () => {
      // Se guarda la FECHA y no un sí/no: con un sí se sabe que se pagó pero
      // no cuándo, y a fin de mes no hay cómo cuadrarlo contra el banco.
      ponerPagada(compra, pagada ? null : hoyISO());
      cambio();
      repintar();
      mensaje(pagada
        ? `La factura ${compra.factura} quedó otra vez como SIN pagar.`
        : `Factura ${compra.factura} de ${compra.proveedor}: pagada hoy.`, "bien", 4);
    },
  }, pagada ? "Pagada " + fechaCorta(compra.pagadaEl) : "Sin pagar");
}

/**
 * "Estos dos se parecen: puede ser el mismo proveedor."
 *
 * No los une: unir mueve plata de una cuenta a otra y pueden ser de verdad dos
 * empresas parecidas. Solo lo pone donde ella lo va a ver justo antes de girar.
 */
function avisoDeParecidos() {
  const pares = proveedoresParecidos(estado.datos.compras);
  if (!pares.length) return null;

  return el("div", { clase: "aviso-ojo" },
    el("p", { estilo: "margin:0 0 var(--e2)" },
      el("strong", { texto: "Ojo: hay proveedores escritos de dos formas. " }),
      "Si son el mismo, le va a girar dos veces."),
    el("ul", { clase: "avisos", estilo: "max-height:none" },
      ...pares.slice(0, 6).map((p) =>
        el("li", {},
          el("strong", { texto: p.a }), " y ", el("strong", { texto: p.b }),
          el("span", { clase: "nota", texto: " — " + p.razon }))),
      pares.length > 6
        ? el("li", { clase: "nota", texto: `…y ${pares.length - 6} más` })
        : null
    )
  );
}
