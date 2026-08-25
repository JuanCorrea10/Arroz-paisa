// ============================================================================
//  almacen.js  -  Guardar los datos. La parte más importante de todas.
//
//  Esto es la contabilidad de un negocio: los datos NO se pueden perder.
//  Por eso guardamos en DOS sitios a la vez:
//
//   1. Adentro del navegador (IndexedDB). Es instantáneo y no falla nunca,
//      pero si alguien "limpia el caché" se borra. Por eso solo, no basta.
//
//   2. En una carpeta de verdad del computador, que ella elige una sola vez.
//      Ahí queda "datos.json" siempre al día, y una copia con la fecha del
//      día en "respaldos/". Esa carpeta se puede copiar a una USB o meter
//      en OneDrive y ya está: los datos existen fuera del navegador.
//
//  Si el navegador no deja escribir en carpetas (pasa en el celular), la app
//  no se queda callada: avisa arriba, en amarillo, y ofrece bajar el respaldo.
// ============================================================================

import { datosVacios, completarDatos, validarDatos } from "../nucleo/modelo.js";

const BASE = "arroz-paisa";
const ALMACEN = "todo";
const LLAVE_DATOS = "datos";
const LLAVE_CARPETA = "carpeta";
const LLAVE_ULTIMO_RESPALDO = "ultimoRespaldo";

// ---------------------------------------------------------------------------
//  IndexedDB, envuelto en promesas para que se lea bonito
// ---------------------------------------------------------------------------

let promesaBase = null;

/**
 * Cuánto esperamos a que el navegador abra su base de datos antes de rendirnos.
 *
 * Esto NO sobra. Hay tres casos en los que indexedDB.open() no contesta nunca
 * y se queda callado para siempre: cuando hay otra pestaña de la app abierta
 * bloqueando, cuando el navegador está en modo incógnito con el almacenamiento
 * apagado, y cuando la base quedó dañada. Sin este tope, la app se quedaría en
 * "Abriendo..." eternamente y ella no tendría ni idea de qué pasó. Y quedarse
 * callado cuando algo falla es justo el pecado del Excel que estamos matando.
 */
const TOPE_ABRIR_BASE_MS = 6000;

function abrirBase() {
  if (promesaBase) return promesaBase;

  promesaBase = new Promise((resolver, rechazar) => {
    let yaContesto = false;
    const terminar = (fn, valor) => {
      if (yaContesto) return;
      yaContesto = true;
      clearTimeout(reloj);
      fn(valor);
    };

    const reloj = setTimeout(() => {
      terminar(rechazar, new Error(
        "El navegador no contestó al abrir el archivo de datos. Suele pasar " +
        "cuando hay otra pestaña de la app abierta: ciérrela y vuelva a entrar."
      ));
    }, TOPE_ABRIR_BASE_MS);

    let pedido;
    try {
      pedido = indexedDB.open(BASE, 1);
    } catch (error) {
      // Pasa en modo incógnito con el almacenamiento apagado.
      terminar(rechazar, new Error(
        "Este navegador no deja guardar datos: " + error.message
      ));
      return;
    }

    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN);
    };
    pedido.onsuccess = () => terminar(resolver, pedido.result);
    pedido.onerror = () => terminar(rechazar, pedido.error ||
      new Error("No se pudo abrir el archivo de datos del navegador."));
    pedido.onblocked = () => terminar(rechazar, new Error(
      "Hay otra pestaña de la app abierta y no deja abrir los datos. " +
      "Cierre las otras pestañas y vuelva a entrar."
    ));
  });

  // Si falló, se puede volver a intentar más tarde. Si dejáramos la promesa
  // fallida guardada, la app quedaría rota hasta que se recargue la página.
  promesaBase.catch(() => { promesaBase = null; });

  return promesaBase;
}

async function leerLlave(llave) {
  const db = await abrirBase();
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(ALMACEN, "readonly");
    const p = t.objectStore(ALMACEN).get(llave);
    p.onsuccess = () => resolver(p.result);
    p.onerror = () => rechazar(p.error);
  });
}

async function escribirLlave(llave, valor) {
  const db = await abrirBase();
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(ALMACEN, "readwrite");
    t.objectStore(ALMACEN).put(valor, llave);
    t.oncomplete = () => resolver(true);
    t.onerror = () => rechazar(t.error);
  });
}

// ---------------------------------------------------------------------------
//  La carpeta de datos del computador
// ---------------------------------------------------------------------------

/** ¿Este navegador sabe escribir en carpetas del computador? */
export function soportaCarpeta() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

let carpeta = null; // el "handle" de la carpeta elegida

/**
 * Le pide a la señora que elija una carpeta. Se hace UNA sola vez.
 * Tiene que llamarse desde un clic: los navegadores no dejan abrir este
 * cuadro solos, y con razón.
 */
export async function elegirCarpeta() {
  if (!soportaCarpeta()) {
    throw new Error(
      "Este navegador no puede guardar en carpetas. Use Google Chrome o Microsoft Edge en el computador."
    );
  }
  const elegida = await window.showDirectoryPicker({ id: "arroz-paisa", mode: "readwrite" });
  const permiso = await elegida.requestPermission({ mode: "readwrite" });
  if (permiso !== "granted") throw new Error("No se dio permiso para escribir en la carpeta.");
  carpeta = elegida;
  await escribirLlave(LLAVE_CARPETA, elegida);
  return nombreCarpeta();
}

/** Intenta recuperar la carpeta que ya se había elegido en otra ocasión. */
export async function recuperarCarpeta() {
  if (!soportaCarpeta()) return { estado: "no-soportado" };

  // Si el navegador no deja ni leer, no es motivo para no abrir la app: se
  // sigue sin carpeta y ya. Lo grave sería quedarse tildado aquí.
  let guardada = null;
  try {
    guardada = await leerLlave(LLAVE_CARPETA);
  } catch (error) {
    return { estado: "sin-carpeta", problema: error.message };
  }
  if (!guardada) return { estado: "sin-carpeta" };
  try {
    const permiso = await guardada.queryPermission({ mode: "readwrite" });
    if (permiso === "granted") {
      carpeta = guardada;
      return { estado: "conectada", nombre: guardada.name };
    }
    // El navegador quiere que ella confirme otra vez, con un clic.
    return { estado: "necesita-permiso", nombre: guardada.name };
  } catch {
    return { estado: "sin-carpeta" };
  }
}

/** Vuelve a pedir el permiso. Tiene que llamarse desde un clic. */
export async function reconectarCarpeta() {
  const guardada = await leerLlave(LLAVE_CARPETA);
  if (!guardada) return { estado: "sin-carpeta" };
  const permiso = await guardada.requestPermission({ mode: "readwrite" });
  if (permiso !== "granted") return { estado: "necesita-permiso", nombre: guardada.name };
  carpeta = guardada;
  return { estado: "conectada", nombre: guardada.name };
}

export function hayCarpeta() {
  return carpeta !== null;
}

export function nombreCarpeta() {
  return carpeta ? carpeta.name : null;
}

async function escribirArchivo(directorio, nombre, texto) {
  const archivo = await directorio.getFileHandle(nombre, { create: true });
  const flujo = await archivo.createWritable();
  await flujo.write(texto);
  await flujo.close();
}

// ---------------------------------------------------------------------------
//  Cargar y guardar
// ---------------------------------------------------------------------------

/**
 * Carga los datos al abrir la app.
 * Primero mira la carpeta del computador, porque es la copia buena; si el
 * navegador se limpió, ahí siguen. Si la carpeta no está, usa la copia de
 * adentro del navegador.
 */
export async function cargar() {
  const estadoCarpeta = await recuperarCarpeta();
  let deArchivo = null;

  if (estadoCarpeta.estado === "conectada") {
    try {
      const handle = await carpeta.getFileHandle("datos.json");
      const texto = await (await handle.getFile()).text();
      deArchivo = JSON.parse(texto);
    } catch {
      deArchivo = null; // Todavía no existe el archivo: es la primera vez.
    }
  }

  // Si el navegador no deja leer sus propios datos, seguimos con lo que haya
  // en la carpeta. Perder una fuente no puede impedir abrir la app.
  let deNavegador = null;
  let problemaDelNavegador = null;
  try {
    deNavegador = await leerLlave(LLAVE_DATOS);
  } catch (error) {
    problemaDelNavegador = error.message;
  }

  // Si hay dos copias, nos quedamos con la que tenga más renglones, y si
  // empatan, con la del archivo. Nunca borramos la otra sin avisar.
  let datos = null;
  let origen = "nuevo";
  if (deArchivo && deNavegador) {
    const a = (deArchivo.consumos || []).length;
    const b = (deNavegador.consumos || []).length;
    datos = a >= b ? deArchivo : deNavegador;
    origen = a >= b ? "carpeta" : "navegador";
  } else if (deArchivo) {
    datos = deArchivo;
    origen = "carpeta";
  } else if (deNavegador) {
    datos = deNavegador;
    origen = "navegador";
  }

  if (!datos) {
    return {
      datos: datosVacios(), origen: "nuevo",
      carpeta: estadoCarpeta, problemaDelNavegador,
    };
  }

  const problemas = validarDatos(datos);
  if (problemas.length) {
    return {
      datos: datosVacios(),
      origen: "dañado",
      problemas,
      carpeta: estadoCarpeta,
      problemaDelNavegador,
    };
  }
  return {
    datos: completarDatos(datos), origen,
    carpeta: estadoCarpeta, problemaDelNavegador,
  };
}

let temporizador = null;
let guardando = false;
let pendiente = null;
const oyentes = new Set();

/** Avisa cada vez que se guarda (o cada vez que falla), para pintar el estado. */
export function alGuardar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar(estado) {
  for (const fn of oyentes) {
    try { fn(estado); } catch { /* un oyente roto no puede tumbar el guardado */ }
  }
}

/**
 * Guardado automático. Se llama en CADA cambio.
 * Espera medio segundo por si vienen más cambios seguidos (si no, escribiría
 * el archivo 20 veces mientras ella escribe un nombre), pero nunca más.
 */
export function guardar(datos) {
  pendiente = datos;
  avisar({ estado: "guardando" });
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => { guardarYa(); }, 500);
}

/** Guarda inmediatamente, sin esperar. Se usa al cerrar la ventana. */
export async function guardarYa() {
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
  if (!pendiente || guardando) return;
  const datos = pendiente;
  guardando = true;
  let huboProblema = null;

  // 1) El navegador primero: es lo más rápido y lo que nunca falla.
  try {
    await escribirLlave(LLAVE_DATOS, datos);
  } catch (e) {
    huboProblema = "No se pudo guardar dentro del navegador: " + e.message;
  }

  // 2) La carpeta del computador.
  if (carpeta) {
    try {
      const texto = JSON.stringify(datos);
      await escribirArchivo(carpeta, "datos.json", texto);
      await respaldoDelDia(texto);
    } catch (e) {
      huboProblema = "No se pudo escribir en la carpeta: " + e.message;
      carpeta = null; // Perdimos el permiso; que la app lo diga en pantalla.
    }
  }

  guardando = false;
  pendiente = null;
  avisar(
    huboProblema
      ? { estado: "problema", mensaje: huboProblema, hayCarpeta: hayCarpeta() }
      : { estado: "guardado", cuando: new Date(), hayCarpeta: hayCarpeta() }
  );
}

/**
 * Una copia por día en la carpeta "respaldos".
 * No una por cada cambio: sería un reguero de archivos. Una por día basta
 * para poder decir "devuélvame los datos como estaban el martes".
 */
async function respaldoDelDia(texto) {
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  const sello = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
  const ultimo = await leerLlave(LLAVE_ULTIMO_RESPALDO);
  if (ultimo === sello) return;
  const dir = await carpeta.getDirectoryHandle("respaldos", { create: true });
  await escribirArchivo(dir, `datos-${sello}.json`, texto);
  await escribirLlave(LLAVE_ULTIMO_RESPALDO, sello);
  await borrarRespaldosViejos(dir);
}

/** Deja los últimos 60 respaldos y borra los más viejos. */
async function borrarRespaldosViejos(dir) {
  try {
    const nombres = [];
    for await (const [nombre, handle] of dir.entries()) {
      if (handle.kind === "file" && /^datos-\d{4}-\d{2}-\d{2}\.json$/.test(nombre)) nombres.push(nombre);
    }
    nombres.sort();
    for (const viejo of nombres.slice(0, Math.max(0, nombres.length - 60))) {
      await dir.removeEntry(viejo);
    }
  } catch { /* si no se pueden borrar, no pasa nada grave */ }
}

// ---------------------------------------------------------------------------
//  Respaldo y restauración a mano (funcionan en cualquier navegador)
// ---------------------------------------------------------------------------

/** Baja un archivo .json con TODO. Es el paracaídas. */
export function descargarRespaldo(datos) {
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  const sello = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
  descargarBlob(blob, `respaldo-arroz-paisa-${sello}.json`);
}

/** Lee un archivo .json de respaldo y devuelve los datos, o explica qué le pasa. */
export async function leerRespaldo(archivo) {
  const texto = await archivo.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("Ese archivo no es un respaldo de la app (no se pudo leer).");
  }
  const problemas = validarDatos(datos);
  if (problemas.length) throw new Error("Ese respaldo está incompleto: " + problemas.join(" "));
  return completarDatos(datos);
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Borra todo. Solo se llama después de preguntar dos veces. */
export async function borrarTodoDelNavegador() {
  await escribirLlave(LLAVE_DATOS, undefined);
}
