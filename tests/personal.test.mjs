// ============================================================================
//  personal.test.mjs  -  Las pruebas del cruce con las listas de las empresas.
//
//  Los casos son reales, sacados de la lista de personal de INDUSTRIAS MGP y
//  de la foto de la lista de AGRO. Los documentos van cambiados: aquí solo
//  interesa que la lógica funcione, no los números de nadie.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  comoDocumento, ultimos5, leerListaDePersonal, nombreCortoCabeEn,
  cruzarConPersonal, aplicarDocumentos, anotarDocumentoDeFusiones,
  coberturaDeDocumentos,
} from "../js/nucleo/personal.js";

// ---------------------------------------------------------------------------
grupo("Reconocer un número de documento");

prueba("una cédula normal", () => {
  igual(comoDocumento("1099000222"), "1099000222");
});

prueba("una cédula con puntos de miles", () => {
  igual(comoDocumento("1.099.000.666"), "1099000666");
});

prueba("un permiso temporal, que viene con las letras pegadas", () => {
  // En la lista de AGRO hay varios "PT 8800111": son permisos de venezolanos.
  igual(comoDocumento("PT 8800111"), "8800111");
  igual(comoDocumento("CC 51000222"), "51000222");
});

prueba("el número de fila NO es un documento", () => {
  // La columna "Nº" trae 1, 2, 3... y no se puede confundir con una cédula.
  igual(comoDocumento("1"), null);
  igual(comoDocumento("47"), null);
  igual(comoDocumento("999"), null);
});

prueba("un nombre no es un documento", () => {
  igual(comoDocumento("JUAN PEREZ"), null);
  igual(comoDocumento(""), null);
  igual(comoDocumento(null), null);
});

prueba("de todo el documento solo se guardan los últimos 5", () => {
  igual(ultimos5("1099000222"), "00222");
  igual(ultimos5("8800111"), "00111");
  igual(ultimos5(""), "");
});

// ---------------------------------------------------------------------------
grupo("Leer la lista venga como venga");

prueba("lee la lista de MGP: nombre partido en 4 columnas y el ID aparte", () => {
  const hojas = {
    Hoja1: [
      ["PERSONAL DE INDUSTRIAS MGP"],
      ["Nº", "1 APELLIDO", "2 APELLIDO", "1 NOMBRE", "2 NOMBRE", "TIPO DE ID", "NUMERO DE ID"],
      ["1", "SALGADO", "MANRIQUE", "MARTA", "LORENA", "CC", "1099000111"],
      ["2", "BAUTISTA", "", "CAROLINA", "", "CC", "1099000333"],
    ],
  };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 2);
  igual(gente[0].nombre, "SALGADO MANRIQUE MARTA LORENA");
  igual(gente[0].documento, "1099000111");
  igual(gente[1].nombre, "BAUTISTA CAROLINA");
});

prueba("lee la lista de BASARILI: apellidos y nombres, sin documento", () => {
  const hojas = {
    Hoja1: [
      ["", "PERSONAL BASARILI"],
      ["", "Araque Cardenas", "Viviana Andrea"],
      ["", "Valdes Ruiz", "Linda"],
    ],
  };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 2);
  igual(gente[0].nombre, "ARAQUE CARDENAS VIVIANA ANDREA");
  igual(gente[0].documento, "");
});

prueba("lee una lista de dos columnas: nombre completo y número", () => {
  const hojas = {
    Hoja1: [
      ["SALGADO GARCIA LUIS FELIPE", "1099000222"],
      ["CARPINTERO MEDINA ELIMAR DEL CARMEN", "PT 8800111"],
    ],
  };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 2);
  igual(gente[1].nombre, "CARPINTERO MEDINA ELIMAR DEL CARMEN");
  igual(gente[1].documento, "8800111");
});

prueba("las filas de título no se cuelan como personas", () => {
  const hojas = { Hoja1: [["PERSONAL ACTUALIZADO"], ["1 APELLIDO", "1 NOMBRE"]] };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 0);
});

// ---------------------------------------------------------------------------
grupo("Cruzar el nombre corto de la app con el nombre largo de la empresa");

prueba("el nombre corto cabe en el largo aunque cambie el orden", () => {
  // En la app: "MARTA SALGADO". En la empresa: "SALGADO MANRIQUE MARTA LORENA".
  cierto(nombreCortoCabeEn("MARTA SALGADO", "SALGADO MANRIQUE MARTA LORENA"));
  cierto(nombreCortoCabeEn("CAMILO GARZON", "GARZON MORALES JUAN CAMILO"));
});

prueba("no cabe si le falta una palabra", () => {
  cierto(!nombreCortoCabeEn("PEDRO SALGADO", "SALGADO MANRIQUE MARTA LORENA"));
});

prueba("con una sola palabra NO se arriesga a cruzar", () => {
  // "SALGADO" solo cabría en media empresa. Muy peligroso.
  cierto(!nombreCortoCabeEn("SALGADO", "SALGADO MANRIQUE MARTA LORENA"));
});

prueba("no se deja engañar por una palabra repetida", () => {
  cierto(!nombreCortoCabeEn("JUAN JUAN", "JUAN PEREZ GOMEZ"));
});

// ---------------------------------------------------------------------------
grupo("El cruce completo");

function datosMGP() {
  const consumo = (persona, dia) => ({
    id: persona + dia, fecha: "2026-08-" + dia, empresa: "MGP", persona, producto: "ALMUERZO", cantidad: 1,
    precioUnitario: 10000, facturable: true, observacion: "", revisar: [],
  });
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [{ codigo: "MGP", razonSocial: "INDUSTRIAS MGP", ultimoDiaQ1: 13, ultimoDiaQ2: 31, activa: true }],
    productos: [{ nombre: "ALMUERZO", activo: true }],
    precios: { "ALMUERZO|MGP": 10000 },
    personas: [
      { nombre: "MARTA SALGADO", empresa: "MGP", activa: true },
      { nombre: "ELENA QUINTERO", empresa: "MGP", activa: true },
      { nombre: "CAMILO GARZON", empresa: "MGP", activa: true },
      { nombre: "PEDRO INEXISTENTE", empresa: "MGP", activa: true },
    ],
    consumos: [
      consumo("MARTA SALGADO", "03"),
      consumo("MARTA SALGADO", "04"),
      consumo("ELENA QUINTERO", "05"),
      consumo("CAMILO GARZON", "06"),
    ],
    cuadres: {},
    nombresDistintos: [],
  };
}

const LISTA_MGP = [
  { nombre: "SALGADO QUINTERO MARTA ELENA", documento: "1099000555" },
  { nombre: "GARZON MORALES JUAN CAMILO", documento: "1099000444" },
  { nombre: "BAUTISTA MANRIQUE LUISA LORENA", documento: "1099000111" },
];

prueba("le pone el documento a quien cruza sin dudas", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  const camilo = plan.asignaciones.find((a) => a.persona.nombre === "CAMILO GARZON");
  cierto(camilo, "CAMILO GARZON tenía que cruzar");
  igual(camilo.documento, "00444", "solo los últimos 5");
  igual(camilo.nombreCompleto, "GARZON MORALES JUAN CAMILO");
});

prueba("DESCUBRE el duplicado que por nombre es invisible", () => {
  // Este es el hallazgo grande: MARTA SALGADO y ELENA QUINTERO son la misma
  // señora. No comparten ni una letra, así que compararlas por parecido de
  // nombre nunca las iba a encontrar. Solo la lista de la empresa lo dice.
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.fusiones.length, 1);

  const f = plan.fusiones[0];
  igual(f.nombreCompleto, "SALGADO QUINTERO MARTA ELENA");
  igual(f.documento, "00555");
  igual(f.integrantes.length, 2);
  // La sugerida es la que tiene más renglones: MARTA SALGADO tiene 2.
  igual(f.sugerido, "MARTA SALGADO");
});

prueba("las que no salen en la lista se quedan quietas", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.sinCruzar.length, 1);
  igual(plan.sinCruzar[0].nombre, "PEDRO INEXISTENTE");
});

prueba("los de la lista que no comen aquí no estorban", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.sobrantes.length, 1);
  igual(plan.sobrantes[0].nombre, "BAUTISTA MANRIQUE LUISA LORENA");
});

prueba("cuando hay dos candidatos NO adivina: lo deja como dudoso", () => {
  const datos = datosMGP();
  datos.personas = [{ nombre: "JUAN PEREZ", empresa: "MGP", activa: true }];
  const lista = [
    { nombre: "PEREZ GOMEZ JUAN CARLOS", documento: "1111111111" },
    { nombre: "PEREZ SILVA JUAN PABLO", documento: "2222222222" },
  ];
  const plan = cruzarConPersonal(datos, "MGP", lista);
  igual(plan.asignaciones.length, 0, "no puede asignar nada");
  igual(plan.dudosas.length, 1);
  igual(plan.dudosas[0].candidatos.length, 2);
});

prueba("solo mira la empresa que se le pidió", () => {
  const datos = datosMGP();
  datos.personas.push({
    nombre: "CAMILO GARZON", empresa: "AGRO", activa: true,
  });
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  cierto(plan.asignaciones.every((a) => a.persona.empresa === "MGP"));
  cierto(plan.sinCruzar.every((p) => p.empresa === "MGP"));
});

prueba("aplicar guarda el documento en la persona", () => {
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  const r = aplicarDocumentos(datos, plan.asignaciones);
  igual(r.puestos, 1);
  const camilo = datos.personas.find((p) => p.nombre === "CAMILO GARZON");
  igual(camilo.documento, "00444");
});

prueba("cuenta bien cuántas personas tienen documento", () => {
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  aplicarDocumentos(datos, plan.asignaciones);
  const c = coberturaDeDocumentos(datos).get("MGP");
  igual(c.total, 4);
  igual(c.conDocumento, 1);
});

prueba("a los que son la misma persona se les anota el documento sin unirlos", () => {
  // Si no se les anotara, esos nombres se quedarian sin documento y la app
  // volveria a adivinar por letras algo que la lista de la empresa ya probo.
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  const antes = datos.personas.length;

  const r = anotarDocumentoDeFusiones(datos, plan.fusiones);

  igual(r.fichas, 2, "las dos fichas del duplicado");
  igual(datos.personas.length, antes, "anotar NO puede unir ni borrar a nadie");

  const marta = datos.personas.find((p) => p.nombre === "MARTA SALGADO");
  const elena = datos.personas.find((p) => p.nombre === "ELENA QUINTERO");
  igual(marta.documento, "00555");
  igual(elena.documento, marta.documento, "el mismo documento en las dos");
});

prueba("con el documento anotado, revisar nombres ya no adivina", async () => {
  const { gruposParaRevisar } = await import("../js/nucleo/nombres.js");
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  anotarDocumentoDeFusiones(datos, plan.fusiones);

  const grupos = gruposParaRevisar(datos);
  const suyo = grupos.find((g) => g.integrantes.some((i) => i.nombre === "MARTA SALGADO"));
  cierto(suyo, "tenia que salir el grupo");
  igual(suyo.fuerza, 5, "fuerza 5: probado, no adivinado");
  igual(suyo.razon, "tienen el mismo documento");
});
