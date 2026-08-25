// ============================================================================
//  habitos.test.mjs  -  Las pruebas de los atajos.
//
//  Estos atajos anotan pedidos de un toque, o sea que si se equivocan le
//  cobran a alguien algo que no pidió. Por eso importa que "lo de siempre"
//  sea de verdad lo de siempre y no un antojo de un día suelto.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  pedidoHabitual, tieneCostumbre, platosFrecuentes, loDelDiaAnterior,
  yaAnotadasHoy, cuantoValdria,
} from "../js/nucleo/habitos.js";

let n = 0;
function renglon(fecha, empresa, persona, producto, precio = 12000, cantidad = 1) {
  n++;
  return {
    id: "h" + n, fecha, empresaCome: empresa, empresaFactura: empresa,
    persona, producto, cantidad, precioUnitario: precio,
    facturable: true, observacion: "", revisar: [],
  };
}

function datosDePrueba() {
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [{ codigo: "AGRO", razonSocial: "AGRO", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true }],
    productos: [
      { nombre: "ALMUERZO", activo: true },
      { nombre: "COCA COLA", activo: true },
      { nombre: "POSTRE", activo: true },
      { nombre: "PLATO APAGADO", activo: false },
      { nombre: "SIN PRECIO", activo: true },
    ],
    precios: {
      "ALMUERZO|AGRO": 12000,
      "COCA COLA|AGRO": 7000,
      "POSTRE|AGRO": 5000,
      "PLATO APAGADO|AGRO": 9000,
    },
    personas: [
      { nombre: "ANA", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true },
      { nombre: "BETO", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true },
    ],
    consumos: [
      // ANA pide almuerzo todos los días, y un día se antojó de postre.
      renglon("2026-08-03", "AGRO", "ANA", "ALMUERZO"),
      renglon("2026-08-04", "AGRO", "ANA", "ALMUERZO"),
      renglon("2026-08-05", "AGRO", "ANA", "ALMUERZO"),
      renglon("2026-08-06", "AGRO", "ANA", "ALMUERZO"),
      renglon("2026-08-06", "AGRO", "ANA", "POSTRE", 5000),
      // BETO siempre pide almuerzo y gaseosa.
      renglon("2026-08-03", "AGRO", "BETO", "ALMUERZO"),
      renglon("2026-08-03", "AGRO", "BETO", "COCA COLA", 7000),
      renglon("2026-08-05", "AGRO", "BETO", "ALMUERZO"),
      renglon("2026-08-05", "AGRO", "BETO", "COCA COLA", 7000),
    ],
    cuadres: {},
  };
}

// ---------------------------------------------------------------------------
grupo("Lo de siempre");

prueba("saca el pedido que más repite, no el último", () => {
  // El último día ANA pidió almuerzo + postre. Su costumbre es solo almuerzo.
  const h = pedidoHabitual(datosDePrueba(), "AGRO", "ANA");
  igual(h.platos.length, 1);
  igual(h.platos[0].producto, "ALMUERZO");
  igual(h.veces, 3, "3 de sus 4 días");
  igual(h.dias, 4);
});

prueba("un pedido de varios platos se toma completo", () => {
  const h = pedidoHabitual(datosDePrueba(), "AGRO", "BETO");
  igual(h.platos.length, 2);
  igual(h.platos.map((p) => p.producto).sort(), ["ALMUERZO", "COCA COLA"]);
  igual(h.veces, 2);
});

prueba("no le importa el orden en que se anotaron los platos", () => {
  const datos = datosDePrueba();
  // El mismo pedido de BETO pero anotado al revés otro día.
  datos.consumos.push(
    renglon("2026-08-07", "AGRO", "BETO", "COCA COLA", 7000),
    renglon("2026-08-07", "AGRO", "BETO", "ALMUERZO")
  );
  const h = pedidoHabitual(datos, "AGRO", "BETO");
  igual(h.veces, 3, "los 3 días son el mismo pedido");
});

prueba("no cuenta el día que se está registrando", () => {
  const datos = datosDePrueba();
  // Hoy le anotaron algo raro. No puede volverse su costumbre.
  datos.consumos.push(renglon("2026-08-10", "AGRO", "ANA", "POSTRE", 5000));
  const h = pedidoHabitual(datos, "AGRO", "ANA", "2026-08-10");
  igual(h.platos[0].producto, "ALMUERZO");
  igual(h.dias, 4, "el día de hoy no entra en la cuenta");
});

prueba("de alguien que nunca ha venido no hay costumbre", () => {
  igual(pedidoHabitual(datosDePrueba(), "AGRO", "NADIE"), null);
  cierto(!tieneCostumbre(null));
});

prueba("solo mira a esa persona en esa empresa", () => {
  const datos = datosDePrueba();
  datos.personas.push({ nombre: "ANA", empresaCome: "MGP", empresaFactura: "MGP", activa: true });
  datos.consumos.push(
    renglon("2026-08-03", "MGP", "ANA", "POSTRE", 5000),
    renglon("2026-08-04", "MGP", "ANA", "POSTRE", 5000)
  );
  const h = pedidoHabitual(datos, "AGRO", "ANA");
  igual(h.platos[0].producto, "ALMUERZO", "la ANA de MGP es otra persona");
});

prueba("con dos días iguales ya hay costumbre", () => {
  cierto(tieneCostumbre(pedidoHabitual(datosDePrueba(), "AGRO", "BETO")));
});

// ---------------------------------------------------------------------------
grupo("Los platos que más se piden");

prueba("los ordena por cuántas veces se pidieron", () => {
  const f = platosFrecuentes(datosDePrueba(), "AGRO");
  igual(f[0].producto, "ALMUERZO");
  igual(f[0].veces, 6);
  igual(f[1].producto, "COCA COLA");
});

prueba("les pone el precio de esa empresa", () => {
  const f = platosFrecuentes(datosDePrueba(), "AGRO");
  igual(f[0].precio, 12000);
});

prueba("NO ofrece platos sin precio", () => {
  // Ofrecer de un toque algo que entra en $ 0 seria empujarla al error.
  const datos = datosDePrueba();
  datos.consumos.push(
    renglon("2026-08-03", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-04", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-05", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-06", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-07", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-08", "AGRO", "ANA", "SIN PRECIO", 0),
    renglon("2026-08-09", "AGRO", "ANA", "SIN PRECIO", 0)
  );
  const f = platosFrecuentes(datos, "AGRO");
  cierto(!f.some((p) => p.producto === "SIN PRECIO"), "no puede ofrecer lo que vale $ 0");
});

prueba("NO ofrece platos apagados del catálogo", () => {
  const datos = datosDePrueba();
  for (let i = 0; i < 9; i++) {
    datos.consumos.push(renglon("2026-08-0" + (i % 9), "AGRO", "ANA", "PLATO APAGADO", 9000));
  }
  const f = platosFrecuentes(datos, "AGRO");
  cierto(!f.some((p) => p.producto === "PLATO APAGADO"));
});

prueba("respeta el límite que se le pida", () => {
  igual(platosFrecuentes(datosDePrueba(), "AGRO", { limite: 1 }).length, 1);
});

// ---------------------------------------------------------------------------
grupo("Los mismos de ayer");

prueba("trae el último día CON registros, no el de ayer en el calendario", () => {
  // Si ayer fue domingo no hay nada, y no por eso puede quedarse sin lista.
  const ayer = loDelDiaAnterior(datosDePrueba(), "AGRO", "2026-08-10");
  igual(ayer.fecha, "2026-08-06", "el 7, 8 y 9 no tienen nada");
});

prueba("trae a cada persona con lo que pidió ese día", () => {
  const ayer = loDelDiaAnterior(datosDePrueba(), "AGRO", "2026-08-04");
  igual(ayer.fecha, "2026-08-03");
  igual(ayer.gente.length, 2);
  const beto = ayer.gente.find((g) => g.persona === "BETO");
  igual(beto.platos.length, 2);
});

prueba("si no hay ningún día anterior, no inventa nada", () => {
  igual(loDelDiaAnterior(datosDePrueba(), "AGRO", "2026-08-01"), null);
});

prueba("sabe a quién ya le anotaron hoy, para no repetirla", () => {
  const ya = yaAnotadasHoy(datosDePrueba(), "AGRO", "2026-08-06");
  cierto(ya.has("ANA"));
  cierto(!ya.has("BETO"));
});

// ---------------------------------------------------------------------------
grupo("Cuánto valdría");

prueba("suma con los precios de hoy", () => {
  const r = cuantoValdria(datosDePrueba(),
    [{ producto: "ALMUERZO", cantidad: 1 }, { producto: "COCA COLA", cantidad: 2 }], "AGRO");
  igual(r.total, 12000 + 14000);
  igual(r.faltaPrecio, false);
});

prueba("avisa si a algún plato le falta el precio", () => {
  const r = cuantoValdria(datosDePrueba(), [{ producto: "SIN PRECIO", cantidad: 1 }], "AGRO");
  igual(r.faltaPrecio, true);
});
