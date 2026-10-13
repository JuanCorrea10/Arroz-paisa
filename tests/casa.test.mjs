// ============================================================================
//  casa.test.mjs  -  El personal del propio restaurante
//
//  A la cocinera y al que reparte también se les da almuerzo, y ellos PAGAN DE
//  UNA, de su bolsillo. O sea que sí es una venta y esa plata sí entra a la
//  caja -- pero NO son un cliente al que se le pasa una cuenta a fin de mes.
//
//  Lo de la cuenta de cobro cambió dos veces. Primero ella pidió que al
//  restaurante propio también se le pueda pasar una. Después vio que salía en
//  $ 0 con las facturas contadas al lado: la cuenta solo recogía lo a crédito
//  y los platos de la casa nacen "pagó en efectivo". Ahora, en la casa, la
//  cuenta recoge TODO lo que comió su gente (menos cortesías): no hay a quién
//  cobrarle dos veces. En una fábrica sigue igual: lo de contado no entra.
//
//  Lo que NO cambia: cada plato de la casa nace "pagó en efectivo" y entra a
//  la caja. Si entrara "a crédito" -- plata que alguien debe, cuando ya la
//  pagaron -- esa plata nunca aparecería en la caja y el cuadre no daría.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  esLaCasa, empresasClientes, cuentaDeCobro, ventasEnRango,
  sumarLoDeContado, sumarLoDeLaEmpresa, formaDeCobro, entraEnLaCuentaDe,
  informeCompletoDeEmpresa, informePorPersona, indicePorCodigo,
  A_CREDITO, DE_CONTADO, CORTESIA,
} from "../js/nucleo/calculos.js";
import { datosVacios, agregarEmpresa, nuevoConsumo } from "../js/nucleo/modelo.js";

grupo("El restaurante como su propia 'empresa'");

function negocio() {
  const datos = datosVacios();
  agregarEmpresa(datos, { codigo: "MGP", razonSocial: "Industrias MGP" });
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa", esCasa: true });
  return datos;
}

prueba("la casa se reconoce, y las fábricas no", () => {
  const d = negocio();
  const casa = d.empresas.find((e) => e.codigo === "CASA");
  const mgp = d.empresas.find((e) => e.codigo === "MGP");
  cierto(esLaCasa(casa), "CASA es la casa");
  cierto(!esLaCasa(mgp), "MGP no");
});

prueba("empresasClientes deja la casa por fuera: de ahí no se copian precios", () => {
  const d = negocio();
  igual(empresasClientes(d.empresas).map((e) => e.codigo), ["MGP"]);
});

prueba("a la casa TAMBIÉN se le puede hacer cuenta de cobro", () => {
  // Esto antes reventaba a propósito. Ella pidió lo contrario: al restaurante
  // propio también hay a quién cobrarle, y la app no tiene por qué decidir
  // por ella a quién le pasa una cuenta.
  const d = negocio();
  const casa = d.empresas.find((e) => e.codigo === "CASA");
  const cuenta = cuentaDeCobro([almuerzoDeLaCasa(A_CREDITO)], 2026, 8, 1, casa);
  igual(cuenta.total, 12000, "lo que esté a crédito sí se le cobra");
  igual(cuenta.personas.length, 1);
});

prueba("y en la casa entra TODO lo que comió su gente, aunque lo pagó en efectivo", () => {
  // Sus platos nacen "pagó en efectivo". Con la regla de las fábricas la
  // cuenta salía en $ 0 con las facturas contadas al lado, y ella lo vio de
  // una: "el total de Arroz Paisa no suma". No hay a quién cobrarle dos veces.
  const d = negocio();
  const casa = d.empresas.find((e) => e.codigo === "CASA");
  const cuenta = cuentaDeCobro([almuerzoDeLaCasa(DE_CONTADO)], 2026, 8, 1, casa);
  igual(cuenta.total, 12000);
  igual(cuenta.facturas, 1, "y las facturas cuadran con la plata");
});

prueba("menos las cortesías: un regalo no es plata, ni en la casa", () => {
  const d = negocio();
  const casa = d.empresas.find((e) => e.codigo === "CASA");
  igual(cuentaDeCobro([almuerzoDeLaCasa(CORTESIA)], 2026, 8, 1, casa).total, 0);
  igual(entraEnLaCuentaDe(almuerzoDeLaCasa(CORTESIA), casa), false);
  igual(entraEnLaCuentaDe(almuerzoDeLaCasa(DE_CONTADO), casa), true);
});

prueba("en una fábrica lo de contado SIGUE por fuera: cobrarlo sería cobrarlo dos veces", () => {
  const d = negocio();
  const mgp = d.empresas.find((e) => e.codigo === "MGP");
  const pagado = nuevoConsumo({
    fecha: "2026-08-03", empresa: "MGP", persona: "PEDRO", producto: "ALMUERZO",
    cantidad: 1, precioUnitario: 12000, cobro: DE_CONTADO,
  });
  igual(entraEnLaCuentaDe(pagado, mgp), false);
  igual(cuentaDeCobro([pagado], 2026, 8, 1, mgp).total, 0);
});

prueba("el informe que se comparte y Por persona suman lo de la casa igual que la cuenta", () => {
  // Era donde más se veía: "Total del mes $ 0" al lado de "Facturas del mes 3".
  const d = negocio();
  d.consumos.push(almuerzoDeLaCasa(DE_CONTADO));
  d.consumos.push(nuevoConsumo({
    fecha: "2026-08-04", empresa: "CASA", persona: "ROSA", producto: "ALMUERZO",
    cantidad: 1, precioUnitario: 12000, cobro: DE_CONTADO,
  }));
  const informe = informeCompletoDeEmpresa(d, "CASA", 2026, 8);
  igual(informe.totales.mes, 24000);
  igual(informe.totales.facturas, 2);
  igual(informe.dias.map((x) => x.total), [12000, 12000]);

  const rosa = informePorPersona(d.consumos, 2026, 8, indicePorCodigo(d.empresas))
    .find((f) => f.persona === "ROSA" && f.empresa === "CASA");
  igual(rosa.mes, 24000, "lo que comió");
  igual(rosa.contado, 24000, "y cómo lo pagó, que es otra pregunta");
});

/** Un almuerzo de la casa, para las dos pruebas de arriba. */
function almuerzoDeLaCasa(cobro) {
  return nuevoConsumo({
    fecha: "2026-08-03", empresa: "CASA", persona: "ROSA", producto: "ALMUERZO",
    cantidad: 1, precioUnitario: 12000, cobro,
  });
}

prueba("a una fábrica sí, como siempre", () => {
  const d = negocio();
  const mgp = d.empresas.find((e) => e.codigo === "MGP");
  igual(cuentaDeCobro([], 2026, 8, 1, mgp).total, 0, "vacía, pero no revienta");
});

// ---------------------------------------------------------------------------
grupo("Lo que come la gente de la casa: paga de una");

function almuerzoDe(empresa, cobro) {
  return nuevoConsumo({
    fecha: "2026-08-03", empresa, persona: "ROSA", producto: "ALMUERZO",
    cantidad: 1, precioUnitario: 12000, cobro,
  });
}

prueba("un renglón puede nacer diciendo que ya se pagó", () => {
  igual(formaDeCobro(almuerzoDe("CASA", DE_CONTADO)), DE_CONTADO);
});

prueba("y si no se dice nada, sigue naciendo a crédito como siempre", () => {
  // Los renglones de las fábricas no pueden cambiar de comportamiento.
  igual(formaDeCobro(almuerzoDe("MGP", null)), A_CREDITO);
});

prueba("lo de la casa entra a la CAJA, no a la cuenta de la empresa", () => {
  const renglones = [almuerzoDe("CASA", DE_CONTADO)];
  igual(sumarLoDeContado(renglones), 12000, "está en la caja");
  igual(sumarLoDeLaEmpresa(renglones), 0, "y no se le cobra a nadie");
});

prueba("SÍ cuenta como venta: la plata entró", () => {
  // Esto es lo que la separa de una cortesía. Un almuerzo de la casa se
  // vendió; simplemente se pagó por otra puerta.
  const v = ventasEnRango([almuerzoDe("CASA", DE_CONTADO)], "2026-08-01", "2026-08-31");
  igual(v.total.vendidos, 1);
  igual(v.total.plata, 12000);
  igual(v.total.deContado, 12000);
  igual(v.total.aCredito, 0);
  igual(v.total.cortesias, 0, "no es un regalo");
});

prueba("la casa no le mete plata a la cuenta de una fábrica", () => {
  const d = negocio();
  const mgp = d.empresas.find((e) => e.codigo === "MGP");
  const renglones = [almuerzoDe("MGP", null), almuerzoDe("CASA", DE_CONTADO)];
  igual(cuentaDeCobro(renglones, 2026, 8, 1, mgp).total, 12000, "solo el de MGP");
});
