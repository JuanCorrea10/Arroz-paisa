// ============================================================================
//  cobro.test.mjs
//
//  Las tres formas de pagar un pedido. Esto es lo más delicado de toda la app,
//  porque los dos errores posibles son de plata y ninguno se ve:
//
//    - Si lo de contado se cuela en la cuenta de cobro, la empresa paga un
//      almuerzo que la persona ya pagó. Cobrado dos veces.
//    - Si lo de contado no cuenta como venta, el día aparece vendiendo menos
//      de lo que vendió y la caja no cuadra.
//
//  Ninguno de los dos da error en pantalla. Por eso van aquí.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  A_CREDITO, DE_CONTADO, CORTESIA,
  formaDeCobro, loPagaLaEmpresa, yaLoPago, esCortesia,
  subtotal, sumar, sumarLoDeLaEmpresa, sumarLoDeContado,
  cuentaDeCobro, informeDia, informePorPersona, informeCompletoDeEmpresa,
  indicePorCodigo, deRango, rangoDeCobro, ponerRangoDeCobro, historialDePersona,
  precioDe,
} from "../js/nucleo/calculos.js";
import { ponerlePrecio } from "../js/nucleo/modelo.js";

const PRECIO = 12000;

function renglon(cobro, extra = {}) {
  return {
    fecha: "2026-08-05",
    empresa: "MGP",
    persona: "JUAN GOMEZ",
    producto: "ALMUERZO",
    precioUnitario: PRECIO,
    cantidad: 1,
    cobro,
    ...extra,
  };
}

function negocio(consumos) {
  return {
    empresas: [{ codigo: "MGP", razonSocial: "Metalúrgica MGP", ultimoDiaQ1: 15 }],
    personas: [
      { nombre: "JUAN GOMEZ", empresa: "MGP" },
      { nombre: "ANA RUIZ", empresa: "MGP" },
    ],
    productos: [{ nombre: "ALMUERZO" }],
    precios: {},
    config: { acreedor: { nombre: "Arroz Paisa" } },
    consumos,
  };
}

// ---------------------------------------------------------------------------
grupo("Formas de cobro: leer bien lo viejo y lo nuevo");

prueba("un renglón sin el campo es a crédito, como siempre", () => {
  igual(formaDeCobro({ producto: "ALMUERZO" }), A_CREDITO);
  cierto(loPagaLaEmpresa({ producto: "ALMUERZO" }));
});

prueba("los renglones viejos con facturable:false son cortesía", () => {
  // Así quedaron guardados los 1135 renglones de antes. Se leen aquí y no se
  // convierte nada en el archivo: convertir 1135 renglones es una oportunidad
  // de dañarlos, leerlos bien no lo es.
  const viejo = { producto: "ALMUERZO", facturable: false };
  igual(formaDeCobro(viejo), CORTESIA);
  cierto(esCortesia(viejo));
  igual(subtotal({ ...viejo, cantidad: 1, precioUnitario: PRECIO }), 0);
});

prueba("un renglón viejo normal sigue siendo a crédito", () => {
  igual(formaDeCobro({ producto: "ALMUERZO", facturable: true }), A_CREDITO);
});

prueba("una basura en el campo no se cree: cae en a crédito", () => {
  // Si mañana alguien edita el archivo a mano y escribe cualquier cosa, lo
  // seguro es tratarlo como crédito: sale en la cuenta y ella lo ve. Tratarlo
  // como pagado lo haría desaparecer sin que nadie se entere.
  igual(formaDeCobro({ cobro: "loquesea" }), A_CREDITO);
  igual(formaDeCobro({ cobro: null }), A_CREDITO);
});

// ---------------------------------------------------------------------------
grupo("Cobro: lo de contado vale, la cortesía no");

prueba("de contado SÍ es una venta", () => {
  igual(subtotal(renglon(DE_CONTADO)), PRECIO);
  cierto(yaLoPago(renglon(DE_CONTADO)));
  cierto(!loPagaLaEmpresa(renglon(DE_CONTADO)));
});

prueba("la cortesía no vale nada", () => {
  igual(subtotal(renglon(CORTESIA)), 0);
  cierto(!loPagaLaEmpresa(renglon(CORTESIA)));
  cierto(!yaLoPago(renglon(CORTESIA)));
});

prueba("las tres sumas dicen cosas distintas", () => {
  const lista = [renglon(A_CREDITO), renglon(DE_CONTADO), renglon(CORTESIA)];
  igual(sumar(lista), PRECIO * 2, "vendido: crédito + contado");
  igual(sumarLoDeLaEmpresa(lista), PRECIO, "la empresa solo paga lo suyo");
  igual(sumarLoDeContado(lista), PRECIO, "en la caja tiene que estar esto");
  igual(sumarLoDeLaEmpresa(lista) + sumarLoDeContado(lista), sumar(lista),
        "crédito + contado tiene que dar lo vendido");
});

// ---------------------------------------------------------------------------
grupo("Cobro: que no se cobre dos veces");

prueba("lo pagado de contado NO entra en la cuenta de cobro", () => {
  const datos = negocio([renglon(A_CREDITO), renglon(DE_CONTADO)]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);

  // Este es EL error que hay que evitar: si diera 24.000, la empresa estaría
  // pagando el almuerzo que la persona ya pagó en la caja.
  igual(cuenta.total, PRECIO, "la empresa solo puede pagar lo de crédito");
  igual(cuenta.filas.reduce((a, f) => a + f.cantidad, 0), 1,
        "el plato pagado de contado no puede aparecer en la cuenta");
});

prueba("la cortesía tampoco entra en la cuenta de cobro", () => {
  const datos = negocio([renglon(A_CREDITO), renglon(CORTESIA)]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  igual(cuenta.total, PRECIO);
});

prueba("una cuenta de solo pedidos de contado da cero", () => {
  const datos = negocio([renglon(DE_CONTADO), renglon(DE_CONTADO)]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  igual(cuenta.total, 0);
  igual(cuenta.filas.length, 0);
});

// ---------------------------------------------------------------------------
grupo("La cuenta de cobro va por PERSONA, que es como la pide el cliente");

prueba("cada persona sale una vez, con todo lo suyo junto", () => {
  const datos = negocio([
    renglon(A_CREDITO),
    renglon(A_CREDITO, { producto: "GASEOSA", precioUnitario: 7000 }),
    renglon(A_CREDITO, { persona: "ANA RUIZ" }),
  ]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);

  igual(cuenta.personas.length, 2, "dos personas, aunque JUAN haya pedido dos cosas");
  igual(cuenta.personas.map((p) => p.persona), ["ANA RUIZ", "JUAN GOMEZ"], "por nombre");
  igual(cuenta.personas[1].total, PRECIO + 7000, "a JUAN se le suma todo lo suyo");
  igual(cuenta.personas[1].facturas, 1, "las dos cosas del mismo día son UNA factura");
});

prueba("lo de la gente suma exactamente el total de la cuenta", () => {
  // Si esto no cuadra, el papel dice un total y los renglones dicen otro:
  // el contador de la fábrica lo suma a mano y devuelve la cuenta.
  const datos = negocio([
    renglon(A_CREDITO),
    renglon(DE_CONTADO, { persona: "ANA RUIZ" }),
    renglon(A_CREDITO, { persona: "ANA RUIZ", producto: "GASEOSA", precioUnitario: 7000 }),
  ]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  igual(cuenta.personas.reduce((a, p) => a + p.total, 0), cuenta.total);
});

prueba("quien solo pagó de contado NO sale en la cuenta", () => {
  const datos = negocio([renglon(A_CREDITO), renglon(DE_CONTADO, { persona: "ANA RUIZ" })]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  igual(cuenta.personas.map((p) => p.persona), ["JUAN GOMEZ"],
        "ANA ya pagó en la caja: cobrarle a la empresa sería cobrar dos veces");
});

prueba("cada persona trae lo que pidió, junto por plato", () => {
  // Es lo que contesta "yo no pedí eso" sin salirse del papel.
  const datos = negocio([
    renglon(A_CREDITO, { fecha: "2026-08-03" }),
    renglon(A_CREDITO, { fecha: "2026-08-05" }),
    renglon(A_CREDITO, { fecha: "2026-08-05", producto: "GASEOSA", precioUnitario: 7000 }),
  ]);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  const juan = cuenta.personas[0];

  igual(juan.platos.length, 2, "dos platos distintos, no tres renglones");
  igual(juan.platos[0], { producto: "ALMUERZO", cantidad: 2, total: PRECIO * 2 },
        "los dos almuerzos de días distintos van juntos");
  igual(juan.platos[1], { producto: "GASEOSA", cantidad: 1, total: 7000 });
});

prueba("lo que pidió suma exactamente lo que debe", () => {
  // Si no cuadra, el papel se contradice a sí mismo en el mismo renglón.
  const datos = negocio([
    renglon(A_CREDITO, { cantidad: 3 }),
    renglon(A_CREDITO, { producto: "GASEOSA", precioUnitario: 7000, cantidad: 2 }),
  ]);
  const p = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]).personas[0];
  igual(p.platos.reduce((a, x) => a + x.total, 0), p.total);
});

prueba("lo que se pagó de contado no aparece en lo que pidió", () => {
  // Coherente con el total: si el renglón no se le cobra a la empresa, tampoco
  // puede figurar en el papel que dice qué se le está cobrando.
  const datos = negocio([
    renglon(A_CREDITO),
    renglon(DE_CONTADO, { producto: "GASEOSA", precioUnitario: 7000 }),
  ]);
  const p = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]).personas[0];
  igual(p.platos.map((x) => x.producto), ["ALMUERZO"]);
});

prueba("de lo que más pidió a lo que menos", () => {
  const datos = negocio([
    renglon(A_CREDITO, { producto: "GASEOSA", precioUnitario: 7000 }),
    renglon(A_CREDITO, { cantidad: 5 }),
  ]);
  const p = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]).personas[0];
  igual(p.platos.map((x) => x.producto), ["ALMUERZO", "GASEOSA"],
        "primero lo que más pidió: es lo que se mira para cuadrar los días");
});

// ---------------------------------------------------------------------------
grupo("Una cuenta de cobro puede cubrir los días que ella escoja");

const TRES_DIAS = [
  renglon(A_CREDITO, { fecha: "2026-08-02" }),
  renglon(A_CREDITO, { fecha: "2026-08-05", persona: "ANA RUIZ" }),
  renglon(A_CREDITO, { fecha: "2026-08-09" }),
];

prueba("sin rango escogido, la cuenta es la quincena entera", () => {
  const datos = negocio(TRES_DIAS);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0]);
  igual(cuenta.total, PRECIO * 3);
  igual(cuenta.rangoEscogido, false);
  igual(cuenta.rango, { desde: 1, hasta: 15 });
});

prueba("con rango escogido, la cuenta lleva SOLO esos días", () => {
  const datos = negocio(TRES_DIAS);
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0], null,
                               { desde: 3, hasta: 6 });
  igual(cuenta.total, PRECIO, "solo el del 5");
  igual(cuenta.personas.map((p) => p.persona), ["ANA RUIZ"]);
  igual(cuenta.rango, { desde: 3, hasta: 6 });
  cierto(cuenta.rangoEscogido, "y se sabe que los días los escogió ella");
});

prueba("el rango escogido puede pasarse del corte de la quincena", () => {
  // El día 20 es quincena 2 para esta empresa (corta el 15). Si ella escoge
  // "del 1 al 31", la cuenta tiene que llevarlo igual: mandan los días, no la
  // quincena.
  const datos = negocio(TRES_DIAS.concat([renglon(A_CREDITO, { fecha: "2026-08-20" })]));
  const cuenta = cuentaDeCobro(datos.consumos, 2026, 8, 1, datos.empresas[0], null,
                               { desde: 1, hasta: 31 });
  igual(cuenta.total, PRECIO * 4, "el mes completo en una sola cuenta");
});

prueba("deRango no se lleva lo de otra empresa", () => {
  const datos = negocio(TRES_DIAS.concat([renglon(A_CREDITO, { fecha: "2026-08-05", empresa: "OTRA" })]));
  igual(deRango(datos.consumos, 2026, 8, { desde: 1, hasta: 31 }, datos.empresas[0]).length, 3);
});

// ---------------------------------------------------------------------------
grupo("Los días de una cuenta se guardan sin tocarle la regla a la empresa");

prueba("se guarda y se lee por empresa, mes y quincena", () => {
  const datos = negocio([]);
  igual(rangoDeCobro(datos, "MGP", 2026, 8, 1), null, "sin nada guardado, manda la quincena");

  ponerRangoDeCobro(datos, "MGP", 2026, 8, 1, { desde: 3, hasta: 14 });
  igual(rangoDeCobro(datos, "MGP", 2026, 8, 1), { desde: 3, hasta: 14 });
  igual(rangoDeCobro(datos, "MGP", 2026, 8, 2), null, "la otra quincena no se contagia");
  igual(rangoDeCobro(datos, "MGP", 2026, 9, 1), null, "ni el otro mes");
  igual(datos.empresas[0].ultimoDiaQ1, 15, "y a la empresa no se le tocó nada");
});

prueba("un rango imposible no se guarda: borra el que hubiera", () => {
  const datos = negocio([]);
  ponerRangoDeCobro(datos, "MGP", 2026, 8, 1, { desde: 3, hasta: 14 });
  ponerRangoDeCobro(datos, "MGP", 2026, 8, 1, { desde: 20, hasta: 4 });
  igual(rangoDeCobro(datos, "MGP", 2026, 8, 1), null, "al revés no vale");

  ponerRangoDeCobro(datos, "MGP", 2026, 8, 1, { desde: 1, hasta: 40 });
  igual(rangoDeCobro(datos, "MGP", 2026, 8, 1), null, "agosto no tiene 40 días");
});

// ---------------------------------------------------------------------------
grupo("El historial de una persona");

const HISTORIA = [
  renglon(A_CREDITO, { fecha: "2026-08-03" }),
  renglon(A_CREDITO, { fecha: "2026-08-10" }),
  renglon(A_CREDITO, { fecha: "2026-08-10", producto: "GASEOSA", precioUnitario: 7000 }),
  renglon(A_CREDITO, { fecha: "2026-08-21", cantidad: 2 }),
];

prueba("va del día más nuevo al más viejo", () => {
  const h = historialDePersona(HISTORIA, "MGP", "JUAN GOMEZ");
  igual(h.dias.map((d) => d.fecha), ["2026-08-21", "2026-08-10", "2026-08-03"]);
  igual(h.desde, "2026-08-03");
  igual(h.hasta, "2026-08-21");
});

prueba('"veces" son días que comió, no renglones', () => {
  // El 10 pidió almuerzo Y gaseosa. Eso es UNA comida, no dos: si esto contara
  // renglones, el papel diría que comió cuatro veces y son tres.
  const h = historialDePersona(HISTORIA, "MGP", "JUAN GOMEZ");
  igual(h.veces, 3, "tres días");
  igual(h.renglones, 4, "cuatro renglones");
  igual(h.dias[1].platos.length, 2, "los dos del mismo día van juntos");
});

prueba("el total del día suma lo de ese día, y el de arriba suma todo", () => {
  const h = historialDePersona(HISTORIA, "MGP", "JUAN GOMEZ");
  igual(h.dias[1].total, PRECIO + 7000, "el 10");
  igual(h.dias[0].total, PRECIO * 2, "dos almuerzos el 21");
  igual(h.total, h.dias.reduce((a, d) => a + d.total, 0));
  igual(h.total, PRECIO * 4 + 7000);
});

prueba("lo que se descuenta y lo que ya pagó van por separado", () => {
  // Confundirlos es contestarle mal a la persona cuando pregunta qué debe.
  const h = historialDePersona([
    renglon(A_CREDITO, { fecha: "2026-08-03" }),
    renglon(DE_CONTADO, { fecha: "2026-08-04" }),
    renglon(CORTESIA, { fecha: "2026-08-05" }),
  ], "MGP", "JUAN GOMEZ");

  igual(h.aLaEmpresa, PRECIO, "solo lo de crédito se le descuenta");
  igual(h.deContado, PRECIO, "esto ya lo pagó en la caja");
  igual(h.total, PRECIO * 2, "la cortesía no vale nada, pero el día sale igual");
  igual(h.veces, 3, "los tres días comió, así no le cobren");
});

prueba("lo que más pide sale de primero, contando cantidades", () => {
  const h = historialDePersona(HISTORIA, "MGP", "JUAN GOMEZ");
  igual(h.platos[0].producto, "ALMUERZO");
  igual(h.platos[0].cantidad, 4, "1 + 1 + 2, no tres renglones");
  igual(h.platos[1].producto, "GASEOSA");
});

prueba("no se mezcla con el tocayo de otra empresa", () => {
  // JUAN GOMEZ de MGP y JUAN GOMEZ de AGRO son dos personas distintas. Si el
  // historial los juntara, a uno le saldrían comidas que no hizo.
  const h = historialDePersona(
    HISTORIA.concat([renglon(A_CREDITO, { fecha: "2026-08-30", empresa: "AGRO" })]),
    "MGP", "JUAN GOMEZ");
  igual(h.veces, 3, "el de AGRO no entra");
  igual(h.total, PRECIO * 4 + 7000);
});

prueba("alguien que no ha pedido nada no revienta", () => {
  const h = historialDePersona(HISTORIA, "MGP", "NADIE");
  igual(h.veces, 0);
  igual(h.total, 0);
  igual(h.dias, []);
  igual(h.platos, []);
  igual(h.desde, null);
  igual(h.hasta, null);
});

// ---------------------------------------------------------------------------
grupo("Ponerle precio a lo que quedó en $ 0");

// Este es el hueco que dejaba el precio congelado: un renglón que nace sin
// precio se queda en $ 0 para siempre y se cobra en $ 0. Aquí se tapa, y lo
// que se prueba es que tape SOLO lo que se le dijo -- porque esto le sube la
// cuenta a una empresa.
function sinPrecio(extra = {}) {
  return renglon(A_CREDITO, { producto: "SOPA GRANDE", precioUnitario: 0, ...extra });
}

prueba("les pone el precio y dice cuánto sube la cuenta", () => {
  const datos = negocio([sinPrecio(), sinPrecio({ persona: "ANA RUIZ", cantidad: 2 })]);
  const r = ponerlePrecio(datos, datos.consumos, 8000);

  igual(r.arreglados, 2);
  igual(r.sube, 8000 * 3, "uno de JUAN y dos de ANA");
  igual(datos.consumos.map((c) => c.precioUnitario), [8000, 8000]);
});

prueba("un renglón arreglado deja de estar marcado como problema", () => {
  const datos = negocio([sinPrecio()]);
  datos.consumos[0].revisar = ["SIN_PRECIO"];
  ponerlePrecio(datos, datos.consumos, 8000);
  igual(datos.consumos[0].revisar, [], "si no, el aviso rojo se queda pegado para siempre");
});

prueba("solo toca los renglones que se le pasaron", () => {
  // Es lo que evita que arreglar la cuenta de agosto le cambie el valor a la
  // de julio, que ya se entregó.
  const viejo = sinPrecio({ fecha: "2026-07-05" });
  const nuevo = sinPrecio({ fecha: "2026-08-05" });
  const datos = negocio([viejo, nuevo]);
  ponerlePrecio(datos, [nuevo], 8000);
  igual(nuevo.precioUnitario, 8000);
  igual(viejo.precioUnitario, 0, "el de julio se queda como estaba");
});

prueba("lo que sube es la DIFERENCIA, no el total", () => {
  // Si un renglón ya valía algo y se corrige, lo que sube es lo que cambió.
  const datos = negocio([sinPrecio({ precioUnitario: 3000, cantidad: 2 })]);
  const r = ponerlePrecio(datos, datos.consumos, 8000);
  igual(r.sube, (8000 - 3000) * 2);
});

prueba("de paso lo deja guardado en el catálogo, si se le pide", () => {
  const datos = negocio([sinPrecio()]);
  ponerlePrecio(datos, datos.consumos, 8000, true);
  cierto(datos.productos.some((p) => p.nombre === "SOPA GRANDE"), "queda en el catálogo");
  igual(precioDe(datos, "SOPA GRANDE", "MGP"), 8000, "y con su precio");
});

prueba("sin pedirlo, el catálogo no se toca", () => {
  const datos = negocio([sinPrecio()]);
  ponerlePrecio(datos, datos.consumos, 8000, false);
  igual(datos.consumos[0].precioUnitario, 8000, "el renglón sí se arregla");
  cierto(!datos.productos.some((p) => p.nombre === "SOPA GRANDE"), "el catálogo no");
});

prueba("el nombre queda limpio en los dos lados, o no se vuelven a encontrar", () => {
  // Si el catálogo guarda "SOPA GRANDE" y el renglón se queda diciendo
  // "SOPA GRANDE.", el precio nunca le llega: es el mismo error que se está
  // matando, pero al revés.
  const datos = negocio([sinPrecio({ producto: "SOPA GRANDE." })]);
  ponerlePrecio(datos, datos.consumos, 8000, true);
  igual(datos.consumos[0].producto, "SOPA GRANDE");
  cierto(datos.productos.some((p) => p.nombre === "SOPA GRANDE"));
});

prueba("sin renglones no hace nada y no revienta", () => {
  const datos = negocio([]);
  igual(ponerlePrecio(datos, [], 8000), { arreglados: 0, sube: 0 });
});

// ---------------------------------------------------------------------------
grupo("El consumo de una persona entre dos fechas");

const UNOS_DIAS = [
  renglon(A_CREDITO, { fecha: "2026-08-03" }),
  renglon(A_CREDITO, { fecha: "2026-08-10", cantidad: 2 }),
  renglon(A_CREDITO, { fecha: "2026-08-20" }),
];
const conIndice = (datos) => indicePorCodigo(datos.empresas);

prueba("sin segundo día se comporta igual que antes: un solo día", () => {
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null, "2026-08-10");
  igual(filas[0].dia, PRECIO * 2, "solo lo del 10");
});

prueba("con segundo día suma todo lo que hay entre los dos, incluidos", () => {
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-03", "2026-08-10");
  igual(filas[0].dia, PRECIO * 3, "el 3 y el 10 entran los dos");
});

prueba("el rango puede cruzar el corte de la quincena", () => {
  // Del 10 al 20 hay días de las dos quincenas (MGP corta el 15). La columna
  // del periodo los suma todos; la de "quincena" es otra cosa y no se toca.
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-10", "2026-08-20");
  igual(filas[0].dia, PRECIO * 3, "los dos del 10 y el del 20");
  igual(filas[0].quincenaActual, 1, "la quincena se mira por donde EMPIEZA el rango");
});

prueba("un segundo día anterior al primero se ignora, no da negativo ni cero", () => {
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-10", "2026-08-03");
  igual(filas[0].dia, PRECIO * 2, "se queda con el día de inicio, como si no hubiera rango");
});

prueba("lo que la persona pagó de su bolsillo NO entra en el rango", () => {
  // Es la misma regla de siempre: esta columna es lo que se le descuenta.
  const datos = negocio([
    renglon(A_CREDITO, { fecha: "2026-08-05" }),
    renglon(DE_CONTADO, { fecha: "2026-08-06" }),
  ]);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-01", "2026-08-31");
  igual(filas[0].dia, PRECIO, "solo lo de crédito");
});

prueba("sin rango, lo que pidió es lo del MES entero", () => {
  // Y no lo del día suelto: en un día cualquiera comen 46 de 268 personas, así
  // que 222 renglones quedarían mudos y la lista no serviría de nada.
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null, "2026-08-10");
  igual(filas[0].platos, [{ producto: "ALMUERZO", cantidad: 4, total: PRECIO * 4 }],
        "los tres días juntos, aunque solo se esté mirando el 10");
});

prueba("con rango, lo que pidió es solo el de esos días", () => {
  const datos = negocio(UNOS_DIAS);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-03", "2026-08-10");
  igual(filas[0].platos[0].cantidad, 3, "el del 20 se queda por fuera");
});

prueba("lo que pidió va junto por plato y de mayor a menor", () => {
  const datos = negocio([
    renglon(A_CREDITO, { fecha: "2026-08-03", producto: "GASEOSA", precioUnitario: 7000 }),
    renglon(A_CREDITO, { fecha: "2026-08-04" }),
    renglon(A_CREDITO, { fecha: "2026-08-05" }),
  ]);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null, "2026-08-04");
  igual(filas[0].platos.map((x) => `${x.cantidad} ${x.producto}`), ["2 ALMUERZO", "1 GASEOSA"]);
});

prueba("quien no pidió nada en el periodo no trae lista, y no revienta", () => {
  const datos = negocio([renglon(A_CREDITO, { fecha: "2026-08-03" })]);
  const filas = informePorPersona(datos.consumos, 2026, 8, conIndice(datos), null,
                                  "2026-08-20", "2026-08-25");
  igual(filas[0].platos, [], "comió en agosto, pero no en esos días");
});

// ---------------------------------------------------------------------------
grupo("Cobro: el día y la caja");

prueba("el día dice cuánto vendió y cuánto de eso está en la caja", () => {
  const datos = negocio([
    renglon(A_CREDITO),
    renglon(A_CREDITO, { persona: "ANA RUIZ" }),
    renglon(DE_CONTADO),
    renglon(CORTESIA),
  ]);
  const dia = informeDia(datos.consumos, "2026-08-05");

  igual(dia.total, PRECIO * 3, "vendido: dos a crédito y uno de contado");
  igual(dia.aCredito, PRECIO * 2);
  igual(dia.deContado, PRECIO, "esto es lo que tiene que haber en la caja");
  igual(dia.aCredito + dia.deContado, dia.total, "las dos partes tienen que dar el total");
});

prueba("el mismo plato a crédito y de contado sale en renglones separados", () => {
  // Si se juntaran, ella vería "2 almuerzos $24.000" sin poder saber cuál ya
  // está pagado y cuál hay que cobrar.
  const datos = negocio([renglon(A_CREDITO), renglon(DE_CONTADO)]);
  const dia = informeDia(datos.consumos, "2026-08-05");
  igual(dia.filas.length, 2);
  const formas = dia.filas.map((f) => f.forma).sort();
  igual(formas, [A_CREDITO, DE_CONTADO].sort());
});

// ---------------------------------------------------------------------------
grupo("Cobro: lo que se le descuenta a cada persona");

prueba("lo que ya pagó no se le vuelve a descontar", () => {
  const datos = negocio([renglon(A_CREDITO), renglon(DE_CONTADO)]);
  const filas = informePorPersona(datos.consumos, 2026, 8, indicePorCodigo(datos.empresas));
  const juan = filas.find((f) => f.persona === "JUAN GOMEZ");

  igual(juan.mes, PRECIO, "solo se le descuenta lo de crédito");
  igual(juan.contado, PRECIO, "y aparte queda anotado lo que ya pagó");
  igual(juan.q1, PRECIO);
  igual(juan.facturas, 1, "comió el mismo día: sigue siendo una factura");
});

// ---------------------------------------------------------------------------
grupo("Cobro: lo que ve la empresa");

prueba("el informe muestra el pedido de contado pero no se lo cobra", () => {
  const datos = negocio([renglon(A_CREDITO), renglon(DE_CONTADO)]);
  const i = informeCompletoDeEmpresa(datos, "MGP", 2026, 8);

  // Aparece, porque el supervisor tiene que ver que la persona sí comió ese
  // día; si no, al comparar con la lista de asistencia va a ver huecos.
  igual(i.totales.renglones, 2, "los dos renglones tienen que verse");
  const dia = i.dias[0];
  igual(dia.renglones.length, 2);

  // Pero la empresa solo paga uno.
  igual(i.totales.mes, PRECIO);
  igual(dia.total, PRECIO);
  igual(i.platos.reduce((a, p) => a + p.total, 0), PRECIO,
        "la tabla de platos no puede incluir lo de contado");
  igual(i.personas.reduce((a, p) => a + p.mes, 0), PRECIO,
        "la tabla de personas tampoco");
});

prueba("las tres tablas del informe siguen dando el mismo total", () => {
  const datos = negocio([
    renglon(A_CREDITO),
    renglon(A_CREDITO, { persona: "ANA RUIZ", fecha: "2026-08-20" }),
    renglon(DE_CONTADO),
    renglon(CORTESIA, { persona: "ANA RUIZ" }),
  ]);
  const i = informeCompletoDeEmpresa(datos, "MGP", 2026, 8);
  igual(i.platos.reduce((a, p) => a + p.total, 0), i.totales.mes);
  igual(i.personas.reduce((a, p) => a + p.mes, 0), i.totales.mes);
  igual(i.dias.reduce((a, d) => a + d.total, 0), i.totales.mes);
  igual(i.totales.q1 + i.totales.q2, i.totales.mes);
});
