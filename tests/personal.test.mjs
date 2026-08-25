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
  cruzarConPersonal, aplicarDocumentos, coberturaDeDocumentos,
} from "../js/nucleo/personal.js";

// ---------------------------------------------------------------------------
grupo("Reconocer un número de documento");

prueba("una cédula normal", () => {
  igual(comoDocumento("1006128901"), "1006128901");
});

prueba("una cédula con puntos de miles", () => {
  igual(comoDocumento("1.110.583.077"), "1110583077");
});

prueba("un permiso temporal, que viene con las letras pegadas", () => {
  // En la lista de AGRO hay varios "PT 6834361": son permisos de venezolanos.
  igual(comoDocumento("PT 6834361"), "6834361");
  igual(comoDocumento("CC 52376870"), "52376870");
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
  igual(ultimos5("1006128901"), "28901");
  igual(ultimos5("6834361"), "34361");
  igual(ultimos5(""), "");
});

// ---------------------------------------------------------------------------
grupo("Leer la lista venga como venga");

prueba("lee la lista de MGP: nombre partido en 4 columnas y el ID aparte", () => {
  const hojas = {
    Hoja1: [
      ["PERSONAL DE INDUSTRIAS MGP"],
      ["Nº", "1 APELLIDO", "2 APELLIDO", "1 NOMBRE", "2 NOMBRE", "TIPO DE ID", "NUMERO DE ID"],
      ["1", "ACOSTA", "MANRIQUE", "LEIDY", "LORENA", "CC", "1006128414"],
      ["2", "BAUTISTA", "", "CAROLINA", "", "CC", "1110533974"],
    ],
  };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 2);
  igual(gente[0].nombre, "ACOSTA MANRIQUE LEIDY LORENA");
  igual(gente[0].documento, "1006128414");
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
      ["ACOSTA GARCIA LUIS FELIPE", "1006128901"],
      ["CARPINTERO MEDINA ELIMAR DEL CARMEN", "PT 6834361"],
    ],
  };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 2);
  igual(gente[1].nombre, "CARPINTERO MEDINA ELIMAR DEL CARMEN");
  igual(gente[1].documento, "6834361");
});

prueba("las filas de título no se cuelan como personas", () => {
  const hojas = { Hoja1: [["PERSONAL ACTUALIZADO"], ["1 APELLIDO", "1 NOMBRE"]] };
  const { gente } = leerListaDePersonal(hojas);
  igual(gente.length, 0);
});

// ---------------------------------------------------------------------------
grupo("Cruzar el nombre corto de la app con el nombre largo de la empresa");

prueba("el nombre corto cabe en el largo aunque cambie el orden", () => {
  // En la app: "LEIDY ACOSTA". En la empresa: "ACOSTA MANRIQUE LEIDY LORENA".
  cierto(nombreCortoCabeEn("LEIDY ACOSTA", "ACOSTA MANRIQUE LEIDY LORENA"));
  cierto(nombreCortoCabeEn("CAMILO GARZON", "GARZON MORALES JUAN CAMILO"));
});

prueba("no cabe si le falta una palabra", () => {
  cierto(!nombreCortoCabeEn("PEDRO ACOSTA", "ACOSTA MANRIQUE LEIDY LORENA"));
});

prueba("con una sola palabra NO se arriesga a cruzar", () => {
  // "ACOSTA" solo cabría en media empresa. Muy peligroso.
  cierto(!nombreCortoCabeEn("ACOSTA", "ACOSTA MANRIQUE LEIDY LORENA"));
});

prueba("no se deja engañar por una palabra repetida", () => {
  cierto(!nombreCortoCabeEn("JUAN JUAN", "JUAN PEREZ GOMEZ"));
});

// ---------------------------------------------------------------------------
grupo("El cruce completo");

function datosMGP() {
  const consumo = (persona, dia) => ({
    id: persona + dia, fecha: "2026-08-" + dia, empresaCome: "MGP",
    empresaFactura: "MGP", persona, producto: "ALMUERZO", cantidad: 1,
    precioUnitario: 10000, facturable: true, observacion: "", revisar: [],
  });
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [{ codigo: "MGP", razonSocial: "INDUSTRIAS MGP", ultimoDiaQ1: 13, ultimoDiaQ2: 31, activa: true }],
    productos: [{ nombre: "ALMUERZO", activo: true }],
    precios: { "ALMUERZO|MGP": 10000 },
    personas: [
      { nombre: "LEIDY OROZCO", empresaCome: "MGP", empresaFactura: "MGP", activa: true },
      { nombre: "VALENTINA OSPITIA", empresaCome: "MGP", empresaFactura: "MGP", activa: true },
      { nombre: "CAMILO GARZON", empresaCome: "MGP", empresaFactura: "MGP", activa: true },
      { nombre: "PEDRO INEXISTENTE", empresaCome: "MGP", empresaFactura: "MGP", activa: true },
    ],
    consumos: [
      consumo("LEIDY OROZCO", "03"),
      consumo("LEIDY OROZCO", "04"),
      consumo("VALENTINA OSPITIA", "05"),
      consumo("CAMILO GARZON", "06"),
    ],
    cuadres: {},
    nombresDistintos: [],
  };
}

const LISTA_MGP = [
  { nombre: "OROZCO OSPITIA LEIDY VALENTINA", documento: "1110527314" },
  { nombre: "GARZON MORALES JUAN CAMILO", documento: "1006156101" },
  { nombre: "ACOSTA MANRIQUE LEIDY LORENA", documento: "1006128414" },
];

prueba("le pone el documento a quien cruza sin dudas", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  const camilo = plan.asignaciones.find((a) => a.persona.nombre === "CAMILO GARZON");
  cierto(camilo, "CAMILO GARZON tenía que cruzar");
  igual(camilo.documento, "56101", "solo los últimos 5");
  igual(camilo.nombreCompleto, "GARZON MORALES JUAN CAMILO");
});

prueba("DESCUBRE el duplicado que por nombre es invisible", () => {
  // Este es el hallazgo grande: LEIDY OROZCO y VALENTINA OSPITIA son la misma
  // señora. No comparten ni una letra, así que compararlas por parecido de
  // nombre nunca las iba a encontrar. Solo la lista de la empresa lo dice.
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.fusiones.length, 1);

  const f = plan.fusiones[0];
  igual(f.nombreCompleto, "OROZCO OSPITIA LEIDY VALENTINA");
  igual(f.documento, "27314");
  igual(f.integrantes.length, 2);
  // La sugerida es la que tiene más renglones: LEIDY OROZCO tiene 2.
  igual(f.sugerido, "LEIDY OROZCO");
});

prueba("las que no salen en la lista se quedan quietas", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.sinCruzar.length, 1);
  igual(plan.sinCruzar[0].nombre, "PEDRO INEXISTENTE");
});

prueba("los de la lista que no comen aquí no estorban", () => {
  const plan = cruzarConPersonal(datosMGP(), "MGP", LISTA_MGP);
  igual(plan.sobrantes.length, 1);
  igual(plan.sobrantes[0].nombre, "ACOSTA MANRIQUE LEIDY LORENA");
});

prueba("cuando hay dos candidatos NO adivina: lo deja como dudoso", () => {
  const datos = datosMGP();
  datos.personas = [{ nombre: "JUAN PEREZ", empresaCome: "MGP", empresaFactura: "MGP", activa: true }];
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
    nombre: "CAMILO GARZON", empresaCome: "AGRO", empresaFactura: "AGRO", activa: true,
  });
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  cierto(plan.asignaciones.every((a) => a.persona.empresaCome === "MGP"));
  cierto(plan.sinCruzar.every((p) => p.empresaCome === "MGP"));
});

prueba("aplicar guarda el documento en la persona", () => {
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  const r = aplicarDocumentos(datos, plan.asignaciones);
  igual(r.puestos, 1);
  const camilo = datos.personas.find((p) => p.nombre === "CAMILO GARZON");
  igual(camilo.documento, "56101");
});

prueba("cuenta bien cuántas personas tienen documento", () => {
  const datos = datosMGP();
  const plan = cruzarConPersonal(datos, "MGP", LISTA_MGP);
  aplicarDocumentos(datos, plan.asignaciones);
  const c = coberturaDeDocumentos(datos).get("MGP");
  igual(c.total, 4);
  igual(c.conDocumento, 1);
});
