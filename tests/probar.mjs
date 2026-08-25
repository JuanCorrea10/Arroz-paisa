// ============================================================================
//  probar.mjs  -  Un probador de pruebas diminuto, hecho a mano.
//
//  No usamos ninguna librería de pruebas a propósito: son 40 líneas y así
//  no hay nada raro que se pueda dañar ni que haya que instalar.
// ============================================================================

const pendientes = [];
let grupoActual = "";

export function grupo(nombre) {
  grupoActual = nombre;
}

export function prueba(nombre, fn) {
  pendientes.push({ grupo: grupoActual, nombre, fn });
}

class FalloDePrueba extends Error {}

export function igual(obtenido, esperado, nota = "") {
  const a = JSON.stringify(obtenido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    throw new FalloDePrueba(
      `${nota ? nota + "\n      " : ""}esperaba: ${b}\n      pero dio: ${a}`
    );
  }
}

export function cierto(condicion, nota = "esperaba que fuera cierto") {
  if (!condicion) throw new FalloDePrueba(nota);
}

/**
 * Corre las pruebas y devuelve el resultado en datos, sin imprimir nada.
 * Lo usa la página tests/pruebas.html, que las corre en el navegador porque
 * en este computador no hay Node instalado.
 */
export async function correrYDevolver() {
  const resultados = [];
  for (const p of pendientes) {
    try {
      await p.fn();
      resultados.push({ grupo: p.grupo, nombre: p.nombre, paso: true });
    } catch (e) {
      resultados.push({ grupo: p.grupo, nombre: p.nombre, paso: false, mensaje: e.message });
    }
  }
  return resultados;
}

export async function correrTodo() {
  let pasaron = 0;
  const fallaron = [];
  let ultimoGrupo = null;

  for (const p of pendientes) {
    if (p.grupo !== ultimoGrupo) {
      ultimoGrupo = p.grupo;
      console.log(`\n  ${p.grupo}`);
    }
    try {
      await p.fn();
      pasaron++;
      console.log(`    OK   ${p.nombre}`);
    } catch (e) {
      fallaron.push({ ...p, error: e });
      console.log(`    MAL  ${p.nombre}`);
      console.log(`         ${e.message.split("\n").join("\n         ")}`);
      if (!(e instanceof FalloDePrueba)) console.log(e.stack);
    }
  }

  console.log("\n" + "-".repeat(64));
  if (fallaron.length === 0) {
    console.log(`  TODO BIEN. Pasaron las ${pasaron} pruebas.`);
  } else {
    console.log(`  Pasaron ${pasaron}. FALLARON ${fallaron.length}:`);
    for (const f of fallaron) console.log(`    - ${f.grupo} / ${f.nombre}`);
  }
  console.log("-".repeat(64) + "\n");
  // process solo existe en Node. En el navegador no, y no pasa nada.
  if (typeof process !== "undefined") process.exitCode = fallaron.length ? 1 : 0;
  return fallaron.length === 0;
}
