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
import { ventasEnRango } from "../nucleo/calculos.js";

// El rango que se está mirando y la empresa. Viven aquí y no en estado.js
// porque son de esta pantalla: cambiarlos no puede moverle el día a Registrar.
let rango = null;
let empresaVentas = "";

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

  const venta = ventasEnRango(estado.datos.consumos, cual.desde, cual.hasta, codigo);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cuánto vendí" }),
        el("p", { texto: "Cuántos platos salieron y cuánta plata entró, entre dos días." })
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
          `${venta.total.diasConVenta} ${venta.total.diasConVenta === 1 ? "día" : "días"} con venta`,
          `${venta.total.facturas} facturas`,
        ].join(" · ")),

      // Por qué está viendo otro mes. Sin esto estaría leyendo agosto creyendo
      // que es septiembre, que es peor que ver la pantalla en ceros.
      cual.porqueNoHayDeEsteMes
        ? el("p", { clase: "aviso-ojo" },
            el("strong", { texto: "Ojo: esto NO es de este mes. " }),
            "En lo que va de ", fechaLarga(hoyISO()).replace(/^\w+ \d+ de /, ""),
            " todavía no hay nada anotado, así que le estoy mostrando el último mes con ventas.")
        : null,

      // Platos que salieron y no sumaron plata porque el renglón se quedó sin
      // precio. Callarlo dejaría el total corto sin que nada lo dijera.
      venta.total.sinPrecio
        ? el("p", { clase: "aviso-ojo" },
            el("strong", { texto: `Ojo: ${venta.total.sinPrecio} ` +
              (venta.total.sinPrecio === 1 ? "plato salió" : "platos salieron") + " sin precio. " }),
            "No están sumando, así que lo vendido es más de lo que dice aquí. ",
            el("a", { href: "#revisar", texto: "Póngales precio en Revisar" }), ".")
        : null,

      el("dl", { clase: "cifras", estilo: "margin-bottom:var(--e5)" },
        cifra("Platos vendidos", String(venta.total.vendidos), true),
        cifraPlata("Plata de esas ventas", venta.total.plata, true),
        cifraPlata("Se le cobra a las empresas", venta.total.aCredito),
        cifraPlata("Pagaron de una (caja)", venta.total.deContado),
        // Las cortesías solo se nombran si las hubo. Un "0 cortesías" fijo es
        // un número más que leer todos los días para nada.
        venta.total.cortesias
          ? cifra("Regalados (cortesía)", String(venta.total.cortesias))
          : null
      ),

      venta.filas.length
        ? el("div", {},
            el("h3", { estilo: "margin:var(--e5) 0 var(--e3)", texto: "Qué se vendió" }),
            tablaDePlatos(venta),
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

  return el("div", { clase: "ventas-rapidas" },
    ...cuales.map((c) => {
      const v = ventasEnRango(estado.datos.consumos, c.desde, c.hasta, empresaVentas || null);
      return el("article", { clase: "venta-rapida" },
        el("h3", { texto: c.nombre }),
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
      el("label", { texto: "O elija de una" }),
      el("div", { clase: "atajos-rango" },
        ...atajos().map((a) =>
          el("button", {
            clase: "chico" + (a.desde === cual.desde && a.hasta === cual.hasta ? " principal" : ""),
            alHacerClic: () => { rango = { desde: a.desde, hasta: a.hasta }; repintar(); },
          }, a.nombre))))
  );
}

function tablaDePlatos(venta) {
  const hayCortesias = venta.filas.some((f) => f.cortesias);
  return tabla(
    [
      { titulo: "Plato" },
      { titulo: "Vendidos", clase: "n" },
      ...(hayCortesias ? [{ titulo: "Regalados", clase: "n" }] : []),
      { titulo: "Plata", clase: "n" },
    ],
    venta.filas.map((f) =>
      el("tr", {},
        el("td", { texto: f.producto }),
        el("td", { clase: "n cant", estilo: "font-size:1.15em", texto: String(f.vendidos) }),
        ...(hayCortesias
          ? [el("td", { clase: "n cant", texto: f.cortesias ? String(f.cortesias) : "·" })]
          : []),
        el("td", { clase: "n", texto: pesos(f.plata) })
      )
    ),
    el("tr", {},
      el("td", { texto: `TOTAL · ${venta.filas.length} platos distintos` }),
      el("td", { clase: "n cant", texto: String(venta.total.vendidos) }),
      ...(hayCortesias ? [el("td", { clase: "n cant", texto: String(venta.total.cortesias) })] : []),
      el("td", { clase: "n", texto: pesos(venta.total.plata) })
    )
  );
}

function tablaDeDias(venta) {
  return tabla(
    [{ titulo: "Día" }, { titulo: "Platos", clase: "n" },
     { titulo: "Facturas", clase: "n" }, { titulo: "Plata", clase: "n" }],
    venta.dias.map((d) =>
      el("tr", {},
        el("td", { texto: fechaLarga(d.fecha) }),
        el("td", { clase: "n cant", estilo: "font-size:1.15em", texto: String(d.vendidos) }),
        el("td", { clase: "n", texto: String(d.facturas) }),
        el("td", { clase: "n", texto: pesos(d.plata) })
      )
    ),
    el("tr", {},
      el("td", { texto: `TOTAL · ${venta.total.diasConVenta} días` }),
      el("td", { clase: "n cant", texto: String(venta.total.vendidos) }),
      el("td", { clase: "n", texto: String(venta.total.facturas) }),
      el("td", { clase: "n", texto: pesos(venta.total.plata) })
    )
  );
}
