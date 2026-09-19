// ============================================================================
//  ventas-del-mes.test.mjs
//
//  La tabla de "cuánto entró cada día". Es la que reemplazó al Cuadre de
//  facturas, y es de plata, así que aquí van las tres formas de equivocarse:
//
//    - Meter la cortesía en la plata: el día aparecería vendiendo algo que
//      nadie pagó.
//    - Dejarla fuera de la cuenta de platos: saldrían menos almuerzos de los
//      que de verdad salieron de la cocina.
//    - Sumar un plato sin precio como si valiera cero: el total sale corto y
//      el papel no dice por qué. Ese es el bug del Excel viejo.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { ventasDelMes, esAlmuerzo } from "../js/nucleo/calculos.js";

const renglon = (extra) => ({
  fecha: "2026-08-03",
  empresa: "MGP",
  persona: "ANA",
  producto: "ALMUERZO",
  cantidad: 1,
  precioUnitario: 12000,
  cobro: "empresa",
  ...extra,
});

/** La fila de un día, para no andar buscándola en cada prueba. */
const dia = (r, fechaISO) => r.filas.find((f) => f.fecha === fechaISO);

grupo("Qué es un almuerzo y qué es 'otros'");

prueba("almuerzo es el plato ALMUERZO, escrito como sea", () => {
  cierto(esAlmuerzo("ALMUERZO"));
  cierto(esAlmuerzo("  almuerzo "), "sin importar espacios ni minúsculas");
});

prueba("lo demás no es almuerzo, ni siquiera la OFERTA", () => {
  // Queda escrito a propósito: OFERTA es el segundo plato que más sale. Si
  // algún día ella lo cuenta como almuerzo, esta prueba es la que avisa que
  // el cambio movió la línea.
  igual(esAlmuerzo("OFERTA"), false);
  igual(esAlmuerzo("COCA COLA 1.5"), false);
  igual(esAlmuerzo(""), false);
  igual(esAlmuerzo(null), false);
});

grupo("Las ventas del mes, día por día");

prueba("parte el día en almuerzos y otros", () => {
  const r = ventasDelMes([
    renglon({ cantidad: 3 }),
    renglon({ producto: "COCA COLA 1.5", cantidad: 2, precioUnitario: 7000 }),
  ], 2026, 8);

  const d = dia(r, "2026-08-03");
  igual(d.almuerzos, { platos: 3, plata: 36000, cortesias: 0 }, "3 almuerzos, $ 36.000");
  igual(d.otros, { platos: 2, plata: 14000, cortesias: 0 });
  igual(d.plata, 50000, "el total del día es la suma de los dos");
});

prueba("el total del mes suma todos los días", () => {
  const r = ventasDelMes([
    renglon({ fecha: "2026-08-03", cantidad: 2 }),
    renglon({ fecha: "2026-08-20", cantidad: 1 }),
    renglon({ fecha: "2026-08-20", producto: "JUGO EN LECHE", precioUnitario: 5000 }),
  ], 2026, 8);

  igual(r.total.almuerzos, { platos: 3, plata: 36000, cortesias: 0 });
  igual(r.total.otros, { platos: 1, plata: 5000, cortesias: 0 });
  igual(r.total.plata, 41000);
  igual(r.total.diasConVenta, 2, "solo los dos días que tuvieron algo");
});

prueba("los días sin nada salen en cero, no se saltan", () => {
  // Un día en blanco en la mitad del mes es un día que no se anotó. Saltarlo
  // lo escondería: la tabla se leería corrida y nadie notaría el hueco.
  const r = ventasDelMes([renglon({ fecha: "2026-08-03" })], 2026, 8);
  igual(r.filas.length, 31, "agosto tiene 31 días");
  igual(dia(r, "2026-08-04").plata, 0);
  igual(r.filas[0].fecha, "2026-08-01");
  igual(r.filas[30].fecha, "2026-08-31");
});

prueba("febrero de un año bisiesto tiene 29 filas", () => {
  igual(ventasDelMes([], 2028, 2).filas.length, 29);
  igual(ventasDelMes([], 2026, 2).filas.length, 28);
});

prueba("la cortesía no suma plata pero sí cuenta como plato", () => {
  // Es la regla del dominio: la cortesía vale cero a propósito. Pero el plato
  // salió de la cocina, y en una tabla de cuántos almuerzos salieron tiene
  // que verse.
  const r = ventasDelMes([
    renglon({ cantidad: 1 }),
    renglon({ cantidad: 2, cobro: "cortesia" }),
  ], 2026, 8);

  const d = dia(r, "2026-08-03");
  igual(d.almuerzos.platos, 1, "solo el que sí se cobró");
  igual(d.almuerzos.cortesias, 2);
  igual(d.almuerzos.plata, 12000, "la cortesía no le mete plata al día");
  igual(d.plata, 12000);
});

prueba("lo de contado también es venta", () => {
  // Que la persona pague de su bolsillo no lo hace menos venta: si no contara,
  // la caja del día saldría corta.
  const r = ventasDelMes([
    renglon({ cobro: "empresa" }),
    renglon({ cobro: "contado" }),
  ], 2026, 8);
  igual(dia(r, "2026-08-03").plata, 24000);
});

prueba("un plato sin precio se cuenta y se avisa", () => {
  const r = ventasDelMes([
    renglon({ cantidad: 1 }),
    renglon({ cantidad: 2, producto: "COMBO ALITAS", precioUnitario: 0 }),
  ], 2026, 8);

  const d = dia(r, "2026-08-03");
  igual(d.otros.platos, 2, "salieron dos, aunque no hayan sumado");
  igual(d.otros.plata, 0);
  igual(d.sinPrecio, 2, "y el día lo dice, para que el total corto se explique");
  igual(r.total.sinPrecio, 2);
});

prueba("se puede mirar una sola empresa", () => {
  const r = ventasDelMes([
    renglon({ empresa: "MGP" }),
    renglon({ empresa: "AGRO" }),
  ], 2026, 8, "MGP");
  igual(dia(r, "2026-08-03").plata, 12000);
});

prueba("lo de otro mes no se cuela", () => {
  const r = ventasDelMes([
    renglon({ fecha: "2026-08-03" }),
    renglon({ fecha: "2026-09-03" }),
    renglon({ fecha: "2025-08-03" }),
  ], 2026, 8);
  igual(r.total.plata, 12000);
});

prueba("del mes que va corriendo no salen los días que no han llegado", () => {
  // Un renglón que dice "30/09/2026 · $ 0" cuando estamos a 18 no es un día
  // sin ventas: es un día que no ha pasado. Ponerlo hace ver el mes peor de
  // lo que va.
  const r = ventasDelMes([renglon({ fecha: "2026-09-03" })], 2026, 9, null, "2026-09-18");
  igual(r.filas.length, 18);
  igual(r.filas[17].fecha, "2026-09-18");
});

prueba("el tope de otro mes no recorta el mes que se está mirando", () => {
  // Mirando agosto estando en septiembre, agosto sale completo.
  const r = ventasDelMes([], 2026, 8, null, "2026-09-18");
  igual(r.filas.length, 31);
});

prueba("un mes que todavía no empieza sale vacío, no reventado", () => {
  const r = ventasDelMes([], 2026, 12, null, "2026-09-18");
  igual(r.filas.length, 0);
  igual(r.total.plata, 0);
});
