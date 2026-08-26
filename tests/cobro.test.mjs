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
  indicePorCodigo,
} from "../js/nucleo/calculos.js";

const PRECIO = 12000;

function renglon(cobro, extra = {}) {
  return {
    fecha: "2026-08-05",
    empresaCome: "MGP",
    empresaFactura: "MGP",
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
      { nombre: "JUAN GOMEZ", empresaCome: "MGP", empresaFactura: "MGP" },
      { nombre: "ANA RUIZ", empresaCome: "MGP", empresaFactura: "MGP" },
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
