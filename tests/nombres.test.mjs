// ============================================================================
//  nombres.test.mjs  -  Las pruebas del arreglo de nombres.
//
//  Los casos de aquí NO son inventados: casi todos salieron de mirar los datos
//  reales de agosto de 2026 y las listas de personal que mandaron las empresas.
//  Si alguno falla, la app estaría uniendo personas que no son, o dejando
//  partido el consumo de alguien.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  limpiarNombre, necesitaLimpieza, esqueleto, distancia, compararNombres,
  parecidasEnEmpresa, tocayosEnOtrasEmpresas, gruposParaRevisar, simularUnion,
  unirPersonas, marcarDistintos, renombrarPersona, limpiarTodosLosNombres,
  queDiceElDocumento,
} from "../js/nucleo/nombres.js";

// ---------------------------------------------------------------------------
grupo("Limpiar: los errores que metía el Excel");

prueba("quita los puntos, que es el error clásico", () => {
  igual(limpiarNombre("JUAN.PEREZ"), "JUAN PEREZ");
  igual(limpiarNombre("J.PEREZ."), "J PEREZ");
});

prueba("quita los espacios de sobra: al principio, al final y los dobles", () => {
  igual(limpiarNombre("  JUAN   PEREZ  "), "JUAN PEREZ");
});

prueba("pone todo en mayúsculas", () => {
  igual(limpiarNombre("juan perez"), "JUAN PEREZ");
});

prueba("mata los espacios invisibles que se pegan al copiar de Excel", () => {
  // Un espacio duro y un espacio de ancho cero. En pantalla no se ven, pero
  // hacen que el nombre no coincida con nada y el renglón se pierda.
  const conBasura = "JUAN" + String.fromCharCode(0x00a0) + "PEREZ" + String.fromCharCode(0x200b);
  igual(limpiarNombre(conBasura), "JUAN PEREZ");
});

prueba("convierte los guiones en espacios", () => {
  igual(limpiarNombre("MARIA-JOSE"), "MARIA JOSE");
});

prueba("RESPETA las tildes y la ñ, porque distinguen personas", () => {
  igual(limpiarNombre("alejandro muñoz"), "ALEJANDRO MUÑOZ");
  igual(limpiarNombre("josé pérez"), "JOSÉ PÉREZ");
});

prueba("aguanta que no le llegue nada", () => {
  igual(limpiarNombre(null), "");
  igual(limpiarNombre(undefined), "");
  igual(limpiarNombre(""), "");
});

prueba("sabe avisar cuándo hay algo que limpiar", () => {
  cierto(necesitaLimpieza("JUAN.PEREZ"));
  cierto(!necesitaLimpieza("JUAN PEREZ"));
});

// ---------------------------------------------------------------------------
grupo("Esqueleto: comparar sin importar el orden ni las tildes");

prueba("no le importa el orden de las palabras", () => {
  igual(esqueleto("JUAN PEREZ"), esqueleto("PEREZ JUAN"));
});

prueba("no le importan las tildes ni la ñ", () => {
  igual(esqueleto("JOSÉ PÉREZ"), esqueleto("JOSE PEREZ"));
  igual(esqueleto("MUÑOZ"), esqueleto("MUNOZ"));
});

prueba("no le importan los puntos", () => {
  igual(esqueleto("JUAN.PEREZ"), esqueleto("JUAN PEREZ"));
});

// ---------------------------------------------------------------------------
grupo("Distancia: cuántas letras cambian");

prueba("cuenta bien las letras que cambian", () => {
  igual(distancia("PEREZ", "PEREZ"), 0);
  igual(distancia("PEREZ", "PERES"), 1);
  igual(distancia("PEREZ", "PERE"), 1);
});

prueba("corta cuando ya se pasó del tope, para no volverse lenta", () => {
  // Con tope 2, cualquier cosa peor que 2 devuelve 3. No importa cuánto sea.
  cierto(distancia("PEREZ", "GOMEZ", 2) > 2);
});

// ---------------------------------------------------------------------------
grupo("Comparar: ¿es el mismo nombre mal escrito?");

prueba("el mismo nombre con un punto de más es fuerza 4", () => {
  const r = compararNombres("JUAN PEREZ", "JUAN.PEREZ");
  igual(r.fuerza, 4);
});

prueba("el apellido de primero es fuerza 4", () => {
  const r = compararNombres("JUAN PEREZ", "PEREZ JUAN");
  igual(r.fuerza, 4);
  igual(r.razon, "es el mismo nombre pero con el apellido de primero");
});

prueba("solo cambia la tilde: fuerza 4", () => {
  const r = compararNombres("JOSE PEREZ", "JOSÉ PÉREZ");
  igual(r.fuerza, 4);
});

prueba("a uno le falta un apellido: fuerza 3", () => {
  // Este es el caso que permite cruzar con las listas de las empresas, donde
  // los nombres vienen completos y en la app vienen cortos.
  const r = compararNombres("JUAN PEREZ", "JUAN PEREZ GOMEZ");
  igual(r.fuerza, 3);
});

prueba("una sola letra distinta: fuerza 2", () => {
  const r = compararNombres("JUAN PEREZ", "JUAN PERES");
  igual(r.fuerza, 2);
});

prueba("dos nombres que no tienen nada que ver: no se parecen", () => {
  igual(compararNombres("JUAN PEREZ", "MARIA GOMEZ"), null);
});

prueba("MARIA y MARIO NO se dan por parecidos (son dos personas)", () => {
  // Se diferencian en una letra, pero son nombres cortos y distintos.
  // Este caso apareció de verdad en MGP y por poco une a dos personas.
  const r = compararNombres("MARIA GONZALEZ", "MARIO GONZALEZ");
  cierto(r === null || r.fuerza <= 2, "MARIA/MARIO nunca puede ser fuerza alta");
});

prueba("el mismo texto exacto no es 'parecido', es el mismo", () => {
  igual(compararNombres("JUAN PEREZ", "JUAN PEREZ"), null);
});

// ---------------------------------------------------------------------------
grupo("La regla de oro: NUNCA unir entre empresas");

/** Unos datos de mentiras, chiquitos, para probar. */
function datosDePrueba() {
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [
      { codigo: "AGRO", razonSocial: "AGRO", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
      { codigo: "BASARILI", razonSocial: "BASARILI", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
    ],
    productos: [{ nombre: "ALMUERZO", activo: true }],
    precios: { "ALMUERZO|AGRO": 10000, "ALMUERZO|BASARILI": 10000 },
    personas: [
      { nombre: "JUAN PEREZ", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true },
      { nombre: "JUAN.PEREZ", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true },
      { nombre: "JUAN PEREZ", empresaCome: "BASARILI", empresaFactura: "BASARILI", activa: true },
    ],
    consumos: [
      renglon("2026-08-03", "AGRO", "JUAN PEREZ", 1),
      renglon("2026-08-04", "AGRO", "JUAN PEREZ", 1),
      renglon("2026-08-05", "AGRO", "JUAN.PEREZ", 1),
      renglon("2026-08-06", "BASARILI", "JUAN PEREZ", 1),
    ],
    cuadres: {},
    nombresDistintos: [],
  };
}

let contador = 0;
function renglon(fecha, empresa, persona, cantidad) {
  return {
    id: "p" + (++contador),
    fecha, empresaCome: empresa, empresaFactura: empresa, persona,
    producto: "ALMUERZO", cantidad, precioUnitario: 10000,
    facturable: true, observacion: "", revisar: [],
  };
}

prueba("los tocayos de otra empresa NUNCA salen para unir", () => {
  const datos = datosDePrueba();
  const grupos = gruposParaRevisar(datos);
  // Solo puede salir el grupo de AGRO (JUAN PEREZ + JUAN.PEREZ).
  igual(grupos.length, 1);
  igual(grupos[0].empresa, "AGRO");
  igual(grupos[0].integrantes.length, 2);
});

prueba("el tocayo de la otra empresa sí se puede consultar, como dato", () => {
  const datos = datosDePrueba();
  const otros = tocayosEnOtrasEmpresas(datos, "JUAN PEREZ", "AGRO");
  igual(otros.length, 1);
  igual(otros[0].empresaCome, "BASARILI");
});

prueba("al buscar parecidas solo mira la empresa que se le pide", () => {
  const datos = datosDePrueba();
  const p = parecidasEnEmpresa(datos, "JUAN PEREZ", "AGRO");
  // Encuentra a JUAN.PEREZ (parecido) y a JUAN PEREZ (igual), los dos de AGRO.
  cierto(p.length === 2, "esperaba 2 de AGRO, dio " + p.length);
});

// ---------------------------------------------------------------------------
grupo("Unir: mover renglones sin perder ni un peso");

prueba("dice de antemano cuántos renglones y cuánta plata mueve", () => {
  const datos = datosDePrueba();
  const previa = simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);
  igual(previa.renglones, 1);
  igual(previa.plata, 10000);
  igual(previa.dias, 1);
});

prueba("simular NO cambia nada", () => {
  const datos = datosDePrueba();
  simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);
  igual(datos.personas.length, 3, "las personas no se pueden haber tocado");
});

prueba("unir mueve los renglones y borra la persona sobrante", () => {
  const datos = datosDePrueba();
  const antes = datos.consumos.length;
  unirPersonas(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);

  igual(datos.consumos.length, antes, "no se puede perder ni crear ningún renglón");
  igual(datos.personas.length, 2, "JUAN.PEREZ tiene que desaparecer");

  const deAgro = datos.consumos.filter((c) => c.empresaCome === "AGRO");
  igual(deAgro.length, 3);
  cierto(deAgro.every((c) => c.persona === "JUAN PEREZ"), "todos quedan a nombre del bueno");
});

prueba("unir NO toca a la persona de la otra empresa", () => {
  const datos = datosDePrueba();
  unirPersonas(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);
  const enBasarili = datos.personas.filter((p) => p.empresaCome === "BASARILI");
  igual(enBasarili.length, 1, "el tocayo de BASARILI se queda quieto");
  const suRenglon = datos.consumos.filter((c) => c.empresaCome === "BASARILI");
  igual(suRenglon.length, 1);
});

prueba("avisa cuando el número de facturas del día va a bajar", () => {
  const datos = datosDePrueba();
  // Los dos nombres comen el MISMO día: hoy son 2 facturas, mañana 1.
  datos.consumos.push(renglon("2026-08-03", "AGRO", "JUAN.PEREZ", 1));
  const previa = simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);
  igual(previa.facturasQueSePierden, 1);
});

prueba("unir TRES nombres de una, no de a dos", () => {
  // Esto no era posible hasta que Personas dejó marcar varias con la casilla.
  // Y es el caso de verdad: de la misma persona quedaron el nombre completo,
  // el apodo y el nombre con un punto, y hay que juntar los tres.
  const datos = datosDePrueba();
  datos.personas.push({ nombre: "JUANCHO PEREZ", empresaCome: "AGRO", empresaFactura: "AGRO" });
  datos.consumos.push(renglon("2026-08-05", "AGRO", "JUANCHO PEREZ", 2));

  const antesRenglones = datos.consumos.length;
  const antesPlata = datos.consumos.reduce((a, c) => a + c.cantidad * c.precioUnitario, 0);

  const previa = simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ", "JUANCHO PEREZ"]);
  igual(previa.renglones, 2, "tiene que contar los renglones de LOS DOS absorbidos");
  igual(previa.plata, 30000, "1 almuerzo de JUAN.PEREZ + 2 de JUANCHO");

  unirPersonas(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ", "JUANCHO PEREZ"]);

  igual(datos.consumos.length, antesRenglones, "no se puede perder ni crear un renglón");
  igual(datos.consumos.reduce((a, c) => a + c.cantidad * c.precioUnitario, 0), antesPlata,
        "la plata del negocio no puede cambiar");

  const deAgro = datos.personas.filter((p) => p.empresaCome === "AGRO");
  igual(deAgro.length, 1, "de los tres nombres tiene que quedar uno solo");
  igual(deAgro[0].nombre, "JUAN PEREZ");

  const renglonesAgro = datos.consumos.filter((c) => c.empresaCome === "AGRO");
  cierto(renglonesAgro.every((c) => c.persona === "JUAN PEREZ"),
         "quedó algún renglón a nombre de uno de los absorbidos");

  // Y el tocayo de la otra empresa sigue intacto: son personas distintas.
  igual(datos.personas.filter((p) => p.empresaCome === "BASARILI").length, 1);
});

prueba("unir tres no cuenta dos veces las facturas del mismo día", () => {
  const datos = datosDePrueba();
  datos.personas.push({ nombre: "JUANCHO PEREZ", empresaCome: "AGRO", empresaFactura: "AGRO" });
  // Los tres comen el MISMO día: hoy son 3 facturas, mañana 1. Se pierden 2.
  datos.consumos.push(renglon("2026-08-03", "AGRO", "JUAN.PEREZ", 1));
  datos.consumos.push(renglon("2026-08-03", "AGRO", "JUANCHO PEREZ", 1));

  const previa = simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ", "JUANCHO PEREZ"]);
  igual(previa.facturasQueSePierden, 2);
});

prueba("si no comen el mismo día, no se pierde ninguna factura", () => {
  const datos = datosDePrueba();
  const previa = simularUnion(datos, "AGRO", "JUAN PEREZ", ["JUAN.PEREZ"]);
  igual(previa.facturasQueSePierden, 0);
});

// ---------------------------------------------------------------------------
grupo("Marcar como distintas y renombrar");

prueba("lo que se marca como distinto no vuelve a aparecer", () => {
  const datos = datosDePrueba();
  igual(gruposParaRevisar(datos).length, 1);
  marcarDistintos(datos, "AGRO", "JUAN PEREZ", "JUAN.PEREZ");
  igual(gruposParaRevisar(datos).length, 0);
});

prueba("renombrar arrastra todos los renglones de esa persona", () => {
  const datos = datosDePrueba();
  const r = renombrarPersona(datos, "AGRO", "JUAN PEREZ", "JUAN PEREZ GOMEZ");
  igual(r.movidos, 2);
  const suyos = datos.consumos.filter((c) => c.persona === "JUAN PEREZ GOMEZ");
  igual(suyos.length, 2);
});

prueba("renombrar a un nombre que ya existe se rechaza con explicación", () => {
  const datos = datosDePrueba();
  let exploto = false;
  try {
    renombrarPersona(datos, "AGRO", "JUAN.PEREZ", "JUAN PEREZ");
  } catch (e) {
    exploto = true;
    cierto(e.message.includes("Unir"), "el mensaje tiene que decir qué hacer");
  }
  cierto(exploto, "tenía que rechazarlo");
});

prueba("la limpieza de una sola vez funde los que quedan iguales", () => {
  const datos = datosDePrueba();
  const r = limpiarTodosLosNombres(datos);
  igual(r.personasFundidas, 1, "JUAN.PEREZ y JUAN PEREZ quedan en uno");
  const enAgro = datos.personas.filter((p) => p.empresaCome === "AGRO");
  igual(enAgro.length, 1);
});

// ---------------------------------------------------------------------------
grupo("El documento manda sobre el parecido de los nombres");

prueba("mismo documento = la misma persona, sin discutir", () => {
  igual(queDiceElDocumento({ documento: "28414" }, { documento: "28414" }), "misma");
});

prueba("documento distinto = dos personas, sin discutir", () => {
  igual(queDiceElDocumento({ documento: "28414" }, { documento: "93695" }), "distinta");
});

prueba("si a alguna le falta el documento, toca mirar el nombre", () => {
  igual(queDiceElDocumento({ documento: "28414" }, {}), "no sabe");
  igual(queDiceElDocumento({}, {}), "no sabe");
});

prueba("dos nombres calcados NO se proponen si el documento dice que son dos", () => {
  const datos = datosDePrueba();
  // Le ponemos documentos distintos a los dos de AGRO: son dos personas
  // que se llaman casi igual, y eso pasa de verdad.
  datos.personas[0].documento = "11111";
  datos.personas[1].documento = "22222";
  igual(gruposParaRevisar(datos).length, 0, "el documento manda: no hay nada que unir");
});

prueba("dos nombres que no se parecen SÍ se proponen si el documento es el mismo", () => {
  // El caso real de MGP: MARTA SALGADO y ELENA QUINTERO eran la misma señora
  // (SALGADO QUINTERO MARTA ELENA). No comparten ni una letra.
  const datos = datosDePrueba();
  datos.personas = [
    { nombre: "MARTA SALGADO", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true, documento: "77777" },
    { nombre: "ELENA QUINTERO", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true, documento: "77777" },
  ];
  datos.consumos = [
    renglon("2026-08-03", "AGRO", "MARTA SALGADO", 1),
    renglon("2026-08-04", "AGRO", "ELENA QUINTERO", 1),
  ];
  const grupos = gruposParaRevisar(datos);
  igual(grupos.length, 1, "el documento las tiene que juntar");
  igual(grupos[0].fuerza, 5, "fuerza 5: probado, no adivinado");
  igual(grupos[0].razon, "tienen el mismo documento");
});
