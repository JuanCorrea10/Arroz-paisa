// ============================================================================
//  calculos.test.mjs
//
//  Pruebas de los pedazos sueltos, con datos inventados chiquitos.
//  Aquí probamos sobre todo LOS BORDES: el día del corte, el día siguiente,
//  meses distintos, tocayos en dos empresas, gente que no paga.
//  Los bordes son donde viven los bugs.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";

import {
  pesos, numero, esFechaISO, diaDe, mesDe, anioDe, fechaCorta, fechaLarga,
  diasDelMes, normalizar, paraBuscar, coincide, aEntero, nombreMes,
} from "../js/nucleo/formato.js";

import {
  clavePersona, claveFactura, quincenaDe, rangoQuincena, subtotal, sumar,
  delMes, deQuincena, contarFacturas, facturasPorEmpresa, informeDia,
  informeCocina, informePorPersona, cuentaDeCobro, informeCuadre,
  revisarConsumo, indicePorCodigo, precioDe, personasDe, clavePrecio,
  fechaDeCobro, ponerFechaDeCobro, fueraDelRango,
} from "../js/nucleo/calculos.js";

import { revisarQuincenas } from "../js/nucleo/modelo.js";

// ---------------------------------------------------------------------------
grupo("Formato: cómo se ve la plata");

prueba("los pesos llevan punto de miles y no llevan centavos", () => {
  igual(pesos(11075000), "$ 11.075.000");
  igual(pesos(1000), "$ 1.000");
  igual(pesos(999), "$ 999");
  igual(pesos(0), "$ 0");
  igual(pesos(12000.4), "$ 12.000");
  igual(pesos(-5000), "-$ 5.000");
  igual(pesos(null), "$ 0");
  igual(pesos(undefined), "$ 0");
  igual(numero(488000), "488.000");
});

prueba("las fechas se ven en español y no se corren de día", () => {
  cierto(esFechaISO("2026-08-20"));
  cierto(!esFechaISO("20/08/2026"), "adentro solo guardamos AAAA-MM-DD");
  cierto(!esFechaISO(""));
  igual(diaDe("2026-08-20"), 20);
  igual(mesDe("2026-08-20"), 8);
  igual(anioDe("2026-08-20"), 2026);
  igual(fechaCorta("2026-08-20"), "20/08/2026");
  igual(fechaLarga("2026-08-20"), "jueves 20 de agosto de 2026");
  igual(fechaLarga("2026-08-01"), "sábado 1 de agosto de 2026");
  igual(nombreMes(8), "Agosto");
});

prueba("los meses saben cuántos días tienen, hasta en año bisiesto", () => {
  igual(diasDelMes(2026, 8), 31);
  igual(diasDelMes(2026, 2), 28);
  igual(diasDelMes(2028, 2), 29, "2028 es bisiesto");
  igual(diasDelMes(2026, 4), 30);
});

prueba("normalizar limpia pero NO borra tildes ni la eñe", () => {
  igual(normalizar("  juan   perez  "), "JUAN PEREZ");
  igual(normalizar("Alejandro Muñoz"), "ALEJANDRO MUÑOZ");
  igual(normalizar(null), "");
  igual(normalizar(42), "42");
});

prueba("para buscar sí quitamos tildes, para que encuentre escribiendo rápido", () => {
  igual(paraBuscar("Alejandro Muñoz"), "ALEJANDRO MUNOZ");
  cierto(coincide("ALEJANDRO MUÑOZ", "munoz"), "escribe sin eñe y lo encuentra");
  cierto(coincide("ALEJANDRO MUÑOZ", "alej mun"), "escribe pedazos sueltos");
  cierto(coincide("MARÍA JOSÉ GÓMEZ", "maria jose"));
  cierto(!coincide("ALEJANDRO MUÑOZ", "pedro"));
  cierto(coincide("CUALQUIERA", ""), "sin búsqueda, sale todo");
});

prueba("aEntero aguanta lo que sea que escriba", () => {
  igual(aEntero(12000), 12000);
  igual(aEntero("12000"), 12000);
  igual(aEntero("12.000"), 12000, "con punto de miles");
  igual(aEntero("$ 12.000"), 12000, "con el símbolo de pesos");
  igual(aEntero(""), 0);
  igual(aEntero("hola"), 0);
  igual(aEntero(null, 1), 1, "puede tener un valor por defecto");
});

// ---------------------------------------------------------------------------
grupo("Quincenas: el borde exacto del corte");

const MGP = { codigo: "MGP", ultimoDiaQ1: 13, ultimoDiaQ2: 31 };
const AGRO = { codigo: "AGRO", ultimoDiaQ1: 14, ultimoDiaQ2: 31 };

prueba("MGP corta el 13 y AGRO el 14: el mismo día cae en quincenas distintas", () => {
  igual(quincenaDe("2026-08-13", MGP), 1, "el 13 todavía es Q1 para MGP");
  igual(quincenaDe("2026-08-14", MGP), 2, "el 14 ya es Q2 para MGP");
  igual(quincenaDe("2026-08-14", AGRO), 1, "pero para AGRO el 14 sigue siendo Q1");
  igual(quincenaDe("2026-08-15", AGRO), 2);
  igual(quincenaDe("2026-08-01", MGP), 1);
  igual(quincenaDe("2026-08-31", MGP), 2);
});

prueba("sin fecha o sin empresa, la quincena es null (no se inventa un 1)", () => {
  igual(quincenaDe("", MGP), null);
  igual(quincenaDe("no es fecha", MGP), null);
  igual(quincenaDe("2026-08-13", null), null);
  igual(quincenaDe("2026-08-13", {}), null);
});

prueba("el rango de días de cada quincena", () => {
  igual(rangoQuincena(2026, 8, 1, MGP), { desde: 1, hasta: 13 });
  igual(rangoQuincena(2026, 8, 2, MGP), { desde: 14, hasta: 31 });
  igual(rangoQuincena(2026, 8, 1, AGRO), { desde: 1, hasta: 14 });
  igual(rangoQuincena(2026, 8, 2, AGRO), { desde: 15, hasta: 31 });
  igual(rangoQuincena(2026, 2, 2, AGRO), { desde: 15, hasta: 28 }, "febrero acaba el 28");
});

// ---------------------------------------------------------------------------
grupo("El rango de la quincena se puede escribir entero, no solo el corte");

// El mes no siempre se cobra completo: hay meses en que la fábrica arranca el
// 3. La cuenta tiene que decir "del 3 al 14", porque el supervisor la cuadra
// contra la planilla de asistencia y dos días de diferencia le cuadran mal.
const PUNTERAS = {
  codigo: "PUNTERAS", primerDiaQ1: 3, ultimoDiaQ1: 14, primerDiaQ2: 15, ultimoDiaQ2: 30,
};

prueba("una empresa vieja, sin los días nuevos puestos, sigue dando igual", () => {
  igual(rangoQuincena(2026, 8, 1, { ultimoDiaQ1: 14 }), { desde: 1, hasta: 14 });
  igual(rangoQuincena(2026, 8, 2, { ultimoDiaQ1: 14 }), { desde: 15, hasta: 31 });
});

prueba("con los cuatro días puestos, sale lo que se escribió", () => {
  igual(rangoQuincena(2026, 8, 1, PUNTERAS), { desde: 3, hasta: 14 });
  igual(rangoQuincena(2026, 8, 2, PUNTERAS), { desde: 15, hasta: 30 }, "aunque agosto tenga 31");
});

prueba("el rango se recorta al mes, nunca se sale", () => {
  igual(rangoQuincena(2026, 2, 2, PUNTERAS), { desde: 15, hasta: 28 }, "febrero manda");
  igual(rangoQuincena(2026, 8, 2, { ultimoDiaQ1: 14, ultimoDiaQ2: 45 }).hasta, 31);
  igual(rangoQuincena(2026, 8, 1, { primerDiaQ1: 99, ultimoDiaQ1: 14 }).desde, 1,
        "un día imposible se ignora, no rompe la cuenta");
});

prueba("el CORTE no se mueve por escribir el rango: ningún renglón se pierde", () => {
  // Esto es lo que no puede pasar nunca. Si el día 1 dejara de ser Q1 solo
  // porque el rango dice que empieza el 3, ese almuerzo no saldría en NINGUNA
  // de las dos cuentas y se cobraría de menos, calladamente.
  igual(quincenaDe("2026-08-01", PUNTERAS), 1, "el 1 sigue siendo Q1 aunque el rango arranque el 3");
  igual(quincenaDe("2026-08-31", PUNTERAS), 2, "y el 31 sigue siendo Q2 aunque el rango acabe el 30");
});

prueba("lo que se cobra por fuera del rango escrito se puede señalar", () => {
  const consumos = [
    { fecha: "2026-08-01", empresa: "PUNTERAS", persona: "ANA", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 },
    { fecha: "2026-08-05", empresa: "PUNTERAS", persona: "ANA", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 },
  ];
  const afuera = fueraDelRango(consumos, 2026, 8, 1, PUNTERAS);
  igual(afuera.length, 1, "solo el del día 1, que es antes del 3");
  igual(afuera[0].fecha, "2026-08-01");
  igual(fueraDelRango(consumos, 2026, 8, 1, AGRO).length, 0, "AGRO cobra el mes completo");
});

// ---------------------------------------------------------------------------
grupo("Los cuatro días de la quincena no se guardan si no tienen sentido");

prueba("los cuatro días normales pasan", () => {
  igual(revisarQuincenas({ primerDiaQ1: 1, ultimoDiaQ1: 14, primerDiaQ2: 15, ultimoDiaQ2: 31 }),
        { primerDiaQ1: 1, ultimoDiaQ1: 14, primerDiaQ2: 15, ultimoDiaQ2: 31 });
});

prueba("un rango al revés no se guarda", () => {
  cierto(revisarQuincenas({ primerDiaQ1: 14, ultimoDiaQ1: 3, primerDiaQ2: 15, ultimoDiaQ2: 31 }).malo);
  cierto(revisarQuincenas({ primerDiaQ1: 1, ultimoDiaQ1: 14, primerDiaQ2: 31, ultimoDiaQ2: 20 }).malo);
});

prueba("una quincena 2 que pisa a la 1 no se guarda: ese día se cobraría dos veces", () => {
  const r = revisarQuincenas({ primerDiaQ1: 1, ultimoDiaQ1: 14, primerDiaQ2: 14, ultimoDiaQ2: 31 });
  cierto(r.malo, "el 14 estaría en las dos");
  cierto(r.malo.includes("14"), "y el aviso dice cuál es el día");
});

prueba("un día que no existe no se guarda", () => {
  cierto(revisarQuincenas({ primerDiaQ1: 0, ultimoDiaQ1: 14, primerDiaQ2: 15, ultimoDiaQ2: 31 }).malo);
  cierto(revisarQuincenas({ primerDiaQ1: 1, ultimoDiaQ1: 14, primerDiaQ2: 15, ultimoDiaQ2: 40 }).malo);
});

// ---------------------------------------------------------------------------
grupo("La llave de una persona es EMPRESA + NOMBRE");

prueba("dos tocayos en empresas distintas son dos personas distintas", () => {
  const a = clavePersona("AGRO", "JUAN PEREZ");
  const b = clavePersona("BASARILI", "JUAN PEREZ");
  cierto(a !== b, "no se pueden confundir");
  igual(a, "AGRO|JUAN PEREZ");
  igual(clavePersona(" agro ", " juan   perez "), "AGRO|JUAN PEREZ", "y no importa cómo se escriba");
});

prueba("una factura es una persona un día, aunque pida 5 cosas", () => {
  const base = { fecha: "2026-08-20", empresa: "AGRO", persona: "JUAN PEREZ" };
  igual(claveFactura({ ...base, producto: "ALMUERZO" }), claveFactura({ ...base, producto: "GASEOSA" }));
  cierto(
    claveFactura(base) !== claveFactura({ ...base, fecha: "2026-08-21" }),
    "otro día es otra factura"
  );
  cierto(
    claveFactura(base) !== claveFactura({ ...base, empresa: "BASARILI" }),
    "el tocayo de la otra empresa es otra factura"
  );
});

// ---------------------------------------------------------------------------
grupo("Plata: el precio está congelado y el no facturable suma cero");

prueba("el subtotal usa el precio del renglón, no el del catálogo", () => {
  igual(subtotal({ cantidad: 2, precioUnitario: 12000 }), 24000);
  igual(subtotal({ cantidad: 1, precioUnitario: 12000, facturable: true }), 12000);
});

prueba("un renglón no facturable queda registrado pero suma cero", () => {
  const c = { cantidad: 3, precioUnitario: 12000, facturable: false };
  igual(subtotal(c), 0);
  igual(c.cantidad, 3, "la cantidad sigue ahí: hay que cocinarlo igual");
});

prueba("renglones incompletos no rompen la suma", () => {
  igual(subtotal({ cantidad: 1, precioUnitario: 0 }), 0);
  igual(subtotal({ cantidad: 0, precioUnitario: 12000 }), 0);
  igual(subtotal({}), 0);
  igual(sumar([]), 0);
});

// ---------------------------------------------------------------------------
//  Un mundo chiquito para probar los informes.
//  Dos meses a propósito, para cazar el bug de mezclar agosto con septiembre.
// ---------------------------------------------------------------------------

function mundo() {
  const empresas = [
    { codigo: "MGP", razonSocial: "INDUSTRIAS MGP", nit: "901404844", ultimoDiaQ1: 13, ultimoDiaQ2: 31, activa: true },
    { codigo: "AGRO", razonSocial: "BOTAS AGROINDUSTRIAL SAS", nit: "900.735.112 - 6", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
  ];
  const personas = [
    { nombre: "JUAN PEREZ", empresa: "AGRO", activa: true },
    { nombre: "JUAN PEREZ", empresa: "MGP", activa: true },
    { nombre: "ANA GOMEZ", empresa: "MGP", activa: true },
    { nombre: "PEDRO RUIZ", empresa: "MGP", activa: false },
  ];
  const productos = [{ nombre: "ALMUERZO", activo: true }, { nombre: "GASEOSA", activo: true }];
  const precios = {
    [clavePrecio("ALMUERZO", "MGP")]: 12000,
    [clavePrecio("ALMUERZO", "AGRO")]: 10000,
    [clavePrecio("GASEOSA", "MGP")]: 4000,
    [clavePrecio("GASEOSA", "AGRO")]: 4000,
  };
  const c = (fecha, empresa, persona, producto, cantidad, precioUnitario, extra = {}) => ({
    id: Math.random().toString(36).slice(2),
    fecha, empresa, persona, producto, cantidad, precioUnitario,
    facturable: true, observacion: "", revisar: [], ...extra,
  });
  const consumos = [
    // AGOSTO — Juan de AGRO pide dos cosas el mismo día: 1 factura, 2 renglones
    c("2026-08-10", "AGRO", "JUAN PEREZ", "ALMUERZO", 1, 10000),
    c("2026-08-10", "AGRO", "JUAN PEREZ", "GASEOSA", 1, 4000),
    // El tocayo de MGP el mismo día: otra factura distinta
    c("2026-08-10", "MGP", "JUAN PEREZ", "ALMUERZO", 1, 12000),
    // Ana es de MGP: su quincena se mide con el corte de MGP (el 15), no con
    // el de AGRO (el 14). Antes esta prueba era "come en AGRO pero se le cobra
    // a MGP"; eso ya no existe -- la empresa es una sola.
    c("2026-08-14", "MGP", "ANA GOMEZ", "ALMUERZO", 1, 12000),
    // Juan de AGRO el 14: para AGRO todavía es Q1
    c("2026-08-14", "AGRO", "JUAN PEREZ", "ALMUERZO", 1, 10000),
    // Un almuerzo que no se cobra
    c("2026-08-20", "MGP", "JUAN PEREZ", "ALMUERZO", 1, 12000, { facturable: false }),
    // SEPTIEMBRE — mismo día del mes, para ver si se mezcla con agosto
    c("2026-09-10", "AGRO", "JUAN PEREZ", "ALMUERZO", 1, 10000),
  ];
  return { version: 1, config: { anio: 2026, mes: 8, acreedor: {} }, empresas, personas, productos, precios, consumos, cuadres: {} };
}

const D = mundo();
const E = indicePorCodigo(D.empresas);

// ---------------------------------------------------------------------------
grupo("Los meses NO se mezclan (bug #5 del Excel)");

prueba("agosto trae 6 renglones y septiembre 1", () => {
  igual(delMes(D.consumos, 2026, 8).length, 6);
  igual(delMes(D.consumos, 2026, 9).length, 1);
});

prueba("la quincena 1 de AGRO en agosto NO incluye el 10 de septiembre", () => {
  const q1 = deQuincena(D.consumos, 2026, 8, 1, E.AGRO);
  igual(q1.length, 3, "solo los de agosto");
  igual(sumar(q1), 24000, "10.000 + 4.000 + 10.000");
  const q1sept = deQuincena(D.consumos, 2026, 9, 1, E.AGRO);
  igual(sumar(q1sept), 10000, "septiembre va aparte");
});

prueba("Ana se le cobra a MGP aunque coma en AGRO", () => {
  const q2mgp = deQuincena(D.consumos, 2026, 8, 2, E.MGP);
  cierto(q2mgp.some((c) => c.persona === "ANA GOMEZ"), "el 14 es Q2 para MGP");
  const q1agro = deQuincena(D.consumos, 2026, 8, 1, E.AGRO);
  cierto(!q1agro.some((c) => c.persona === "ANA GOMEZ"), "no le puede aparecer a AGRO");
});

// ---------------------------------------------------------------------------
grupo("Informes");

prueba("cocina cuenta el almuerzo que no se cobra", () => {
  const filas = informeCocina(D.consumos, "2026-08-20", ["MGP", "AGRO"]);
  igual(filas.length, 1);
  igual(filas[0].producto, "ALMUERZO");
  igual(filas[0].total, 1, "hay que cocinarlo aunque no se cobre");
  igual(filas[0].porEmpresa.AGRO, 0, "las empresas sin pedidos salen en cero, no ausentes");
});

prueba("cocina reparte por empresa y el total es la suma de las columnas", () => {
  const filas = informeCocina(D.consumos, "2026-08-10", ["MGP", "AGRO"]);
  const almuerzo = filas.find((f) => f.producto === "ALMUERZO");
  igual(almuerzo.porEmpresa.AGRO, 1);
  igual(almuerzo.porEmpresa.MGP, 1);
  igual(almuerzo.total, 2);
});

prueba("el resumen del día separa el mismo plato si tuvo precios distintos", () => {
  const informe = informeDia(D.consumos, "2026-08-10");
  const almuerzos = informe.filas.filter((f) => f.producto === "ALMUERZO");
  igual(almuerzos.length, 2, "uno a $10.000 y otro a $12.000, no se pueden juntar");
  igual(informe.total, 26000);
  igual(informe.renglones, 3);
  igual(informe.facturas, 2, "Juan de AGRO pidió 2 cosas: sigue siendo 1 factura");
});

prueba("el consumo por persona separa a los dos Juanes", () => {
  const filas = informePorPersona(D.consumos, 2026, 8, E);
  const juanes = filas.filter((f) => f.persona === "JUAN PEREZ");
  igual(juanes.length, 2, "son dos personas distintas");
  const juanAgro = juanes.find((f) => f.empresa === "AGRO");
  igual(juanAgro.q1, 24000, "10.000 + 4.000 el día 10, más 10.000 el 14");
  igual(juanAgro.q2, 0);
  igual(juanAgro.mes, 24000);
  const juanMgp = juanes.find((f) => f.empresa === "MGP");
  igual(juanMgp.q1, 12000, "el almuerzo del 20 no se cobra, no suma");
  igual(juanMgp.facturas, 2, "el del 10 y el del 20, aunque uno no se cobre");
});

prueba("la cuenta de cobro no mete lo que no se cobra", () => {
  const cuenta = cuentaDeCobro(D.consumos, 2026, 8, 2, E.MGP);
  igual(cuenta.total, 12000, "solo el almuerzo de Ana; el del 20 no se cobra");
  igual(cuenta.rango, { desde: 14, hasta: 31 });
  cierto(cuenta.filas.every((f) => f.total > 0), "no salen renglones en cero en la cuenta");
});

prueba("la cuenta de cobro suma exactamente lo que dicen sus renglones", () => {
  const cuenta = cuentaDeCobro(D.consumos, 2026, 8, 1, E.AGRO);
  igual(cuenta.total, cuenta.filas.reduce((a, f) => a + f.total, 0));
  igual(cuenta.total, cuenta.filas.reduce((a, f) => a + f.cantidad * f.precioUnitario, 0));
});

prueba("el cuadre saca una fila por día del mes y marca verde o rojo", () => {
  const filas = informeCuadre(D.consumos, 2026, 8, { "2026-08-10": 2, "2026-08-14": 5 });
  igual(filas.length, 31, "agosto tiene 31 días");
  const d10 = filas.find((f) => f.dia === 10);
  igual(d10.registradas, 2);
  igual(d10.declarado, 2);
  igual(d10.diferencia, 0);
  igual(d10.estado, "cuadra");
  const d14 = filas.find((f) => f.dia === 14);
  igual(d14.registradas, 2);
  igual(d14.diferencia, -3, "el trabajador dijo 5 y solo hay 2 registradas");
  igual(d14.estado, "no-cuadra");
  igual(filas.find((f) => f.dia === 1).estado, "sin-dato", "los días sin dato no salen en rojo");
});

prueba("el cuadre aguanta un 0 declarado sin confundirlo con vacío", () => {
  const filas = informeCuadre(D.consumos, 2026, 8, { "2026-08-05": 0 });
  const d5 = filas.find((f) => f.dia === 5);
  igual(d5.declarado, 0);
  igual(d5.estado, "cuadra", "dijo 0 y hay 0: cuadra");
});

// ---------------------------------------------------------------------------
grupo("Avisos: cada problema dice qué pasa y cómo se arregla");

prueba("un renglón bueno no genera ni un aviso", () => {
  const bueno = D.consumos[0];
  igual(revisarConsumo(bueno, D), []);
});

prueba("avisa cuando la persona no es de esa empresa", () => {
  // Ana es de MGP; en AGRO no está, así que este renglón tiene que chillar.
  const malo = { ...D.consumos[0], persona: "ANA GOMEZ", empresa: "AGRO" };
  const avisos = revisarConsumo(malo, D);
  cierto(avisos.some((a) => a.codigo === "PERSONA_NO_ESTA"));
  cierto(avisos.every((a) => a.comoArreglar && a.comoArreglar.length > 10), "todos dicen cómo arreglarlo");
});

prueba("avisa cuando el plato no está en el catálogo y cuando quedó en cero", () => {
  const malo = { ...D.consumos[0], producto: "SANCOCHO", precioUnitario: 0 };
  const codigos = revisarConsumo(malo, D).map((a) => a.codigo);
  cierto(codigos.includes("PLATO_NO_ESTA"));
  cierto(codigos.includes("SIN_PRECIO"));
});

prueba("un plato en $0 marcado como NO facturable no molesta con avisos", () => {
  const gratis = { ...D.consumos[0], precioUnitario: 0, facturable: false };
  cierto(!revisarConsumo(gratis, D).some((a) => a.codigo === "SIN_PRECIO"));
});

prueba("avisa cuando la fecha no es una fecha", () => {
  const malo = { ...D.consumos[0], fecha: "20 de agosto" };
  cierto(revisarConsumo(malo, D).some((a) => a.codigo === "FECHA_MALA"));
});

// ---------------------------------------------------------------------------
grupo("Ayudas");

prueba("precioDe encuentra el precio por empresa, o dice null", () => {
  igual(precioDe(D, "ALMUERZO", "MGP"), 12000);
  igual(precioDe(D, "ALMUERZO", "AGRO"), 10000, "el mismo plato vale distinto");
  igual(precioDe(D, "SANCOCHO", "MGP"), null, "no inventa un precio");
});

prueba("personasDe solo trae la gente de esa empresa y ordenada", () => {
  const agro = personasDe(D, "AGRO");
  igual(agro.map((p) => p.nombre), ["JUAN PEREZ"]);
  const mgp = personasDe(D, "MGP");
  igual(mgp.map((p) => p.nombre), ["ANA GOMEZ", "JUAN PEREZ"], "Pedro está inactivo, no sale");
  igual(personasDe(D, "MGP", true).length, 3, "salvo que se pidan las inactivas");
});

prueba("contarFacturas y facturasPorEmpresa dan lo mismo sumadas", () => {
  const f = facturasPorEmpresa(D.consumos);
  const suma = Object.values(f).reduce((a, b) => a + b, 0);
  igual(suma, contarFacturas(D.consumos));
});

// ---------------------------------------------------------------------------
grupo("La fecha en que se pasa la cuenta");

prueba("los dias de la quincena NO dependen de esa fecha", () => {
  // Esto es lo importante: se agrego poder poner la fecha en que se entrega
  // la cuenta, y eso NO puede mover ni un dia del periodo que cubre.
  const empresa = { codigo: "MGP", ultimoDiaQ1: 13, ultimoDiaQ2: 31 };
  const antes = rangoQuincena(2026, 8, 1, empresa);
  const datos = { fechasDeCobro: {} };
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 1, "2026-08-20");
  const despues = rangoQuincena(2026, 8, 1, empresa);
  igual(despues, antes, "el periodo tiene que quedar igual");
  igual(antes.desde, 1);
  igual(antes.hasta, 13);
});

prueba("se guarda y se lee por empresa, mes y quincena", () => {
  const datos = { fechasDeCobro: {} };
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 1, "2026-08-14");
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 2, "2026-09-02");
  igual(fechaDeCobro(datos, "MGP", 2026, 8, 1), "2026-08-14");
  igual(fechaDeCobro(datos, "MGP", 2026, 8, 2), "2026-09-02");
  igual(fechaDeCobro(datos, "AGRO", 2026, 8, 1), null, "otra empresa no la hereda");
  igual(fechaDeCobro(datos, "MGP", 2026, 9, 1), null, "otro mes tampoco");
});

prueba("si no la han puesto, NO se inventa ninguna", () => {
  // Un documento con fecha inventada es peor que uno sin fecha: nadie se da
  // cuenta de que esta mal.
  igual(fechaDeCobro({}, "MGP", 2026, 8, 1), null);
});

prueba("una fecha que no es fecha se rechaza", () => {
  const datos = { fechasDeCobro: {} };
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 1, "14 de agosto");
  igual(fechaDeCobro(datos, "MGP", 2026, 8, 1), null);
});

prueba("borrarla la quita, no la deja en blanco", () => {
  const datos = { fechasDeCobro: {} };
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 1, "2026-08-14");
  ponerFechaDeCobro(datos, "MGP", 2026, 8, 1, "");
  igual(fechaDeCobro(datos, "MGP", 2026, 8, 1), null);
  igual(Object.keys(datos.fechasDeCobro).length, 0);
});
