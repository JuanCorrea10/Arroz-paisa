// ============================================================================
//  casa.test.mjs  -  El personal del propio restaurante
//
//  A la cocinera y al que reparte también se les da almuerzo, y ellos PAGAN DE
//  UNA, de su bolsillo. O sea que sí es una venta y esa plata sí entra a la
//  caja -- pero NO son un cliente al que se le pasa una cuenta a fin de mes.
//
//  Lo de la cuenta de cobro cambió: ella pidió que al restaurante propio
//  también se le pueda pasar una, y ahora se puede. Lo que NO cambia es lo
//  otro: que cada plato de la casa entrara "a crédito" -- o sea como plata que
//  alguien debe, cuando ya la pagaron -- haría que esa plata nunca apareciera
//  en la caja y el cuadre no diera nunca. Por eso nacen "pagó de una".
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  esLaCasa, empresasClientes, cuentaDeCobro, ventasEnRango,
  sumarLoDeContado, sumarLoDeLaEmpresa, formaDeCobro,
  A_CREDITO, DE_CONTADO,
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

prueba("pero solo entra lo que esté a crédito, como en cualquier empresa", () => {
  // En la casa los platos nacen "pagó de una", así que la cuenta sale vacía
  // mientras ella no marque a crédito lo que sí va a cobrar. Es correcto, y
  // la pantalla lo explica en vez de mostrar un $ 0 mudo.
  const d = negocio();
  const casa = d.empresas.find((e) => e.codigo === "CASA");
  const cuenta = cuentaDeCobro([almuerzoDeLaCasa(DE_CONTADO)], 2026, 8, 1, casa);
  igual(cuenta.total, 0, "lo que ya se pagó no se cobra otra vez");
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
