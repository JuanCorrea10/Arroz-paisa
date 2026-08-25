// ============================================================================
//  personal.js  -  Cruzar las listas de personal de las empresas con la app.
//
//  Las empresas mandan de vez en cuando su lista de empleados. Esa lista trae
//  el nombre COMPLETO y, con suerte, el número de documento. Este archivo la
//  cruza con las personas que ya están en la app.
//
//  Sirve para DOS cosas, y la segunda es la que de verdad vale:
//
//  1. Ponerle documento a cada persona. Con documento se acaba la adivinanza:
//     mismo documento = misma persona, documento distinto = personas distintas.
//
//  2. DESCUBRIR DUPLICADOS QUE POR NOMBRE SON IMPOSIBLES DE VER.
//     Ejemplo real de MGP: en la app estaban "MARTA SALGADO" y
//     "ELENA QUINTERO" como dos personas. En la lista de la empresa hay una
//     sola: "SALGADO QUINTERO MARTA ELENA". Es la misma señora, anotada unas
//     veces por el primer apellido y otras por el segundo. Esos dos nombres no
//     comparten NI UNA LETRA, así que compararlos por parecido nunca los iba a
//     encontrar. Solo se ven cruzando contra la lista de la empresa.
//
//  Igual que calculos.js y nombres.js, este archivo es PURO: recibe datos y
//  devuelve datos. No toca la pantalla y no guarda nada.
// ============================================================================

import { normalizar } from "./formato.js";
import { limpiarNombre, esqueleto } from "./nombres.js";
import { clavePersona } from "./calculos.js";

// ---------------------------------------------------------------------------
//  1. Leer la lista que mandó la empresa
//
//  Cada empresa manda la lista como se le ocurre. MGP la manda con el nombre
//  partido en cuatro columnas (dos apellidos y dos nombres) y el documento
//  aparte. BASARILI la manda con apellidos en una columna y nombres en otra, y
//  sin documento. Otras la mandan de una sola columna.
//
//  En vez de escribir un lector por empresa, que se dañaría con la primera
//  lista nueva, buscamos por FORMA: en cada fila, lo que parece documento es
//  el documento, y todo lo demás es el nombre.
// ---------------------------------------------------------------------------

/** Los tipos de documento que se usan en Colombia. No son parte del nombre. */
const TIPOS_DOCUMENTO = ["CC", "TI", "CE", "PT", "PPT", "PEP", "NIT", "RC", "PA"];

/** Palabras de encabezado. Si una fila las tiene, es un título, no una persona. */
const PALABRAS_DE_TITULO = [
  "APELLIDO", "NOMBRE", "DOCUMENTO", "CEDULA", "IDENTIFICACION",
  "TIPO DE ID", "NUMERO DE ID", "PERSONAL", "LISTADO", "EMPLEADO",
];

/**
 * ¿Esta celda es un número de documento?
 * Aguanta "1110583077", "1.110.583.077", "PT 6834361" y "CC 52376870".
 * Devuelve solo los dígitos, o null.
 */
export function comoDocumento(celda) {
  if (celda === null || celda === undefined) return null;
  let txt = String(celda).trim().toUpperCase();
  if (!txt) return null;

  // Le quitamos el tipo si viene pegado: "PT 6834361" -> "6834361"
  for (const tipo of TIPOS_DOCUMENTO) {
    if (txt.startsWith(tipo + " ") || txt.startsWith(tipo + ".") || txt.startsWith(tipo + "-")) {
      txt = txt.slice(tipo.length).trim();
      break;
    }
  }
  // Y los puntos y espacios de los miles: "1.110.583.077" -> "1110583077"
  const digitos = txt.replace(/[.,\s-]/g, "");
  if (!/^\d+$/.test(digitos)) return null;

  // Una cédula colombiana tiene entre 6 y 11 dígitos. Menos de 6 es el número
  // de fila ("1", "2", "3"), y eso no es un documento.
  if (digitos.length < 6 || digitos.length > 11) return null;
  return digitos;
}

/**
 * Lo único que guardamos del documento: los últimos 5 dígitos.
 *
 * Con 5 dígitos ya se distingue a dos personas del mismo nombre en la misma
 * empresa, que es para lo único que lo necesitamos. Y si algún día alguien se
 * roba el computador, no se lleva una lista de cédulas completas de gente que
 * ni siquiera trabaja aquí. Guardar menos es un cuidado, no una limitación.
 */
export function ultimos5(documento) {
  const d = String(documento || "").replace(/\D/g, "");
  return d ? d.slice(-5) : "";
}

/**
 * Convierte las hojas de un archivo en una lista de gente.
 * Devuelve [{ nombre, documento, fila }].
 */
export function leerListaDePersonal(hojas) {
  const gente = [];
  const avisos = [];

  for (const [nombreHoja, filas] of Object.entries(hojas || {})) {
    if (!Array.isArray(filas)) continue;

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i] || [];
      const celdas = fila.map((c) => (c === null || c === undefined ? "" : String(c).trim()));
      if (!celdas.some((c) => c)) continue;

      // ¿Es una fila de encabezado o un título? Se salta.
      const juntas = celdas.join(" ").toUpperCase();
      if (PALABRAS_DE_TITULO.some((p) => juntas.includes(p)) &&
          !comoDocumento(celdas.find((c) => comoDocumento(c)))) {
        continue;
      }

      // El documento: la primera celda que tenga forma de documento.
      let documento = "";
      const pedazosDelNombre = [];
      for (const celda of celdas) {
        const doc = comoDocumento(celda);
        if (doc && !documento) { documento = doc; continue; }
        // El número de fila (1, 2, 3...) y el tipo de documento no son nombre.
        const limpia = celda.toUpperCase().replace(/[.\s]/g, "");
        if (/^\d{1,5}$/.test(limpia)) continue;
        if (TIPOS_DOCUMENTO.includes(limpia)) continue;
        if (celda) pedazosDelNombre.push(celda);
      }

      const nombre = limpiarNombre(pedazosDelNombre.join(" "));
      // Un nombre de una sola palabra no sirve para cruzar con nada.
      if (!nombre || nombre.split(" ").length < 2) continue;

      gente.push({ nombre, documento, hoja: nombreHoja, fila: i + 1 });
    }
  }

  if (!gente.length) {
    avisos.push("En ese archivo no se encontró ninguna persona. ¿Será el archivo correcto?");
  }

  return { gente, avisos };
}

// ---------------------------------------------------------------------------
//  2. Cruzar la lista con las personas que ya están en la app
//
//  En la app los nombres son cortos ("MARTA SALGADO") y en la lista de la
//  empresa son completos ("SALGADO QUINTERO MARTA ELENA"). La regla es:
//
//     todas las palabras del nombre corto tienen que estar en el largo.
//
//  Se comparan las palabras SUELTAS y sin orden, porque a veces se anota
//  "MARTA SALGADO" y a veces "SALGADO MARTA", y las dos son la misma.
// ---------------------------------------------------------------------------

/** Las palabras de un nombre, sin tildes y sin repetir. */
function palabrasDe(nombre) {
  return esqueleto(nombre).split(" ").filter(Boolean);
}

/** ¿Todas las palabras del nombre corto están en el largo? */
export function nombreCortoCabeEn(nombreCorto, nombreLargo) {
  const cortas = palabrasDe(nombreCorto);
  const largas = palabrasDe(nombreLargo);
  if (cortas.length < 2) return false; // con una sola palabra no se arriesga
  const libres = [...largas];
  for (const palabra of cortas) {
    const donde = libres.indexOf(palabra);
    if (donde === -1) return false;
    libres.splice(donde, 1); // cada palabra se usa una sola vez
  }
  return true;
}

/**
 * El cruce completo. NO toca los datos: solo dice qué pasaría.
 *
 * Devuelve:
 *   asignaciones  las que se pueden poner sin preguntar (un solo candidato)
 *   fusiones      varias personas de la app que resultaron ser UNA sola
 *   dudosas       una persona de la app con varios candidatos: decide ella
 *   sinCruzar     las de la app que no aparecieron en la lista
 *   sobrantes     los de la lista que no come aquí (normal: no todos almuerzan)
 */
export function cruzarConPersonal(datos, codigoEmpresa, gente) {
  const empresa = normalizar(codigoEmpresa);
  const deLaEmpresa = datos.personas.filter(
    (p) => normalizar(p.empresaCome) === empresa
  );

  const asignaciones = [];
  const dudosas = [];
  const sinCruzar = [];

  // Quién de la app pegó con cada persona de la lista. Si a una persona de la
  // lista le pegan DOS o más de la app, es que en la app está duplicada.
  const quienPegoCon = new Map();

  for (const persona of deLaEmpresa) {
    const candidatos = gente.filter((g) => nombreCortoCabeEn(persona.nombre, g.nombre));

    if (candidatos.length === 0) {
      sinCruzar.push(persona);
      continue;
    }
    if (candidatos.length > 1) {
      dudosas.push({ persona, candidatos });
      continue;
    }
    const elegido = candidatos[0];
    if (!quienPegoCon.has(elegido)) quienPegoCon.set(elegido, []);
    quienPegoCon.get(elegido).push(persona);
  }

  const fusiones = [];

  for (const [dePersonal, personasApp] of quienPegoCon) {
    if (personasApp.length === 1) {
      const persona = personasApp[0];
      // Sin documento no hay nada que asignar, pero el cruce igual sirvió para
      // saber que esa persona sí existe en la empresa.
      if (dePersonal.documento) {
        asignaciones.push({
          persona,
          nombreCompleto: dePersonal.nombre,
          documento: ultimos5(dePersonal.documento),
        });
      }
      continue;
    }

    // Aquí está lo bueno: varias personas de la app son en realidad UNA.
    // Se ordenan por renglones para sugerir cuál nombre se queda.
    const conPeso = personasApp.map((p) => ({
      persona: p,
      renglones: datos.consumos.filter(
        (c) => clavePersona(c.empresaCome, c.persona) === clavePersona(p.empresaCome, p.nombre)
      ).length,
    })).sort((a, b) => b.renglones - a.renglones);

    fusiones.push({
      empresa,
      nombreCompleto: dePersonal.nombre,
      documento: ultimos5(dePersonal.documento),
      integrantes: conPeso,
      sugerido: conPeso[0].persona.nombre,
    });
  }

  const usados = new Set([...quienPegoCon.keys()]);
  const sobrantes = gente.filter((g) => !usados.has(g));

  return { empresa, asignaciones, fusiones, dudosas, sinCruzar, sobrantes };
}

// ---------------------------------------------------------------------------
//  3. Aplicar: poner los documentos
//
//  Las fusiones NO se aplican aquí. Se le muestran a ella y las hace con
//  unirPersonas(), que es la única función que sabe mover renglones sin dejar
//  ninguno huérfano.
// ---------------------------------------------------------------------------

export function aplicarDocumentos(datos, asignaciones) {
  let puestos = 0;
  let cambiados = 0;

  for (const a of asignaciones) {
    const persona = datos.personas.find(
      (p) => clavePersona(p.empresaCome, p.nombre) ===
             clavePersona(a.persona.empresaCome, a.persona.nombre)
    );
    if (!persona) continue;
    if (persona.documento === a.documento) continue;
    if (persona.documento) cambiados++;
    else puestos++;
    persona.documento = a.documento;
    persona.nombreCompleto = a.nombreCompleto;
  }
  return { puestos, cambiados };
}

// ---------------------------------------------------------------------------
//  4. Lo que el documento le enseña a la revisión de nombres
// ---------------------------------------------------------------------------

/**
 * Le pone el documento a TODOS los que resultaron ser la misma persona.
 *
 * Esto NO los une: solo anota en cada ficha el documento que la lista de la
 * empresa probó que comparten. Anotar no decide nada y no mueve un peso.
 *
 * Hace falta porque si no, esos nombres se quedan sin documento (aplicarDocumentos
 * solo atiende los cruces de uno a uno) y entonces la pantalla de revisar
 * nombres vuelve a adivinar por letras, cuando ya tenemos la prueba. Con el
 * documento puesto en los tres, la app los muestra como
 * "Probado por el documento", que es lo más fuerte que puede decir.
 */
export function anotarDocumentoDeFusiones(datos, fusiones) {
  let fichas = 0;
  for (const f of fusiones) {
    if (!f.documento) continue;
    for (const x of f.integrantes) {
      const persona = datos.personas.find(
        (p) => clavePersona(p.empresaCome, p.nombre) ===
               clavePersona(x.persona.empresaCome, x.persona.nombre)
      );
      if (!persona) continue;
      persona.documento = f.documento;
      persona.nombreCompleto = f.nombreCompleto;
      fichas++;
    }
  }
  return { fichas };
}

// Ojo: queDiceElDocumento() NO vive aquí, vive en nombres.js. Este archivo ya
// importa de nombres.js, y si nombres.js importara de este quedarían dándose
// vueltas el uno al otro. Las flechas de los import van en un solo sentido.

/** Cuántas personas tienen documento, por empresa. Para mostrar el avance. */
export function coberturaDeDocumentos(datos) {
  const porEmpresa = new Map();
  for (const p of datos.personas) {
    const emp = normalizar(p.empresaCome);
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, { total: 0, conDocumento: 0 });
    const c = porEmpresa.get(emp);
    c.total++;
    if (p.documento) c.conDocumento++;
  }
  return porEmpresa;
}
