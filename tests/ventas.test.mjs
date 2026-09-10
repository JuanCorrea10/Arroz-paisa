// ============================================================================
//  ventas.test.mjs  -  "¿Cuántos almuerzos vendí esta semana?"
//
//  La pregunta más obvia del negocio, y la app no la contestaba: Cocina es de
//  UN día y no habla de plata, Resumen del día es de un día y una empresa, y
//  la cuenta de cobro solo trae lo que se le cobra a la empresa. Para saber lo
//  de una semana tocaba abrir Cocina siete veces y sumar a mano.
//
//  Lo que más se puede dañar aquí es mezclar las tres formas de cobro. Una
//  cortesía SALIÓ de la cocina pero NO se vendió; un contado sí se vendió,
//  solo que la plata entró por la caja y no por la empresa. Contarlas juntas
//  daría un número que se ve bien y está mal.
// ============================================================================

import { grupo, prueba, igual } from "./probar.mjs";
import { ventasEnRango, A_CREDITO, DE_CONTADO, CORTESIA } from "../js/nucleo/calculos.js";
import { sumarDias, lunesDeLaSemana, elMesDe } from "../js/nucleo/formato.js";

grupo("Cuánto se vendió entre dos fechas");

const PRECIO = 12000;

function renglon(fecha, producto = "ALMUERZO", extra = {}) {
  return {
    fecha, producto, empresa: "MGP", persona: "JUAN",
    cantidad: 1, precioUnitario: PRECIO, cobro: A_CREDITO, ...extra,
  };
}

prueba("suma los platos de los días que están dentro del rango", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"), renglon("2026-08-04"), renglon("2026-08-05"),
  ], "2026-08-03", "2026-08-04");
  igual(v.total.vendidos, 2, "el del 5 queda por fuera");
});

prueba("los bordes del rango SÍ entran", () => {
  // "del 3 al 9" incluye el 3 y el 9. Si no, cada quincena perdería dos días.
  const v = ventasEnRango([
    renglon("2026-08-03"), renglon("2026-08-09"),
  ], "2026-08-03", "2026-08-09");
  igual(v.total.vendidos, 2);
});

prueba("un mes no se le mete a otro", () => {
  // El bug #5 del Excel era justo este: filtrar sin mirar el mes.
  const v = ventasEnRango([
    renglon("2026-08-31"), renglon("2026-09-01"),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 1);
});

prueba("la cortesía NO es una venta, pero sí salió de la cocina", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"),
    renglon("2026-08-03", "ALMUERZO", { cobro: CORTESIA }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 1, "vendido hay uno solo");
  igual(v.total.cortesias, 1, "pero salieron dos almuerzos");
  igual(v.total.plata, PRECIO, "la cortesía vale cero");
});

prueba("lo de contado sí es venta, y se ve aparte de lo de la empresa", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"),
    renglon("2026-08-03", "GASEOSA", { cobro: DE_CONTADO, precioUnitario: 7000 }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.plata, PRECIO + 7000, "las dos son venta");
  igual(v.total.aCredito, PRECIO, "solo una se le cobra a la empresa");
  igual(v.total.deContado, 7000, "la otra está en la caja");
});

prueba("la plata siempre es lo de la empresa más lo de contado", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"),
    renglon("2026-08-04", "GASEOSA", { cobro: DE_CONTADO, precioUnitario: 7000 }),
    renglon("2026-08-05", "SOPA", { cobro: CORTESIA, precioUnitario: 8000 }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.plata, v.total.aCredito + v.total.deContado);
});

prueba("la cantidad multiplica: 3 almuerzos son 3, no 1", () => {
  const v = ventasEnRango([renglon("2026-08-03", "ALMUERZO", { cantidad: 3 })],
                          "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 3);
  igual(v.total.plata, PRECIO * 3);
});

prueba("el plato que más sale queda de primero", () => {
  // Alfabético dejaría ALMUERZO -- que es casi todo el negocio -- perdido en
  // la mitad de la lista, debajo de "ADICIONAL DE COSTILLA".
  const v = ventasEnRango([
    renglon("2026-08-03", "ADICIONAL DE COSTILLA"),
    renglon("2026-08-03", "ALMUERZO", { cantidad: 9 }),
    renglon("2026-08-03", "GASEOSA", { cantidad: 4 }),
  ], "2026-08-01", "2026-08-31");
  igual(v.filas.map((f) => f.producto), ["ALMUERZO", "GASEOSA", "ADICIONAL DE COSTILLA"]);
});

prueba("se puede pedir de una sola empresa", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"),
    renglon("2026-08-03", "ALMUERZO", { empresa: "AGRO" }),
  ], "2026-08-01", "2026-08-31", "MGP");
  igual(v.total.vendidos, 1);
});

prueba("día por día, en orden y con sus facturas", () => {
  // Es lo que contesta "¿y el martes cuánto vendí?".
  const v = ventasEnRango([
    renglon("2026-08-05"),
    renglon("2026-08-03"),
    renglon("2026-08-03", "GASEOSA", { precioUnitario: 7000 }),
    renglon("2026-08-03", "ALMUERZO", { persona: "ANA" }),
  ], "2026-08-01", "2026-08-31");
  igual(v.dias.map((d) => d.fecha), ["2026-08-03", "2026-08-05"]);
  igual(v.dias[0].vendidos, 3);
  igual(v.dias[0].facturas, 2, "JUAN pidió dos cosas: es UNA factura");
  igual(v.total.diasConVenta, 2);
});

prueba("los días suman exactamente el total", () => {
  const v = ventasEnRango([
    renglon("2026-08-03", "ALMUERZO", { cantidad: 2 }),
    renglon("2026-08-04", "GASEOSA", { precioUnitario: 7000 }),
    renglon("2026-08-05", "SOPA", { cobro: CORTESIA }),
  ], "2026-08-01", "2026-08-31");
  igual(v.dias.reduce((a, d) => a + d.vendidos, 0), v.total.vendidos);
  igual(v.dias.reduce((a, d) => a + d.plata, 0), v.total.plata);
  igual(v.dias.reduce((a, d) => a + d.cortesias, 0), v.total.cortesias);
});

prueba("los platos también suman el total", () => {
  const v = ventasEnRango([
    renglon("2026-08-03", "ALMUERZO", { cantidad: 2 }),
    renglon("2026-08-04", "GASEOSA", { precioUnitario: 7000 }),
  ], "2026-08-01", "2026-08-31");
  igual(v.filas.reduce((a, f) => a + f.plata, 0), v.total.plata);
  igual(v.filas.reduce((a, f) => a + f.vendidos, 0), v.total.vendidos);
});

prueba("una fecha mala no cuenta ni revienta", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"), renglon(""), renglon("agosto"), renglon(null),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 1);
});

prueba("sin rango, se cuenta todo", () => {
  const v = ventasEnRango([renglon("2020-01-01"), renglon("2030-12-31")], null, null);
  igual(v.total.vendidos, 2);
});

prueba("un día sin nada devuelve ceros, no se cae", () => {
  const v = ventasEnRango([renglon("2026-08-03")], "2026-08-10", "2026-08-10");
  igual(v.total.vendidos, 0);
  igual(v.total.plata, 0);
  igual(v.filas.length, 0);
  igual(v.dias.length, 0);
});

// ---------------------------------------------------------------------------
grupo("Las fechas de los atajos (hoy, esta semana, este mes)");

prueba("sumar días pasa de mes y de año", () => {
  igual(sumarDias("2026-08-31", 1), "2026-09-01");
  igual(sumarDias("2026-12-31", 1), "2027-01-01");
  igual(sumarDias("2026-09-01", -1), "2026-08-31");
  igual(sumarDias("2026-03-01", -1), "2026-02-28");
});

prueba("la semana empieza el LUNES", () => {
  // 2026-08-25 es martes.
  igual(lunesDeLaSemana("2026-08-25"), "2026-08-24");
  igual(lunesDeLaSemana("2026-08-24"), "2026-08-24", "el lunes es su propio lunes");
});

prueba("un DOMINGO cae en la semana que ya pasó, no en la que viene", () => {
  // Es el error clásico: getDay() dice 0 el domingo. Sin corregirlo, pedir
  // "esta semana" un domingo devolvería la semana siguiente, en cero.
  igual(lunesDeLaSemana("2026-08-30"), "2026-08-24");
});

prueba("la semana cruza el cambio de mes sin perderse", () => {
  // 2026-09-01 es martes: su lunes es el 31 de agosto.
  igual(lunesDeLaSemana("2026-09-01"), "2026-08-31");
});

prueba("el mes va del 1 al último día, y febrero sabe cuántos tiene", () => {
  igual(elMesDe("2026-08-25"), { desde: "2026-08-01", hasta: "2026-08-31" });
  igual(elMesDe("2026-02-10"), { desde: "2026-02-01", hasta: "2026-02-28" });
  igual(elMesDe("2028-02-10"), { desde: "2028-02-01", hasta: "2028-02-29" }, "bisiesto");
});

prueba("una fecha mala no revienta los atajos", () => {
  igual(sumarDias("", 1), "");
  igual(lunesDeLaSemana("cualquier cosa"), "");
  igual(elMesDe(null), { desde: "", hasta: "" });
});

// ---------------------------------------------------------------------------
grupo("Los platos que salieron sin precio");

prueba("se cuentan aparte: si no, faltaría plata y nadie lo diría", () => {
  const v = ventasEnRango([
    renglon("2026-08-03"),
    renglon("2026-08-03", "AGUA CON GAS", { precioUnitario: 0, cantidad: 4 }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 5, "los cinco salieron");
  igual(v.total.plata, PRECIO, "pero solo uno sumó");
  igual(v.total.sinPrecio, 4, "y hay que decir que cuatro no sumaron");
});

prueba("una cortesía NO es un plato sin precio", () => {
  // La cortesía vale cero a propósito. Contarla como error haría que la
  // pantalla avisara todos los días de algo que está bien.
  const v = ventasEnRango([
    renglon("2026-08-03", "ALMUERZO", { cobro: CORTESIA }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.sinPrecio, 0);
});

prueba("un precio que no es número tampoco pasa por bueno", () => {
  const v = ventasEnRango([
    renglon("2026-08-03", "ALMUERZO", { precioUnitario: null }),
    renglon("2026-08-03", "SOPA", { precioUnitario: undefined }),
  ], "2026-08-01", "2026-08-31");
  igual(v.total.sinPrecio, 2);
});

prueba("se sabe cuál plato y qué día fue", () => {
  const v = ventasEnRango([
    renglon("2026-08-03", "AGUA CON GAS", { precioUnitario: 0 }),
    renglon("2026-08-04"),
  ], "2026-08-01", "2026-08-31");
  igual(v.filas.find((f) => f.producto === "AGUA CON GAS").sinPrecio, 1);
  igual(v.dias.find((d) => d.fecha === "2026-08-03").sinPrecio, 1);
  igual(v.dias.find((d) => d.fecha === "2026-08-04").sinPrecio, 0);
});
