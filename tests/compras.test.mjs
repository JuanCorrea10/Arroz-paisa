// ============================================================================
//  compras.test.mjs  -  Lo que se le paga a los proveedores
//
//  LA META, dicha por ella: "totalizar el pago semanal de proveedores". A los
//  proveedores se les gira los lunes y lo que necesita esa mañana es UN número
//  por proveedor: cuánto mandarle.
//
//  Lo que más caro sale si se daña:
//
//    - Sumar lo ya pagado con lo que falta: giraría de más, y eso no se
//      devuelve.
//    - Callar una factura sin valor: el total saldría corto y ella giraría de
//      menos creyendo que está al día. Es el bug del Excel otra vez.
//    - Que una semana se le meta a la otra: el lunes se paga LA SEMANA QUE
//      TERMINÓ, no pedazos de dos.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  pagoSemanal, comprasEnRango, laSemanaDe, loQueFaltaPorPagar,
  estaPagada, sinValor, proveedoresDe, sedesDe, claveFacturaCompra, proveedoresParecidos,
} from "../js/nucleo/compras.js";

grupo("El pago semanal de proveedores");

function factura(extra = {}) {
  return {
    fecha: "2026-09-08", sede: "BOSQUELARGO", proveedor: "DIEGO VELASQUEZ",
    producto: "TOCINO", cantidad: "20 KILOS", valor: 170000, factura: "1917",
    pagadaEl: null, ...extra,
  };
}

prueba("una fila por proveedor, con lo que se le debe", () => {
  const r = pagoSemanal([
    factura(),
    factura({ proveedor: "JAMAICA", valor: 340000, factura: "54935" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.filas.map((f) => f.proveedor), ["JAMAICA", "DIEGO VELASQUEZ"]);
  igual(r.total.total, 510000);
  igual(r.total.proveedores, 2);
});

prueba("el giro más grande queda de primero", () => {
  // Es el que no se puede equivocar, así que va arriba y no perdido en la
  // mitad de una lista alfabética.
  const r = pagoSemanal([
    factura({ proveedor: "CAMARON", valor: 93000, factura: "1" }),
    factura({ proveedor: "JAMAICA", valor: 340000, factura: "2" }),
    factura({ proveedor: "ARROZ", valor: 660000, factura: "3" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.filas.map((f) => f.proveedor), ["ARROZ", "JAMAICA", "CAMARON"]);
});

prueba("las varias facturas de un proveedor se suman en una sola fila", () => {
  const r = pagoSemanal([
    factura({ valor: 170000, factura: "1" }),
    factura({ valor: 100000, factura: "2" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.filas.length, 1);
  igual(r.filas[0].facturas, 2);
  igual(r.filas[0].total, 270000);
});

prueba("lo YA PAGADO no se mezcla con lo que falta", () => {
  // Si se sumaran juntos, ella giraría otra vez algo que ya pagó.
  const r = pagoSemanal([
    factura({ valor: 170000, factura: "1", pagadaEl: "2026-09-08" }),
    factura({ valor: 100000, factura: "2" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.pagado, 170000);
  igual(r.total.porPagar, 100000, "esto es lo que hay que girar");
  igual(r.total.total, 270000);
});

prueba("pagado más por pagar siempre da el total", () => {
  const r = pagoSemanal([
    factura({ valor: 170000, factura: "1", pagadaEl: "2026-09-08" }),
    factura({ valor: 100000, factura: "2" }),
    factura({ valor: 50000, factura: "3", proveedor: "OTRO" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.pagado + r.total.porPagar, r.total.total);
  for (const f of r.filas) igual(f.pagado + f.porPagar, f.total, f.proveedor);
});

prueba("una factura SIN VALOR no suma, pero se cuenta y se puede avisar", () => {
  // En sus datos hay una así. No se puede inventar lo que vale; lo que no se
  // puede es callarla, porque el total quedaría corto sin que nada lo diga.
  const r = pagoSemanal([
    factura({ valor: 170000, factura: "1" }),
    factura({ valor: null, factura: "2" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.total, 170000);
  igual(r.total.sinValor, 1);
  igual(r.filas[0].sinValor, 1);
});

prueba("un valor que no es número tampoco pasa por bueno", () => {
  cierto(sinValor(factura({ valor: "mil" })));
  cierto(sinValor(factura({ valor: 0 })));
  cierto(sinValor(factura({ valor: -5 })));
  cierto(!sinValor(factura({ valor: 1 })));
});

prueba("las facturas de cada proveedor vienen en orden de fecha", () => {
  const r = pagoSemanal([
    factura({ fecha: "2026-09-11", factura: "2" }),
    factura({ fecha: "2026-09-08", factura: "1" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.filas[0].compras.map((c) => c.fecha), ["2026-09-08", "2026-09-11"]);
});

// ---------------------------------------------------------------------------
grupo("Los días que cubre el pago");

prueba("la semana va de lunes a domingo", () => {
  // 2026-09-08 es martes.
  igual(laSemanaDe("2026-09-08"), { desde: "2026-09-07", hasta: "2026-09-13" });
});

prueba("un domingo cae en la semana que termina, no en la que empieza", () => {
  igual(laSemanaDe("2026-09-13"), { desde: "2026-09-07", hasta: "2026-09-13" });
});

prueba("una semana no se le mete a la otra", () => {
  const r = pagoSemanal([
    factura({ fecha: "2026-09-06" }),   // domingo anterior
    factura({ fecha: "2026-09-08", factura: "2" }),
    factura({ fecha: "2026-09-14", factura: "3" }),  // lunes siguiente
  ], "2026-09-07", "2026-09-13");
  igual(r.total.facturas, 1);
});

prueba("los bordes SÍ entran", () => {
  const r = pagoSemanal([
    factura({ fecha: "2026-09-07" }),
    factura({ fecha: "2026-09-13", factura: "2" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.facturas, 2);
});

prueba("una fecha mala no cuenta ni revienta", () => {
  const r = pagoSemanal([
    factura(),
    factura({ fecha: "28/08/0206", factura: "2" }),  // está así en su Excel
    factura({ fecha: null, factura: "3" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.facturas, 1);
});

// ---------------------------------------------------------------------------
grupo("Las sedes: el restaurante, no los clientes");

prueba("se puede pedir el pago de UNA sede", () => {
  const r = pagoSemanal([
    factura({ sede: "BOSQUELARGO" }),
    factura({ sede: "LAGOS", factura: "2", valor: 50000 }),
  ], "2026-09-07", "2026-09-13", "LAGOS");
  igual(r.total.total, 50000);
  igual(r.sede, "LAGOS");
});

prueba("sin pedir sede vienen todas", () => {
  const r = pagoSemanal([
    factura({ sede: "BOSQUELARGO" }),
    factura({ sede: "LAGOS", factura: "2" }),
  ], "2026-09-07", "2026-09-13");
  igual(r.total.facturas, 2);
});

prueba("las sedes salen de las compras, sin repetir", () => {
  igual(sedesDe([
    factura({ sede: "LAGOS" }), factura({ sede: "BOSQUELARGO" }),
    factura({ sede: "lagos" }), factura({ sede: "" }),
  ]), ["BOSQUELARGO", "LAGOS"]);
});

// ---------------------------------------------------------------------------
grupo("Lo que falta por pagar");

prueba("trae lo no pagado, de lo más viejo a lo más nuevo", () => {
  // Es la pregunta que el Excel no podía contestar: el estado del pago vivía
  // en texto libre, escrito de cinco formas distintas.
  const r = loQueFaltaPorPagar([
    factura({ fecha: "2026-09-11", factura: "3" }),
    factura({ fecha: "2026-08-02", factura: "1" }),
    factura({ fecha: "2026-09-01", factura: "2", pagadaEl: "2026-09-08" }),
  ]);
  igual(r.map((c) => c.factura), ["1", "3"]);
});

prueba("pagada es una FECHA, no un sí o un no", () => {
  // Con un sí/no se sabe que se pagó pero no cuándo, y no hay cómo cuadrarlo
  // contra el banco a fin de mes.
  cierto(estaPagada(factura({ pagadaEl: "2026-09-08" })));
  cierto(!estaPagada(factura({ pagadaEl: true })), "un sí no sirve");
  cierto(!estaPagada(factura({ pagadaEl: "ya" })));
  cierto(!estaPagada(factura()));
});

// ---------------------------------------------------------------------------
grupo("Los proveedores");

prueba("salen de las compras, el que más factura de primero", () => {
  igual(proveedoresDe([
    factura({ proveedor: "JAMAICA" }),
    factura({ proveedor: "DIEGO VELASQUEZ" }),
    factura({ proveedor: "JAMAICA" }),
  ]).map((p) => p.nombre), ["JAMAICA", "DIEGO VELASQUEZ"]);
});

prueba("dos facturas iguales del mismo proveedor tienen la misma llave", () => {
  // En sus datos hay dos pares así. Puede ser doble registro o puede ser
  // legítimo, pero la app tiene que poder darse cuenta.
  igual(claveFacturaCompra(factura({ factura: "1860" })),
        claveFacturaCompra(factura({ factura: "1860", valor: 66000 })));
});

prueba("y dos de proveedores distintos NO", () => {
  cierto(claveFacturaCompra(factura({ factura: "1" })) !==
         claveFacturaCompra(factura({ factura: "1", proveedor: "OTRO" })));
});

// ---------------------------------------------------------------------------
grupo("Filtrar compras");

prueba("sin rango vienen todas", () => {
  igual(comprasEnRango([factura({ fecha: "2020-01-01" }), factura({ fecha: "2030-12-31" })],
                       null, null).length, 2);
});

prueba("una lista vacía no revienta", () => {
  const r = pagoSemanal([], "2026-09-07", "2026-09-13");
  igual(r.filas, []);
  igual(r.total.total, 0);
  igual(r.total.proveedores, 0);
});

// ---------------------------------------------------------------------------
grupo("Proveedores escritos de dos formas");

prueba("caza el de una sola letra de diferencia", () => {
  // Este es el caro: en sus datos son 55 facturas partidas en dos filas del
  // pago semanal. Si gira lo que dice cada fila, le paga dos veces al mismo.
  const r = proveedoresParecidos([
    factura({ proveedor: "DIEGO VELASQUEZ" }),
    factura({ proveedor: "DIEGO VELAZQUEZ", factura: "2" }),
  ]);
  igual(r.length, 1);
  cierto(/una sola letra/.test(r[0].razon), r[0].razon);
});

prueba("caza cuando a uno le falta una palabra", () => {
  const r = proveedoresParecidos([
    factura({ proveedor: "HACIENDA LA ALQUERIA" }),
    factura({ proveedor: "HACIENDA ALQUERIA", factura: "2" }),
  ]);
  igual(r.length, 1);
});

prueba("caza el tipo de sociedad pegado al final", () => {
  const r = proveedoresParecidos([
    factura({ proveedor: "ORIZ" }),
    factura({ proveedor: "ORIZ S.A.S", factura: "2" }),
  ]);
  igual(r.length, 1);
});

prueba("NO junta dos proveedores que de verdad son distintos", () => {
  // Un aviso que sale siempre deja de leerse. Si JAMAICA y CAMARON salieran
  // como "parecidos", el aviso no serviría para nada.
  igual(proveedoresParecidos([
    factura({ proveedor: "JAMAICA" }),
    factura({ proveedor: "CAMARON", factura: "2" }),
    factura({ proveedor: "PUERTO AZUL", factura: "3" }),
  ]), []);
});

prueba("sin compras no hay parejas, y no revienta", () => {
  igual(proveedoresParecidos([]), []);
});
