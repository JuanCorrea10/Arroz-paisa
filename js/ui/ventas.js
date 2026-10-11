// ============================================================================
//  ventas.js  -  "¿Cuántos almuerzos vendí?"
//
//  La pregunta más obvia del negocio, y hasta ahora no se podía contestar:
//
//    Cocina        dice cuánto preparar HOY, y no habla de plata.
//    Resumen día   es de UN día y de UNA empresa.
//    Por persona   es de una persona.
//    Cuenta cobro  es de una quincena y solo de lo que paga la empresa.
//
//  Para saber cuánto se vendió en una semana había que abrir Cocina siete
//  veces y sumar a mano. Eso es exactamente lo que hacía el Excel viejo.
//
//  La pantalla está armada para alguien que NO explora: los tres números que
//  se preguntan todos los días -- hoy, esta semana, este mes -- salen arriba
//  sin tocar nada. Los botones de abajo son para lo demás.
// ============================================================================

import { el, vaciar, tabla, cifra, cifraPlata, acciones, vacio, poner } from "./componentes.js";
import { estado, empresas, empresaPorCodigo } from "./estado.js";
import {
  pesos, fechaLarga, fechaCorta, hoyISO, sumarDias, lunesDeLaSemana, elMesDe,
} from "../nucleo/formato.js";
import { ventasEnRango, loPagaLaEmpresa, yaLoPago } from "../nucleo/calculos.js";

// El rango que se está mirando y la empresa. Viven aquí y no en estado.js
// porque son de esta pantalla: cambiarlos no puede moverle el día a Registrar.
let rango = null;
let empresaVentas = "";

// Qué ventas se están mirando según cómo se pagaron. "" es todo.
//
// Lo de contado ES una venta -- el plato salió y la plata entró a la caja --
// así que la pantalla arranca mostrando todo, y eso no cambia. Pero ella se
// hace otra pregunta igual de legítima: "¿cuánto le voy a cobrar a las
// empresas?". Para eso está este filtro: con él puesto, TODA la pantalla --
// las tres tarjetas de arriba, el total grande y las dos tablas -- contesta
// esa pregunta y lo dice, en vez de mezclar las dos sin avisar.
let comoSePago = "";

const COMO_SE_PAGO = {
  "": { nombre: "Todo lo vendido", corto: "", explica: "A crédito y de contado, junto" },
  empresa: { nombre: "Solo a crédito", corto: "solo a crédito",
             explica: "Lo que se le cobra a las empresas en la cuenta de cobro" },
  contado: { nombre: "Solo efectivo", corto: "solo efectivo",
             explica: "Lo pagado en efectivo, que ingresó a la caja" },
};

/** Los renglones que cuentan para lo que ella escogió mirar. */
function losQueCuentan() {
  const todos = estado.datos.consumos;
  if (comoSePago === "empresa") return todos.filter(loPagaLaEmpresa);
  if (comoSePago === "contado") return todos.filter(yaLoPago);
  return todos;
}

/** Los atajos. Cada uno dice de qué día a qué día va. */
function atajos() {
  const hoy = hoyISO();
  const mes = elMesDe(hoy);
  const mesPasado = elMesDe(sumarDias(mes.desde, -1));
  return [
    { nombre: "Hoy", desde: hoy, hasta: hoy },
    { nombre: "Esta semana", desde: lunesDeLaSemana(hoy), hasta: hoy },
    { nombre: "Este mes", desde: mes.desde, hasta: hoy },
    { nombre: "El mes pasado", desde: mesPasado.desde, hasta: mesPasado.hasta },
  ];
}

/** El último día que tiene algo anotado. Null si no hay nada. */
function ultimoDiaConVenta() {
  let ultimo = null;
  for (const c of estado.datos.consumos) {
    if (c.fecha && (!ultimo || c.fecha > ultimo)) ultimo = c.fecha;
  }
  return ultimo;
}

/**
 * De qué día a qué día se está mirando, y por qué.
 *
 * Arranca en el mes corrido, que es lo que más se pregunta. Pero si en este
 * mes todavía no hay nada anotado -- el día 1 a las seis de la mañana, o
 * cuando lleva días sin registrar -- abrir en ceros haría creer que la app se
 * dañó o que se perdieron los datos. En ese caso se muestra el último mes que
 * SÍ tuvo movimiento, y se dice en la pantalla que eso fue lo que pasó.
 * Mostrarlo sin avisar sería peor: estaría leyendo agosto creyendo que es
 * septiembre.
 */
function rangoActual() {
  if (rango && rango.desde && rango.hasta) return rango;

  const hoy = hoyISO();
  const mes = elMesDe(hoy);
  const deEsteMes = { desde: mes.desde, hasta: hoy };

  const hayEsteMes = estado.datos.consumos.some(
    (c) => c.fecha && c.fecha >= deEsteMes.desde && c.fecha <= deEsteMes.hasta);
  if (hayEsteMes) return deEsteMes;

  const ultimo = ultimoDiaConVenta();
  if (!ultimo) return deEsteMes;

  const otroMes = elMesDe(ultimo);
  return { desde: otroMes.desde, hasta: otroMes.hasta, porqueNoHayDeEsteMes: true };
}

/** Cómo se lee el rango en voz alta: "del 1 al 10 de septiembre". */
function comoSeLee({ desde, hasta }) {
  if (desde === hasta) return "El " + fechaLarga(desde);
  return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

export function pintarVentas(raiz) {
  vaciar(raiz);
  const repintar = () => pintarVentas(raiz);
  const hoy = hoyISO();
  const cual = rangoActual();
  const codigo = empresaVentas || null;

  const venta = ventasEnRango(losQueCuentan(), cual.desde, cual.hasta, codigo);
  const filtro = COMO_SE_PAGO[comoSePago] || COMO_SE_PAGO[""];

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuánto vendí" }),
        el("p", { texto: comoSePago
          ? `${filtro.nombre}: ${filtro.explica.toLowerCase()}. Para ver todo, cambie "Cómo se pagó".`
          : "Cuántos platos salieron y cuánta plata entró, entre dos días." })
      ),
      acciones(el("button", { clase: "chico", alHacerClic: () => window.print() }, "Imprimir"))
    ),
    tarjetasDeSiempre(),
    mando(repintar, hoy)
  );

  poner(raiz,
    el("div", { clase: "documento" },
      el("div", { clase: "fila entre" },
        el("h2", { texto: comoSeLee(cual) }),
        el("span", { clase: "comanda-total", texto: pesos(venta.total.plata) })
      ),
      el("p", { clase: "nota", estilo: "margin:var(--e2) 0 var(--e4)" },
        [
          empresaVentas ? empresaVentas : "Todas las empresas",
          // Con el filtro puesto se dice AQUÍ, pegado al total: este papel se
          // imprime, y un total que no dice qué incluye se lee como el total.
          comoSePago ? filtro.nombre.toLowerCase() : null,
          `${venta.total.diasConVenta} ${venta.total.diasConVenta === 1 ? "día" : "días"} con venta`,
          `${venta.total.facturas} facturas`,
        ].filter(Boolean).join(" · ")),

      // Por qué está viendo otro mes. Sin esto estaría leyendo agosto creyendo
      // que es septiembre, que es peor que ver la pantalla en ceros.
      cual.porqueNoHayDeEsteMes
        ? el("p", { clase: "aviso-ojo" },
            el("strong", { texto: "Atención: esto NO es de este mes. " }),
            "En lo que va de ", fechaLarga(hoyISO()).replace(/^\w+ \d+ de /, ""),
            " todavía no hay nada anotado, así que le estoy mostrando el último mes con ventas.")
        : null,

      // Platos que salieron y no sumaron plata porque el renglón se quedó sin
      // precio. Callarlo dejaría el total corto sin que nada lo dijera.
      venta.total.sinPrecio
        ? el("p", { clase: "aviso-ojo" },
            el("strong", { texto: `Atención: ${venta.total.sinPrecio} ` +
              (venta.total.sinPrecio === 1 ? "plato salió" : "platos salieron") + " sin precio. " }),
            "No están sumando, así que lo vendido es más de lo que dice aquí. ",
            el("a", { href: "#revisar", texto: "Póngales precio en Revisar" }), ".")
        : null,

      el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
        cifra("Platos vendidos", String(venta.total.vendidos), true),
        cifraPlata(comoSePago === "empresa" ? "Se le cobra a las empresas"
                 : comoSePago === "contado" ? "Pagado en efectivo (caja)"
                 : "Plata de esas ventas", venta.total.plata, true),
        // El desglose solo tiene sentido viendo todo: filtrado, una de las dos
        // sería el total repetido y la otra un cero.
        comoSePago ? null : cifraPlata("Se le cobra a las empresas", venta.total.aCredito),
        comoSePago ? null : cifraPlata("Pagado en efectivo (caja)", venta.total.deContado),
        // Las cortesías solo se nombran si las hubo. Un "0 cortesías" fijo es
        // un número más que leer todos los días para nada.
        venta.total.cortesias
          ? cifra("Regalados (cortesía)", String(venta.total.cortesias))
          : null
      ),

      venta.filas.length
        ? el("div", {},
            el("h3", { estilo: "margin:var(--e5) 0 var(--e3)", texto: "Qué se vendió" }),
            tablaDeGrupos(venta),
            el("h3", { estilo: "margin:var(--e6) 0 var(--e3)", texto: "Día por día" }),
            tablaDeDias(venta))
        : vacio(
            "No se vendió nada en esos días",
            el("p", {}, "Pruebe con otro rango, o revise que los pedidos estén anotados en ",
              el("a", { href: "#registrar", texto: "Registrar el día" }), "."))
    )
  );
}

/**
 * Los tres números de todos los días, arriba y sin tocar nada.
 *
 * Ella no explora: si "cuántos vendí hoy" estuviera detrás de un botón, para
 * ella no existiría. Estos tres salen solos y no dependen del rango de abajo.
 */
function tarjetasDeSiempre() {
  const hoy = hoyISO();
  const mes = elMesDe(hoy);
  const cuales = [
    { nombre: "Hoy", desde: hoy, hasta: hoy, pie: fechaLarga(hoy) },
    { nombre: "Esta semana", desde: lunesDeLaSemana(hoy), hasta: hoy,
      pie: `desde el lunes ${fechaCorta(lunesDeLaSemana(hoy))}` },
    { nombre: "Este mes", desde: mes.desde, hasta: hoy,
      pie: `desde el ${fechaCorta(mes.desde)}` },
  ];

  // Con el filtro puesto, estas tres también: si "Hoy" dijera todo y el total
  // de abajo dijera solo crédito, serían dos definiciones de venta en la
  // misma pantalla y ella no sabría a cuál creerle.
  const filtro = COMO_SE_PAGO[comoSePago] || COMO_SE_PAGO[""];
  return el("div", { clase: "ventas-rapidas" },
    ...cuales.map((c) => {
      const v = ventasEnRango(losQueCuentan(), c.desde, c.hasta, empresaVentas || null);
      return el("article", { clase: "venta-rapida" },
        el("h3", { texto: c.nombre + (filtro.corto ? ` · ${filtro.corto}` : "") }),
        el("p", { clase: "venta-rapida-platos" },
          el("strong", { texto: String(v.total.vendidos) }),
          v.total.vendidos === 1 ? " plato" : " platos"),
        el("p", { clase: "venta-rapida-plata plata", texto: pesos(v.total.plata) }),
        el("p", { clase: "venta-rapida-pie", texto: c.pie })
      );
    })
  );
}

function mando(repintar, hoy) {
  const cual = rangoActual();

  const desde = el("input", {
    type: "date", id: "ventas-desde", value: cual.desde, max: hoy,
    alCambiar: (e) => {
      rango = { ...rangoActual(), desde: e.target.value || cual.desde };
      // Si el "desde" se pasa del "hasta", el rango quedaría al revés y
      // saldría todo en cero sin decir por qué. Se corre el otro extremo.
      if (rango.desde > rango.hasta) rango.hasta = rango.desde;
      repintar();
    },
  });

  const hasta = el("input", {
    type: "date", id: "ventas-hasta", value: cual.hasta,
    alCambiar: (e) => {
      rango = { ...rangoActual(), hasta: e.target.value || cual.hasta };
      if (rango.hasta < rango.desde) rango.desde = rango.hasta;
      repintar();
    },
  });

  const empresa = el("select", {
    id: "ventas-empresa",
    alCambiar: (e) => { empresaVentas = e.target.value; repintar(); },
  },
    el("option", { value: "", selected: !empresaVentas }, "Todas las empresas"),
    ...empresas().map((emp) =>
      el("option", { value: emp.codigo, selected: emp.codigo === empresaVentas }, emp.codigo))
  );

  const pago = el("select", {
    id: "ventas-pago",
    alCambiar: (e) => { comoSePago = e.target.value; repintar(); },
  },
    ...Object.entries(COMO_SE_PAGO).map(([valor, o]) =>
      el("option", { value: valor, selected: valor === comoSePago }, o.nombre))
  );

  return el("div", { clase: "mando" },
    el("div", { clase: "campo" },
      el("label", { for: "ventas-desde", texto: "Desde" }), desde),
    el("div", { clase: "campo" },
      el("label", { for: "ventas-hasta", texto: "Hasta" }), hasta),
    el("div", { clase: "campo" },
      el("label", { for: "ventas-empresa", texto: "Empresa" }),
      empresa,
      el("small", { estilo: "color:var(--tinta-suave)",
        texto: (empresaPorCodigo(empresaVentas) || {}).razonSocial || "Sirve para ver todo junto" })),
    el("div", { clase: "campo" },
      el("label", { for: "ventas-pago", texto: "Cómo se pagó" }),
      pago,
      el("small", { estilo: "color:var(--tinta-suave)",
        texto: (COMO_SE_PAGO[comoSePago] || COMO_SE_PAGO[""]).explica })),
    el("div", { clase: "campo" },
      el("label", { texto: "O elija directamente" }),
      el("div", { clase: "atajos-rango" },
        ...atajos().map((a) =>
          el("button", {
            clase: "chico" + (a.desde === cual.desde && a.hasta === cual.hasta ? " principal" : ""),
            alHacerClic: () => { rango = { desde: a.desde, hasta: a.hasta }; repintar(); },
          }, a.nombre))))
  );
}

/**
 * Qué se vendió: dos renglones, no setenta y siete.
 *
 * Antes era un renglón por plato. Con setenta y siete platos en el catálogo
 * eso es una lista que hay que leerse entera para contestar la única
 * pregunta que ella se hace: cuánto dieron los almuerzos y cuánto todo lo
 * demás. La lista larga no contestaba eso, había que sumarla con el dedo.
 *
 * La raya entre los dos grupos la traza el núcleo, no esta pantalla: así
 * "Cuánto vendí" y "Ventas del mes" no pueden terminar partiendo distinto.
 */
function tablaDeGrupos(venta) {
  const hayCortesias = venta.grupos.some((g) => g.cortesias);

  return tabla(
    [
      { titulo: "" },
      { titulo: "Vendidos", clase: "n" },
      ...(hayCortesias ? [{ titulo: "Regalados", clase: "n" }] : []),
      { titulo: "Plata", clase: "n" },
    ],
    venta.grupos.map((g) =>
      el("tr", {},
        el("td", {},
          el("strong", { texto: g.titulo }),
          // Cuántas clases de plato hay ahí dentro, para que "otros platos"
          // no se lea como una caja negra. Es el dato, no la lista.
          g.grupo === "otros" && g.cuantosPlatos
            ? el("div", { clase: "apunte",
                texto: `${g.cuantosPlatos} ${g.cuantosPlatos === 1 ? "clase" : "clases"} de plato` })
            : null
        ),
        el("td", { clase: "n cant", estilo: "font-size:1.15em", texto: String(g.vendidos) }),
        ...(hayCortesias
          ? [el("td", { clase: "n cant", texto: g.cortesias ? String(g.cortesias) : "·" })]
          : []),
        el("td", { clase: "n", texto: pesos(g.plata) })
      )
    ),
    el("tr", {},
      el("td", { texto: "TOTAL" }),
      el("td", { clase: "n cant", texto: String(venta.total.vendidos) }),
      ...(hayCortesias ? [el("td", { clase: "n cant", texto: String(venta.total.cortesias) })] : []),
      el("td", { clase: "n", texto: pesos(venta.total.plata) })
    )
  );
}

/**
 * Día por día, partido en los mismos dos grupos que la tabla de arriba.
 *
 * Decía "Platos: 40" y ya. Ese 40 no contesta nada: cuarenta platos pueden
 * ser treinta almuerzos y diez gaseosas, o al revés, y son dos días muy
 * distintos para la cocina y para la caja.
 */
function tablaDeDias(venta) {
  const deLosDos = (cual) => venta.grupos.find((g) => g.grupo === cual);

  return tabla(
    [{ titulo: "Día" },
     { titulo: "Almuerzos", clase: "n" },
     { titulo: "Otros", clase: "n" },
     { titulo: "Facturas", clase: "n" },
     { titulo: "Plata", clase: "n" }],
    venta.dias.map((d) =>
      el("tr", {},
        el("td", { texto: fechaLarga(d.fecha) }),
        el("td", { clase: "n cant", estilo: "font-size:1.15em", texto: String(d.almuerzos.vendidos) }),
        el("td", { clase: "n cant", texto: String(d.otros.vendidos) }),
        el("td", { clase: "n", texto: String(d.facturas) }),
        el("td", { clase: "n", texto: pesos(d.plata) })
      )
    ),
    el("tr", {},
      el("td", { texto: `TOTAL · ${venta.total.diasConVenta} días` }),
      el("td", { clase: "n cant", texto: String(deLosDos("almuerzos").vendidos) }),
      el("td", { clase: "n cant", texto: String(deLosDos("otros").vendidos) }),
      el("td", { clase: "n", texto: String(venta.total.facturas) }),
      el("td", { clase: "n", texto: pesos(venta.total.plata) })
    )
  );
}
