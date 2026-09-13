// ============================================================================
//  como-paga.test.mjs  -  Cómo paga toda la persona, de una sola vez
//
//  Antes la forma de cobro se marcaba plato por plato. Si alguien pedía
//  almuerzo, gaseosa y postre y pagaba de una, eran tres toques a las seis de
//  la mañana -- y el tercero se olvida. Ese plato olvidado se le cobra a la
//  empresa en la quincena cuando la persona YA lo pagó: cobrado dos veces, y
//  sin que nada lo dijera.
//
//  Lo que más se puede dañar aquí es el alcance: tocar renglones de otro día,
//  de otra persona, o de alguien que se llama igual en otra empresa.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  comoPagaLaPersona, formaDeCobro, A_CREDITO, DE_CONTADO, CORTESIA,
} from "../js/nucleo/calculos.js";
import {
  datosVacios, nuevoConsumo, ponerFormaDeCobro, ponerComoPagaLaPersona,
} from "../js/nucleo/modelo.js";

grupo("Cómo paga una persona");

function plato(extra = {}) {
  return nuevoConsumo({
    fecha: "2026-08-03", empresa: "MGP", persona: "JUAN", producto: "ALMUERZO",
    cantidad: 1, precioUnitario: 12000, ...extra,
  });
}

function negocio(...platos) {
  const d = datosVacios();
  d.consumos = platos;
  return d;
}

const JUAN = { empresa: "MGP", persona: "JUAN", fecha: "2026-08-03" };

// --- leer -------------------------------------------------------------------

prueba("sin nada anotado no dice ninguna forma", () => {
  igual(comoPagaLaPersona([], JUAN), null);
});

prueba("si todos sus platos van igual, dice esa forma", () => {
  const d = negocio(plato({ cobro: DE_CONTADO }), plato({ cobro: DE_CONTADO, producto: "GASEOSA" }));
  igual(comoPagaLaPersona(d.consumos, JUAN), DE_CONTADO);
});

prueba("un renglón viejo sin campo 'cobro' cuenta como a crédito", () => {
  // Los 1135 renglones que vinieron del Excel no tienen el campo.
  const d = negocio(plato());
  igual(comoPagaLaPersona(d.consumos, JUAN), A_CREDITO);
});

prueba("mezclado devuelve null, y eso NO es un error", () => {
  // Es un caso de verdad: el almuerzo lo paga la empresa y la gaseosa él.
  // La pantalla tiene que decirlo en vez de escoger una por su cuenta.
  const d = negocio(plato(), plato({ cobro: DE_CONTADO, producto: "GASEOSA" }));
  igual(comoPagaLaPersona(d.consumos, JUAN), null);
});

prueba("no mira los platos de OTRO día", () => {
  const d = negocio(plato({ cobro: DE_CONTADO }), plato({ fecha: "2026-08-04" }));
  igual(comoPagaLaPersona(d.consumos, JUAN), DE_CONTADO, "el del 4 no cuenta");
});

prueba("no mira a alguien que se llama igual en OTRA empresa", () => {
  // La llave es (empresa, nombre): hay 80 nombres repetidos entre empresas y
  // son personas distintas.
  const d = negocio(plato({ cobro: DE_CONTADO }), plato({ empresa: "AGRO" }));
  igual(comoPagaLaPersona(d.consumos, JUAN), DE_CONTADO);
});

// --- cambiar ----------------------------------------------------------------

prueba("cambia TODOS los platos de esa persona ese día", () => {
  const d = negocio(plato(), plato({ producto: "GASEOSA" }), plato({ producto: "POSTRE" }));
  igual(ponerComoPagaLaPersona(d, JUAN, DE_CONTADO), 3, "cambiaron los tres");
  igual(d.consumos.map(formaDeCobro), [DE_CONTADO, DE_CONTADO, DE_CONTADO]);
});

prueba("solo cuenta los que DE VERDAD cambiaron", () => {
  // El número se le muestra a ella ("3 platos"). Si contara los que ya
  // estaban, diría una cantidad que no pasó.
  const d = negocio(plato({ cobro: DE_CONTADO }), plato({ producto: "GASEOSA" }));
  igual(ponerComoPagaLaPersona(d, JUAN, DE_CONTADO), 1);
});

prueba("no le toca el día de mañana", () => {
  const d = negocio(plato(), plato({ fecha: "2026-08-04" }));
  ponerComoPagaLaPersona(d, JUAN, DE_CONTADO);
  igual(formaDeCobro(d.consumos[1]), A_CREDITO, "el del 4 se queda como estaba");
});

prueba("no le toca al tocayo de otra empresa", () => {
  const d = negocio(plato(), plato({ empresa: "AGRO" }));
  ponerComoPagaLaPersona(d, JUAN, DE_CONTADO);
  igual(formaDeCobro(d.consumos[1]), A_CREDITO, "el JUAN de AGRO es otra persona");
});

prueba("pasar a cortesía deja el renglón sin facturar", () => {
  // "facturable" es el campo viejo que todavía leen los datos del Excel.
  // Escribir solo "cobro" los dejaría diciendo cosas distintas.
  const d = negocio(plato());
  ponerComoPagaLaPersona(d, JUAN, CORTESIA);
  igual(d.consumos[0].facturable, false);
  igual(formaDeCobro(d.consumos[0]), CORTESIA);
});

prueba("y volver de cortesía lo deja facturable otra vez", () => {
  const d = negocio(plato({ cobro: CORTESIA, facturable: false }));
  ponerComoPagaLaPersona(d, JUAN, A_CREDITO);
  igual(d.consumos[0].facturable, true);
});

prueba("un plato sin precio en cortesía deja de salir en rojo", () => {
  // Un plato sin precio es un aviso... salvo si es cortesía, que vale cero a
  // propósito. Al cambiar la forma hay que volver a mirar eso.
  const d = negocio(plato({ precioUnitario: 0 }));
  cierto(d.consumos[0].revisar.includes("SIN_PRECIO"), "primero sí avisa");
  ponerComoPagaLaPersona(d, JUAN, CORTESIA);
  igual(d.consumos[0].revisar, [], "de cortesía ya no");
});

prueba("un renglón suelto también se puede cambiar solo", () => {
  const c = plato();
  ponerFormaDeCobro(c, DE_CONTADO);
  igual(formaDeCobro(c), DE_CONTADO);
  igual(c.facturable, true, "de contado SÍ es venta");
});
