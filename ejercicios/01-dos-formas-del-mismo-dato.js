// ============================================================================
//  EJERCICIO 1  -  Un dato puede tener dos formas
//
//  Lee primero 01-dos-formas-del-mismo-dato.md
//
//  Abajo hay una funcion unir() con un bug de verdad, el que yo cometi hoy
//  escribiendo esta app. Las pruebas del final estan en rojo.
//  Arregla unir() hasta que se pongan verdes.
//
//  NO toques las pruebas. Si cambias las pruebas para que pasen, el bug sigue
//  ahi y ademas ya nadie te va a avisar. (Eso tambien se aprende temprano.)
// ============================================================================

/**
 * Deja un nombre en su forma buena: sin puntos, sin espacios de sobra,
 * en mayusculas. Esta funcion esta bien. No la toques.
 *
 *    limpiarNombre("  juan.  perez ")  ->  "JUAN PEREZ"
 */
export function limpiarNombre(texto) {
  return String(texto || "")
    .replace(/[.,;:_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Deja un nombre como se guarda en los renglones: en mayusculas y sin espacios
 * de sobra, pero SIN quitarle los puntos. Tambien esta bien. No la toques.
 *
 *    comoEstaGuardado("  juan. perez ")  ->  "JUAN. PEREZ"
 */
export function comoEstaGuardado(texto) {
  return String(texto || "").replace(/\s+/g, " ").trim().toUpperCase();
}

// ---------------------------------------------------------------------------
//  ESTA es la funcion que tienes que arreglar.
// ---------------------------------------------------------------------------

/**
 * Une varias fichas de persona en una sola.
 *
 * Todos los renglones que esten a nombre de alguno de "nombresMalos" tienen
 * que pasar a estar a nombre de "nombreBueno", ya limpio.
 *
 * Devuelve cuantos renglones movio.
 *
 * OJO con el caso dificil: nombreBueno puede ser "JUAN PEREZ" y en nombresMalos
 * puede venir "JUAN.PEREZ". Son DOS fichas distintas, aunque al limpiarlas
 * queden iguales.
 */
export function unir(datos, nombreBueno, nombresMalos) {
  // ----------------------- TU CODIGO EMPIEZA AQUI -----------------------
  const bueno = limpiarNombre(nombreBueno);

  const malos = nombresMalos
    .map(limpiarNombre)
    .filter((n) => n !== bueno);

  let movidos = 0;
  for (const renglon of datos.renglones) {
    if (malos.includes(limpiarNombre(renglon.persona))) {
      renglon.persona = bueno;
      movidos++;
    }
  }

  // La ficha que sobra sale de la lista.
  datos.personas = datos.personas.filter(
    (p) => !malos.includes(limpiarNombre(p.nombre))
  );

  return movidos;
  // ------------------------ TU CODIGO TERMINA AQUI ----------------------
}

// ============================================================================
//  LAS PRUEBAS  -  no las toques
// ============================================================================

/** Unos datos de mentiras, chiquitos, para poder probar. */
function datosDePrueba() {
  return {
    personas: [
      { nombre: "JUAN PEREZ" },
      { nombre: "JUAN.PEREZ" },
    ],
    renglones: [
      { persona: "JUAN PEREZ", plato: "ALMUERZO" },
      { persona: "JUAN PEREZ", plato: "GASEOSA" },
      { persona: "JUAN.PEREZ", plato: "ALMUERZO" },
    ],
  };
}

export const PRUEBAS = [
  {
    nombre: "mueve el renglon de la ficha con punto",
    correr() {
      const datos = datosDePrueba();
      const movidos = unir(datos, "JUAN PEREZ", ["JUAN.PEREZ"]);
      if (movidos !== 1) {
        throw new Error(`esperaba mover 1 renglon, movio ${movidos}`);
      }
    },
  },
  {
    nombre: "los 3 renglones quedan a nombre de JUAN PEREZ",
    correr() {
      const datos = datosDePrueba();
      unir(datos, "JUAN PEREZ", ["JUAN.PEREZ"]);
      const malos = datos.renglones.filter((r) => r.persona !== "JUAN PEREZ");
      if (malos.length !== 0) {
        throw new Error(
          "quedaron renglones con otro nombre: " +
          malos.map((r) => JSON.stringify(r.persona)).join(", ")
        );
      }
    },
  },
  {
    nombre: "la ficha repetida desaparece de la lista",
    correr() {
      const datos = datosDePrueba();
      unir(datos, "JUAN PEREZ", ["JUAN.PEREZ"]);
      if (datos.personas.length !== 1) {
        throw new Error(
          `esperaba 1 ficha, quedaron ${datos.personas.length}: ` +
          datos.personas.map((p) => JSON.stringify(p.nombre)).join(", ")
        );
      }
    },
  },
  {
    nombre: "no se pierde ni se inventa ningun renglon",
    correr() {
      const datos = datosDePrueba();
      unir(datos, "JUAN PEREZ", ["JUAN.PEREZ"]);
      if (datos.renglones.length !== 3) {
        throw new Error(`esperaba 3 renglones, quedaron ${datos.renglones.length}`);
      }
    },
  },
  {
    nombre: "no se une a alguien consigo mismo",
    correr() {
      const datos = datosDePrueba();
      // Le pasamos el mismo nombre como bueno y como malo: no debe hacer nada
      // raro ni borrar la ficha buena.
      unir(datos, "JUAN PEREZ", ["JUAN PEREZ"]);
      const quedaElBueno = datos.personas.some((p) => p.nombre === "JUAN PEREZ");
      if (!quedaElBueno) {
        throw new Error("se borro la ficha buena");
      }
    },
  },
];
