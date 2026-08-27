// ============================================================================
//  sueltos.test.mjs  -  Las pruebas de los renglones que no pegan con nada.
//
//  Estas son delicadas porque MUEVEN PLATA: unir "AGUA CON GAS" con "AGUA GAS"
//  le sube la cuenta a una empresa. Si la app se equivoca aquí, alguien cobra
//  de más o de menos, y eso se nota.
//
//  Los casos salieron del Excel real de agosto de 2026.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  compararPlatos, parecidosEnCatalogo, personasSueltas, platosSueltos,
  unirPersonaSuelta, crearPersonaSuelta, simularUnionDePlato, unirPlatoSuelto,
  crearPlatoSuelto, dejarComoEsta, volverARevisar, cuantosSueltos,
} from "../js/nucleo/sueltos.js";

// ---------------------------------------------------------------------------
grupo("Comparar platos: qué es obvio y qué no");

prueba("AGUA GAS y AGUA CON GAS son el mismo: solo sobra el 'con'", () => {
  const r = compararPlatos("AGUA CON GAS", "AGUA GAS");
  cierto(r, "tenían que parecerse");
  igual(r.obvio, true);
  igual(r.fuerza, 4);
});

prueba("COMBO COSTILLAS y COMBO DE COSTILLAS: solo sobra el 'de'", () => {
  const r = compararPlatos("COMBO COSTILLAS", "COMBO DE COSTILLAS");
  igual(r.obvio, true);
});

prueba("COMBO ALITAS y COMBO DE ALAS NO son obvios", () => {
  // Sobra el "DE" pero además ALITAS no es ALAS. Puede ser otro plato con
  // otro precio, así que esto lo decide ella.
  const r = compararPlatos("COMBO ALITAS", "COMBO DE ALAS");
  cierto(!r || r.obvio !== true, "no puede darse por obvio");
});

prueba("PORCION COSTILLAS y COMBO DE COSTILLAS no son obvios", () => {
  // Una porción no es un combo, aunque las dos lleven costillas.
  const r = compararPlatos("PORCION COSTILLAS", "COMBO DE COSTILLAS");
  cierto(!r || r.obvio !== true);
});

prueba("el mismo plato al revés sí es obvio", () => {
  const r = compararPlatos("GASEOSA COLA", "COLA GASEOSA");
  igual(r.obvio, true);
});

prueba("dos platos que no tienen nada que ver no se parecen", () => {
  igual(compararPlatos("ALMUERZO", "GASEOSA"), null);
});

prueba("el mismo texto exacto no es un parecido", () => {
  igual(compararPlatos("ALMUERZO", "ALMUERZO"), null);
});

// ---------------------------------------------------------------------------
grupo("Encontrar los renglones sueltos");

let contador = 0;
function renglon(fecha, empresa, persona, producto, precio, cantidad = 1) {
  contador++;
  return {
    id: "s" + contador, fecha, empresa: empresa,
    persona, producto, cantidad, precioUnitario: precio,
    facturable: true, observacion: "", revisar: [],
  };
}

function datosDePrueba() {
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [
      { codigo: "MGP", razonSocial: "INDUSTRIAS MGP", ultimoDiaQ1: 13, ultimoDiaQ2: 31, activa: true },
      { codigo: "AGRO", razonSocial: "BOTAS AGRO", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
    ],
    productos: [
      { nombre: "ALMUERZO", activo: true },
      { nombre: "AGUA GAS", activo: true },
    ],
    precios: {
      "ALMUERZO|MGP": 12000, "ALMUERZO|AGRO": 12000,
      "AGUA GAS|MGP": 3000, "AGUA GAS|AGRO": 3000,
    },
    personas: [
      { nombre: "MARTA SALGADO", empresa: "MGP", activa: true },
      { nombre: "PEDRO SOLO", empresa: "AGRO", activa: true },
    ],
    consumos: [
      renglon("2026-08-03", "MGP", "MARTA SALGADO", "ALMUERZO", 12000),
      // Esta persona NO está en la lista: es MARTA mal escrita.
      renglon("2026-08-04", "MGP", "MARTHA SALGADO", "ALMUERZO", 12000),
      renglon("2026-08-05", "MGP", "MARTHA SALGADO", "ALMUERZO", 12000),
      // Este plato NO está en el catálogo y entró en $ 0.
      renglon("2026-08-06", "AGRO", "PEDRO SOLO", "AGUA CON GAS", 0, 2),
      renglon("2026-08-07", "AGRO", "PEDRO SOLO", "AGUA CON GAS", 0, 1),
    ],
    cuadres: {},
    nombresDistintos: [],
    sueltosRevisados: [],
  };
}

prueba("encuentra a la persona que no está en su empresa", () => {
  const sueltas = personasSueltas(datosDePrueba());
  igual(sueltas.length, 1);
  igual(sueltas[0].nombre, "MARTHA SALGADO");
  igual(sueltas[0].empresa, "MGP");
  igual(sueltas[0].renglones, 2);
});

prueba("y le propone a quién se parece, de la misma empresa", () => {
  const sueltas = personasSueltas(datosDePrueba());
  cierto(sueltas[0].sugerencias.length >= 1, "tenía que sugerir a MARTA");
  igual(sueltas[0].sugerencias[0].nombre, "MARTA SALGADO");
});

prueba("encuentra el plato que no está en el catálogo", () => {
  const sueltos = platosSueltos(datosDePrueba());
  igual(sueltos.length, 1);
  igual(sueltos[0].nombre, "AGUA CON GAS");
  igual(sueltos[0].renglones, 2);
  igual(sueltos[0].cantidad, 3, "2 + 1 pedidos");
  igual(sueltos[0].sinPrecio, 2);
});

prueba("y le propone el del catálogo, marcado como obvio", () => {
  const sueltos = platosSueltos(datosDePrueba());
  igual(sueltos[0].sugerencias[0].nombre, "AGUA GAS");
  igual(sueltos[0].sugerencias[0].obvio, true);
});

prueba("avisa cuando DOS platos sueltos se parecen entre ellos", () => {
  // Caso real de agosto: "COMBO DE COSTILLAS" y "COMBO COSTILLAS", ninguno
  // en el catálogo. Sin este aviso, ella crearía el mismo plato dos veces
  // con dos nombres, o sea volver a empezar el problema.
  const datos = datosDePrueba();
  datos.consumos.push(
    renglon("2026-08-08", "AGRO", "PEDRO SOLO", "COMBO DE COSTILLAS", 0),
    renglon("2026-08-09", "AGRO", "PEDRO SOLO", "COMBO COSTILLAS", 0)
  );
  const sueltos = platosSueltos(datos);
  const uno = sueltos.find((p) => p.nombre === "COMBO DE COSTILLAS");
  cierto(uno, "tenía que salir como suelto");
  igual(uno.parientes.length, 1);
  igual(uno.parientes[0].nombre, "COMBO COSTILLAS");
  igual(uno.parientes[0].obvio, true, 'lo único que sobra es "de"');
});

prueba("un plato suelto sin parientes no inventa ninguno", () => {
  const sueltos = platosSueltos(datosDePrueba());
  igual(sueltos[0].parientes.length, 0);
});

prueba("cuenta bien cuántas cosas hay esperando decisión", () => {
  const c = cuantosSueltos(datosDePrueba());
  igual(c.personas, 1);
  igual(c.platos, 1);
  igual(c.total, 2);
  igual(c.renglones, 4);
});

// ---------------------------------------------------------------------------
grupo("Decidir: es la misma persona");

prueba("mueve los renglones a la persona que sí existe", () => {
  const datos = datosDePrueba();
  const antes = datos.consumos.length;
  const r = unirPersonaSuelta(datos, "MGP", "MARTHA SALGADO", "MARTA SALGADO");

  igual(r.movidos, 2);
  igual(datos.consumos.length, antes, "no se puede perder ningún renglón");
  const deMarta = datos.consumos.filter((c) => c.persona === "MARTA SALGADO");
  igual(deMarta.length, 3, "el suyo más los dos que llegaron");
});

prueba("después de unir, ya no queda nada suelto de personas", () => {
  const datos = datosDePrueba();
  unirPersonaSuelta(datos, "MGP", "MARTHA SALGADO", "MARTA SALGADO");
  igual(personasSueltas(datos).length, 0);
});

prueba("no deja unir con alguien que no existe", () => {
  const datos = datosDePrueba();
  let exploto = false;
  try {
    unirPersonaSuelta(datos, "MGP", "MARTHA SALGADO", "NADIE AQUI");
  } catch { exploto = true; }
  cierto(exploto, "tenía que rechazarlo");
});

prueba("es otra persona: se crea y los renglones quedan válidos", () => {
  const datos = datosDePrueba();
  const r = crearPersonaSuelta(datos, "MGP", "MARTHA SALGADO", "MGP");
  igual(r.arreglados, 2);
  igual(personasSueltas(datos).length, 0);
  cierto(datos.personas.some((p) => p.nombre === "MARTHA SALGADO" && p.empresa === "MGP"));
});

// ---------------------------------------------------------------------------
grupo("Decidir: es el mismo plato (aquí se mueve plata)");

prueba("dice ANTES cuánta plata cambia", () => {
  const previa = simularUnionDePlato(datosDePrueba(), "AGUA CON GAS", "AGUA GAS");
  igual(previa.renglones, 2);
  igual(previa.antes, 0, "hoy están en $ 0");
  igual(previa.despues, 9000, "3 aguas a $ 3.000");
  igual(previa.diferencia, 9000);
});

prueba("dice a qué empresa le sube y cuánto", () => {
  const previa = simularUnionDePlato(datosDePrueba(), "AGUA CON GAS", "AGUA GAS");
  igual(previa.porEmpresa.length, 1);
  igual(previa.porEmpresa[0].empresa, "AGRO");
  igual(previa.porEmpresa[0].diferencia, 9000);
});

prueba("simular NO toca nada", () => {
  const datos = datosDePrueba();
  simularUnionDePlato(datos, "AGUA CON GAS", "AGUA GAS");
  igual(platosSueltos(datos).length, 1, "el plato suelto sigue suelto");
  igual(datos.consumos[3].precioUnitario, 0);
});

prueba("unir cambia el nombre Y le pone el precio", () => {
  const datos = datosDePrueba();
  unirPlatoSuelto(datos, "AGUA CON GAS", "AGUA GAS");
  const aguas = datos.consumos.filter((c) => c.producto === "AGUA GAS");
  igual(aguas.length, 2);
  cierto(aguas.every((c) => c.precioUnitario === 3000), "todas tienen que quedar en $ 3.000");
  igual(platosSueltos(datos).length, 0);
});

prueba("no deja unir con un plato que no está en el catálogo", () => {
  const datos = datosDePrueba();
  let exploto = false;
  try { unirPlatoSuelto(datos, "AGUA CON GAS", "PLATO INVENTADO"); } catch { exploto = true; }
  cierto(exploto);
});

prueba("es otro plato: entra al catálogo con su precio", () => {
  const datos = datosDePrueba();
  const r = crearPlatoSuelto(datos, "AGUA CON GAS", { AGRO: 4000, MGP: 4000 });
  igual(r.arreglados, 2);
  cierto(datos.productos.some((p) => p.nombre === "AGUA CON GAS"));
  const aguas = datos.consumos.filter((c) => c.producto === "AGUA CON GAS");
  cierto(aguas.every((c) => c.precioUnitario === 4000));
  igual(platosSueltos(datos).length, 0);
});

// ---------------------------------------------------------------------------
grupo("Decidir: déjelo así");

prueba("lo que se deja así no vuelve a aparecer", () => {
  const datos = datosDePrueba();
  igual(personasSueltas(datos).length, 1);
  dejarComoEsta(datos, "PERSONA", "MGP", "MARTHA SALGADO");
  igual(personasSueltas(datos).length, 0);
});

prueba("pero se puede deshacer", () => {
  const datos = datosDePrueba();
  dejarComoEsta(datos, "PLATO", "", "AGUA CON GAS");
  igual(platosSueltos(datos).length, 0);
  volverARevisar(datos, "PLATO", "", "AGUA CON GAS");
  igual(platosSueltos(datos).length, 1);
});

prueba("dejar así no cambia ningún dato", () => {
  const datos = datosDePrueba();
  const antes = JSON.stringify(datos.consumos);
  dejarComoEsta(datos, "PLATO", "", "AGUA CON GAS");
  igual(JSON.stringify(datos.consumos), antes);
});

prueba("al arreglarlo de verdad, se olvida el 'déjelo así'", () => {
  const datos = datosDePrueba();
  dejarComoEsta(datos, "PLATO", "", "AGUA CON GAS");
  volverARevisar(datos, "PLATO", "", "AGUA CON GAS");
  unirPlatoSuelto(datos, "AGUA CON GAS", "AGUA GAS");
  igual((datos.sueltosRevisados || []).length, 0);
});
