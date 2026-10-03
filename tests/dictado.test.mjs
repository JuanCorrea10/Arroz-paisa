// ============================================================================
//  dictado.test.mjs  -  Leer el pedido que el señor manda por audio
//
//  El señor es mayor, dicta por nota de voz y confunde nombres. WhatsApp
//  transcribe, ella pega el texto, y esto tiene que entenderlo.
//
//  Aquí se prueban DOS cosas, y la segunda importa más que la primera:
//
//    1. Que entienda, diga el señor las cosas como las diga.
//    2. Que cuando NO esté seguro, lo diga. Un pedido anotado con el nombre
//       equivocado se le cobra a la persona equivocada, y eso no sale a la
//       luz hasta que alguien reclama a fin de quincena.
//
//  Por eso casi todas las pruebas de abajo verifican que algo quede MARCADO,
//  no que quede resuelto.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { leerElDictado } from "../js/nucleo/dictado.js";

const GENTE = [
  "PAOLA ALVAREZ", "PEDRO OCAMPO", "DANIEL TRIANA", "DANIELA TRIANA",
  "LEIDY ACOSTA", "SOFIA BOADA", "JHON JAIRO MARTINEZ",
];

const PRODUCTOS = [
  { nombre: "ALMUERZO", activo: true },
  { nombre: "OFERTA", activo: true },
  { nombre: "COCA COLA 1.5", activo: true },
  { nombre: "COCA COLA PERSONAL", activo: true },
  { nombre: "JUGO EN LECHE", activo: true },
  { nombre: "PORCION DE PAPAS", activo: true },
  { nombre: "TAMAL", activo: false },
];

const leer = (texto) => leerElDictado(texto, { gente: GENTE, productos: PRODUCTOS });
const uno = (texto) => leer(texto).renglones[0];

// ---------------------------------------------------------------------------
grupo("Entender el pedido, lo diga como lo diga");

prueba("lo más simple: nombre y plato", () => {
  const r = uno("Paola Alvarez almuerzo");
  igual(r.persona.elegida, "PAOLA ALVAREZ");
  igual(r.producto.nombre, "ALMUERZO");
  igual(r.cantidad, 1);
  cierto(r.listo, "sin nada de qué dudar: " + r.porque.join(", "));
});

prueba("con relleno de por medio", () => {
  // "Para la señora Paola Alvarez un almuerzo, por favor" tiene que dar lo
  // mismo: el relleno no puede estorbar la búsqueda del nombre.
  const r = uno("para la señora Paola Alvarez un almuerzo por favor");
  igual(r.persona.elegida, "PAOLA ALVAREZ");
  igual(r.producto.nombre, "ALMUERZO");
  cierto(r.listo);
});

prueba("al revés: primero el plato", () => {
  const r = uno("un almuerzo para Pedro Ocampo");
  igual(r.persona.elegida, "PEDRO OCAMPO");
  igual(r.producto.nombre, "ALMUERZO");
  cierto(r.listo);
});

prueba("el apellido antes del nombre", () => {
  // El esqueleto ordena las palabras, así que da igual cómo las diga.
  const r = uno("Alvarez Paola almuerzo");
  igual(r.persona.elegida, "PAOLA ALVAREZ");
  cierto(r.listo);
});

prueba("sin tildes, como sale de la transcripción", () => {
  const r = uno("Sofia Boada jugo en leche");
  igual(r.persona.elegida, "SOFIA BOADA");
  igual(r.producto.nombre, "JUGO EN LECHE");
  cierto(r.listo);
});

prueba("el plato de nombre largo le gana al corto", () => {
  // Si "COCA COLA" se llevara el renglón, se cobraría la personal al precio
  // de la 1.5 o al revés.
  igual(uno("Pedro Ocampo coca cola 1.5").producto.nombre, "COCA COLA 1.5");
  igual(uno("Pedro Ocampo coca cola personal").producto.nombre, "COCA COLA PERSONAL");
});

prueba("varios pedidos en un solo texto", () => {
  const r = leer(`Paola Alvarez un almuerzo
Pedro Ocampo una coca cola 1.5
Sofia Boada almuerzo`);
  igual(r.renglones.length, 3);
  igual(r.listos, 3);
  igual(r.renglones.map((x) => x.persona.elegida),
        ["PAOLA ALVAREZ", "PEDRO OCAMPO", "SOFIA BOADA"]);
});

prueba("separados por comas, como habla la gente", () => {
  const r = leer("Paola Alvarez almuerzo, Pedro Ocampo almuerzo");
  igual(r.renglones.length, 2);
  igual(r.listos, 2);
});

prueba("las cantidades, en cifra y en letra", () => {
  igual(uno("Paola Alvarez dos almuerzos").cantidad, 2);
  igual(uno("Paola Alvarez 2 almuerzos").cantidad, 2);
  igual(uno("Paola Alvarez almuerzo").cantidad, 1, "sin decirla, es uno");
});

prueba("un plato apagado no se usa", () => {
  // Está en el catálogo pero ella lo apagó: ya no se vende.
  igual(uno("Paola Alvarez tamal").producto.nombre, null);
});

// ---------------------------------------------------------------------------
grupo("Lo que no esté seguro, MARCADO");

prueba("un nombre mal dicho se marca y se propone el parecido", () => {
  // Es el caso de todos los días: el señor dice "Paula Alvares".
  const r = uno("Paula Alvares un almuerzo");
  igual(r.listo, false, "no puede pasar como bueno");
  igual(r.persona.elegida, "PAOLA ALVAREZ", "pero sí sabe a quién se parece");
  igual(r.persona.segura, false);
  cierto(r.porque.some((p) => /PAOLA ALVAREZ/.test(p)), r.porque.join(", "));
});

prueba("si se parece a DOS, no escoge: las muestra", () => {
  // DANIEL y DANIELA TRIANA. Escoger una es cobrarle a la otra.
  const r = uno("Daniel Triana almuerzo");
  const otro = uno("Danielo Triana almuerzo");
  igual(r.persona.elegida, "DANIEL TRIANA", "el exacto sí se resuelve");
  igual(otro.listo, false);
  cierto(otro.persona.opciones.includes("DANIEL TRIANA"));
  cierto(otro.persona.opciones.includes("DANIELA TRIANA"));
});

prueba("un nombre que no existe se marca y lo dice", () => {
  const r = uno("Rigoberto Castañeda almuerzo");
  igual(r.listo, false);
  igual(r.persona.elegida, null);
  cierto(r.porque.some((p) => /no está en la lista/.test(p)), r.porque.join(", "));
});

prueba("un plato que no se entiende se marca", () => {
  const r = uno("Paola Alvarez un sancocho");
  igual(r.listo, false);
  igual(r.producto.nombre, null);
  cierto(r.porque.some((p) => /qué pidió/.test(p)), r.porque.join(", "));
});

prueba("una cantidad rara se marca aunque todo lo demás esté bien", () => {
  // "Trece" por "tres" son $ 120.000. Y a diferencia de un nombre raro, un
  // número grande NO salta a la vista en una lista de treinta renglones.
  const r = uno("Paola Alvarez trece almuerzos");
  igual(r.cantidad, 13);
  igual(r.listo, false);
  igual(r.persona.elegida, "PAOLA ALVAREZ", "la persona sí está bien");
  cierto(r.porque.some((p) => /de verdad son 13/.test(p)), r.porque.join(", "));
});

prueba("dos platos sí pasan: es normal pedir dos", () => {
  cierto(uno("Paola Alvarez dos almuerzos").listo);
});

prueba("un renglón puede tener varias dudas a la vez", () => {
  const r = uno("Rigoberto no se que cosa");
  igual(r.listo, false);
  cierto(r.porque.length >= 2, "dice las dos: " + r.porque.join(", "));
});

prueba("cuenta cuántos quedan listos y cuántos por revisar", () => {
  // Es el número que ella mira antes de aprobar.
  const r = leer(`Paola Alvarez almuerzo
Paula Alvares almuerzo
Pedro Ocampo almuerzo`);
  igual(r.listos, 2);
  igual(r.porRevisar, 1);
});

// ---------------------------------------------------------------------------
grupo("Lo que no puede reventar");

prueba("texto vacío o basura no revienta", () => {
  igual(leer("").renglones, []);
  igual(leer(null).renglones, []);
  igual(leer("   \n  \n ").renglones, []);
});

prueba("sin gente y sin catálogo tampoco", () => {
  const r = leerElDictado("Paola almuerzo", {});
  igual(r.renglones.length, 1);
  igual(r.renglones[0].listo, false);
});

prueba("un saludo suelto no se vuelve un pedido fantasma", () => {
  // El señor arranca el audio saludando. Eso no es un pedido, y tiene que
  // salir marcado y no anotarse solo.
  const r = uno("Buenos días doña");
  igual(r.listo, false);
});

// ---------------------------------------------------------------------------
grupo("Un renglón, varios platos");

prueba("almuerzo Y gaseosa en el mismo renglón son dos pedidos", () => {
  // Esto se descubrió probando con los datos de verdad: solo se detectaba un
  // plato, la gaseosa se perdía, y además la palabra "almuerzos" se quedaba
  // pegada al nombre y mandaba a revisar un renglón que estaba perfecto.
  const r = leer("Pedro Ocampo dos almuerzos y una coca cola 1.5");
  igual(r.renglones.length, 2);
  igual(r.renglones.map((x) => x.persona.elegida), ["PEDRO OCAMPO", "PEDRO OCAMPO"]);
  igual(r.renglones.map((x) => x.producto.nombre), ["ALMUERZO", "COCA COLA 1.5"]);
  igual(r.listos, 2, "los dos quedan listos: " +
        r.renglones.flatMap((x) => x.porque).join(", "));
});

prueba("cada plato se queda con SU cantidad", () => {
  // Con una sola cantidad por renglón, la gaseosa saldría también por dos y
  // se cobraría de más.
  const r = leer("Pedro Ocampo dos almuerzos y una coca cola 1.5");
  igual(r.renglones.map((x) => x.cantidad), [2, 1]);
});

prueba("tres platos seguidos también", () => {
  const r = leer("Sofia Boada almuerzo, jugo en leche y porcion de papas");
  igual(r.renglones.map((x) => x.producto.nombre).sort(),
        ["ALMUERZO", "JUGO EN LECHE", "PORCION DE PAPAS"]);
});

prueba("el plato mal escrito no se pega al nombre", () => {
  // "el almuerso" se encuentra por parecido. Si se quitara del renglón la
  // palabra del CATÁLOGO y no la que de verdad está escrita, quedaría
  // "PAOLA ALVAREZ ALMUERSO" y la persona saldría como desconocida.
  const r = uno("Paola Alvarez el almuerso");
  igual(r.persona.elegida, "PAOLA ALVAREZ");
  igual(r.producto.nombre, "ALMUERZO");
  igual(r.listo, false, "el plato dudoso sí se marca");
  cierto(r.porque.every((p) => !/no está en la lista/.test(p)),
         "pero la persona no: " + r.porque.join(", "));
});

// ---------------------------------------------------------------------------
grupo("Lo que ella puede arreglar sin llamar al señor");

prueba("si lo único dudoso es el nombre, se marca como arreglable aquí", () => {
  // Es el caso de todos los días: el señor dice "Paula" por "Paola". Todo lo
  // demás está bien, así que no hace falta llamarlo: ella confirma y ya.
  const r = uno("Paula Alvares un almuerzo");
  igual(r.listo, false);
  igual(r.soloFaltaElNombre, true);
});

prueba("si además el plato es dudoso, NO se arregla aquí", () => {
  // Con dos dudas, confirmar el nombre dejaría pasar el plato sin mirarlo.
  const r = uno("Paula Alvares el almuerso");
  igual(r.soloFaltaElNombre, false);
});

prueba("si la cantidad es rara, tampoco", () => {
  const r = uno("Paula Alvares trece almuerzos");
  igual(r.soloFaltaElNombre, false, "las 13 hay que preguntarlas");
});

prueba("si no se parece a nadie, no hay nada que escoger", () => {
  const r = uno("Rigoberto Castañeda un almuerzo");
  igual(r.soloFaltaElNombre, false);
});

prueba("un pedido bueno no se marca como arreglable", () => {
  igual(uno("Paola Alvarez almuerzo").soloFaltaElNombre, false);
});
