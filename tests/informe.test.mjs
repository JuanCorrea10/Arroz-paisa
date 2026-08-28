// ============================================================================
//  informe.test.mjs
//
//  El informe completo de una empresa es lo ÚNICO que ve el supervisor.
//  Si aquí sobra un renglón de otra empresa, se filtró información que no le
//  corresponde. Si falta uno, la empresa va a reclamar que le están cobrando
//  algo que no aparece por ningún lado.
//
//  Las dos cosas son graves, así que las dos se prueban.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  informeCompletoDeEmpresa, sumar, subtotal, comandasDelDia, informePorPersona,
  indicePorCodigo, DE_CONTADO,
} from "../js/nucleo/calculos.js";

// ---------------------------------------------------------------------------
//  Un negocio chiquito, inventado, donde se puede contar todo a mano.
// ---------------------------------------------------------------------------

const ALMUERZO = 12000;
const CORRIENTE = 10000;

function consumo(fecha, empresa, persona, producto, precio, cantidad = 1, extra = {}) {
  return {
    fecha,
    empresa: empresa,
    persona,
    producto,
    precioUnitario: precio,
    cantidad,
    ...extra,
  };
}

function negocio() {
  return {
    empresas: [
      { codigo: "MGP", razonSocial: "Metalúrgica MGP S.A.S.", ultimoDiaQ1: 15 },
      { codigo: "AGRO", razonSocial: "Agroindustrias del Tolima", ultimoDiaQ1: 15 },
    ],
    personas: [
      { nombre: "ANA GOMEZ", empresa: "MGP" },
      { nombre: "LUIS PEÑA", empresa: "MGP" },
      { nombre: "ANA GOMEZ", empresa: "AGRO" },
    ],
    productos: [{ nombre: "ALMUERZO" }, { nombre: "CORRIENTE" }],
    precios: {},
    config: { acreedor: { nombre: "Arroz Paisa", nit: "900.123.456-7", ciudad: "Ibagué" } },
    consumos: [
      // MGP, primera quincena
      consumo("2026-08-03", "MGP", "ANA GOMEZ", "ALMUERZO", ALMUERZO),
      consumo("2026-08-03", "MGP", "LUIS PEÑA", "CORRIENTE", CORRIENTE),
      consumo("2026-08-10", "MGP", "ANA GOMEZ", "ALMUERZO", ALMUERZO, 2),
      // MGP, segunda quincena
      consumo("2026-08-20", "MGP", "LUIS PEÑA", "ALMUERZO", ALMUERZO),
      // Un renglón que NO se cobra: comió, pero la empresa no lo paga.
      consumo("2026-08-20", "MGP", "ANA GOMEZ", "CORRIENTE", CORRIENTE, 1, {
        facturable: false,
      }),
      // La tocaya de la otra empresa. No puede aparecer en el informe de MGP.
      consumo("2026-08-03", "AGRO", "ANA GOMEZ", "ALMUERZO", ALMUERZO),
      consumo("2026-08-21", "AGRO", "ANA GOMEZ", "ALMUERZO", ALMUERZO),
      // Otro mes: tampoco entra.
      consumo("2026-07-15", "MGP", "ANA GOMEZ", "ALMUERZO", ALMUERZO),
    ],
  };
}

// ---------------------------------------------------------------------------
grupo("Informe de empresa: qué entra y qué no");

prueba("solo entra lo de esa empresa, de ese mes", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 8);

  // 5 renglones de MGP en agosto (uno de ellos no se cobra).
  igual(i.totales.renglones, 5);

  const fechas = i.dias.map((d) => d.fecha);
  igual(fechas, ["2026-08-03", "2026-08-10", "2026-08-20"]);

  // Ni un solo renglón puede venir de otra empresa. Esto es lo que hace que
  // el archivo se pueda mandar sin miedo.
  const deOtra = i.dias.flatMap((d) => d.renglones).filter((c) => c.empresa !== "MGP");
  igual(deOtra.length, 0, "se coló un renglón de otra empresa");

  // Y la tocaya de AGRO no puede salir en la lista de personas de MGP.
  igual(i.personas.length, 2);
  igual(i.personas.map((p) => p.persona).sort(), ["ANA GOMEZ", "LUIS PEÑA"]);
});

prueba("el informe de AGRO no ve nada de MGP", () => {
  const i = informeCompletoDeEmpresa(negocio(), "AGRO", 2026, 8);
  igual(i.totales.renglones, 2);
  igual(i.personas.length, 1);
  igual(i.totales.mes, ALMUERZO * 2);
  cierto(
    i.dias.flatMap((d) => d.renglones).every((c) => c.empresa === "AGRO"),
    "el informe de AGRO trae renglones de otra empresa"
  );
});

// ---------------------------------------------------------------------------
grupo("Informe de empresa: que las cuentas den");

prueba("lo que no se cobra aparece, pero no suma", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 8);

  // El renglón del 20 que no se cobra tiene que VERSE (el supervisor necesita
  // saber que esa persona sí comió) pero no puede sumarle un peso a la cuenta.
  const dia20 = i.dias.find((d) => d.fecha === "2026-08-20");
  igual(dia20.renglones.length, 2, "el renglón que no se cobra desapareció");
  igual(dia20.total, ALMUERZO, "el renglón que no se cobra está sumando");

  // Total del mes: 12.000 + 10.000 + 24.000 + 12.000 = 58.000
  igual(i.totales.mes, 58000);
  igual(i.totales.q1, ALMUERZO + CORRIENTE + ALMUERZO * 2);
  igual(i.totales.q2, ALMUERZO);
  igual(i.totales.q1 + i.totales.q2, i.totales.mes, "las quincenas no dan el mes");
});

prueba("las tres tablas del informe dan el mismo total", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 8);

  const porPlato = i.platos.reduce((a, p) => a + p.total, 0);
  const porPersona = i.personas.reduce((a, p) => a + p.mes, 0);
  const porDia = i.dias.reduce((a, d) => a + d.total, 0);

  // Si estas tres no coinciden, el supervisor encuentra tres números distintos
  // en el mismo documento y ya no le cree a ninguno.
  igual(porPlato, i.totales.mes, "la tabla de platos no cuadra");
  igual(porPersona, i.totales.mes, "la tabla de personas no cuadra");
  igual(porDia, i.totales.mes, "el día por día no cuadra");
});

prueba("el mismo plato a dos precios no se junta", () => {
  const datos = negocio();
  // A mitad de mes subió el almuerzo.
  datos.consumos.push(consumo("2026-08-25", "MGP", "LUIS PEÑA", "ALMUERZO", 13000));
  const i = informeCompletoDeEmpresa(datos, "MGP", 2026, 8);

  const almuerzos = i.platos.filter((p) => p.producto === "ALMUERZO");
  igual(almuerzos.length, 2, "juntó dos precios distintos en un solo renglón");
  igual(almuerzos.map((p) => p.precio).sort((a, b) => a - b), [12000, 13000]);
  igual(i.totales.mes, 58000 + 13000);
});

prueba("las cantidades cuentan, no los renglones", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 8);
  // 1 almuerzo + 1 corriente + 2 almuerzos + 1 almuerzo = 5 platos cobrables
  igual(i.totales.platos, 5);
});

prueba("una empresa que no existe avisa, no devuelve vacío", () => {
  let reclamo = "";
  try {
    informeCompletoDeEmpresa(negocio(), "NOEXISTE", 2026, 8);
  } catch (e) {
    reclamo = e.message;
  }
  // Devolver un informe vacío sería peor: se mandaría un PDF en blanco sin
  // que nadie se entere de que la empresa estaba mal escrita.
  cierto(reclamo.length > 0, "no avisó que la empresa no existe");
});

prueba("un mes sin nada da un informe vacío pero válido", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 12);
  igual(i.totales.mes, 0);
  igual(i.totales.renglones, 0);
  igual(i.dias.length, 0);
  igual(i.platos.length, 0);
  // La empresa y el acreedor sí tienen que venir: el PDF los pinta en la
  // portada aunque no haya un solo consumo.
  igual(i.empresa.codigo, "MGP");
  igual(i.acreedor.nombre, "Arroz Paisa");
});

prueba("las notas del pedido viajan con el renglón", () => {
  const datos = negocio();
  datos.consumos.push(
    consumo("2026-08-04", "MGP", "ANA GOMEZ", "ALMUERZO", ALMUERZO, 1, {
      observacion: "Sin verduras",
    })
  );
  const i = informeCompletoDeEmpresa(datos, "MGP", 2026, 8);
  const dia = i.dias.find((d) => d.fecha === "2026-08-04");
  igual(dia.renglones[0].observacion, "Sin verduras");
  igual(dia.notas.length, 1, "la nota no llegó a la lista del día");
});

prueba("dentro de cada día las personas salen en orden", () => {
  const i = informeCompletoDeEmpresa(negocio(), "MGP", 2026, 8);
  const dia3 = i.dias.find((d) => d.fecha === "2026-08-03");
  igual(dia3.renglones.map((c) => c.persona), ["ANA GOMEZ", "LUIS PEÑA"]);
});

// ---------------------------------------------------------------------------
grupo("Las comandas del día, para el papel que se le manda a la gente");

prueba("agrupa por persona, no por renglón", () => {
  // El 3 de agosto en MGP comieron dos personas, un plato cada una.
  const c = comandasDelDia(negocio().consumos, "2026-08-03", "MGP");
  igual(c.length, 2);
  igual(c.map((x) => x.persona), ["ANA GOMEZ", "LUIS PEÑA"], "y en orden");
  igual(c[0].platos.length, 1);
});

prueba("una persona con dos platos es UNA comanda con los dos", () => {
  const datos = negocio();
  datos.consumos.push(consumo("2026-08-03", "MGP", "ANA GOMEZ", "CORRIENTE", CORRIENTE));
  const c = comandasDelDia(datos.consumos, "2026-08-03", "MGP");
  igual(c.length, 2, "siguen siendo dos personas");
  const ana = c.find((x) => x.persona === "ANA GOMEZ");
  igual(ana.platos.length, 2);
  igual(ana.total, ALMUERZO + CORRIENTE);
});

prueba("no se cuela nadie de otra empresa", () => {
  // Ese mismo día comió la tocaya de AGRO. En el papel de MGP no puede salir.
  const c = comandasDelDia(negocio().consumos, "2026-08-03", "MGP");
  cierto(c.every((x) => x.empresa === "MGP"));
  igual(c.length, 2, "la de AGRO se quedó afuera");
});

prueba("separa lo que paga la empresa de lo que la persona pagó de una", () => {
  const datos = negocio();
  datos.consumos.push(
    consumo("2026-08-03", "MGP", "LUIS PEÑA", "ALMUERZO", ALMUERZO, 1, { cobro: DE_CONTADO })
  );
  const luis = comandasDelDia(datos.consumos, "2026-08-03", "MGP")
    .find((x) => x.persona === "LUIS PEÑA");
  igual(luis.total, CORRIENTE + ALMUERZO, "lo llevó todo");
  igual(luis.aLaEmpresa, CORRIENTE, "pero a la empresa solo se le cobra lo de crédito");
  igual(luis.deContado, ALMUERZO, "y esto ya está en la caja");
});

prueba("una cortesía sale en la lista pero no suma", () => {
  // El 20 de agosto Ana comió un corriente que no se cobra.
  const ana = comandasDelDia(negocio().consumos, "2026-08-20", "MGP")
    .find((x) => x.persona === "ANA GOMEZ");
  igual(ana.platos.length, 1, "el plato SÍ aparece: comió ese día");
  igual(ana.total, 0, "pero no vale nada");
});

prueba("sin empresa trae el día entero, de todas", () => {
  const c = comandasDelDia(negocio().consumos, "2026-08-03", null);
  igual(c.length, 2, "ANA (que está en las dos) y LUIS");
});

// ---------------------------------------------------------------------------
grupo("Consumo por persona: lo del día, además de la quincena y el mes");

prueba("sin pedir día, la columna del día queda en cero", () => {
  const d = negocio();
  const filas = informePorPersona(d.consumos, 2026, 8, indicePorCodigo(d.empresas), "MGP");
  cierto(filas.every((f) => f.dia === 0));
});

prueba("con un día, cada persona trae lo de ESE día", () => {
  const d = negocio();
  const filas = informePorPersona(
    d.consumos, 2026, 8, indicePorCodigo(d.empresas), "MGP", "2026-08-10");
  const ana = filas.find((f) => f.persona === "ANA GOMEZ");
  const luis = filas.find((f) => f.persona === "LUIS PEÑA");
  igual(ana.dia, ALMUERZO * 2, "el 10 pidió dos almuerzos");
  igual(luis.dia, 0, "Luis no comió ese día, pero sigue en la lista");
  igual(luis.mes, CORRIENTE + ALMUERZO, "con su mes completo");
});

prueba("lo del día nunca puede pasarse de lo del mes", () => {
  const d = negocio();
  const filas = informePorPersona(
    d.consumos, 2026, 8, indicePorCodigo(d.empresas), "MGP", "2026-08-10");
  cierto(filas.every((f) => f.dia <= f.mes));
});
