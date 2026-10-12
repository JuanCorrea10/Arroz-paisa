// ============================================================================
//  nube.js  -  Los datos compartidos entre los computadores del negocio
//
//  Desde que la app la usan dos computadores, los datos no pueden vivir en
//  uno solo. Viven en Firestore (la base de datos de Firebase, de Google) y
//  cada computador tiene una copia local que se sincroniza sola: sin
//  internet se sigue trabajando y, al volver, se sube lo pendiente y baja lo
//  de los demás. Eso lo hace la librería; aquí solo se le dice QUÉ.
//
//  Cómo encaja con el resto:
//    - La app sigue mutando estado.datos y llamando cambio(), igual que
//      siempre. almacen.guardarYa() llama a guardar(datos) de aquí, que saca
//      la DIFERENCIA con la última vez (sincronia.js) y escribe solo esos
//      renglones.
//    - Lo que escriben los otros llega por onSnapshot, se APLICA sobre
//      estado.datos renglón por renglón, y se avisa para repintar.
//    - Cada renglón lleva quién lo tocó (_por) y cuándo (_en), para que la
//      administradora pueda ver qué hizo cada quien.
//
//  La librería se carga solo si hay señas en nube-config.js: en el
//  computador sin nube (y en las pruebas) no se pide ni un byte de Firebase.
//
//  Qué NO hace esto: resolver dos cambios al mismo renglón al mismo tiempo.
//  Gana el último, renglón por renglón. Para un consumo (una persona, un
//  plato, un día) eso es lo correcto; dos personas corrigiendo el mismo
//  renglón en el mismo segundo no pasa en una cocina.
// ============================================================================

import { CONFIG_NUBE } from "./nube-config.js";
import { COLECCIONES, DOC_CONFIG, diferencias, aplicar, enLotes, instantanea } from "./sincronia.js";
import { datosVacios, completarDatos } from "../nucleo/modelo.js";

const RUTA_SDK = "../../vendor/firebase/";

let sdk = null;          // { app, auth, db, fs, au } una vez cargado
let usuarioVivo = null;  // { uid, email, nombre, rol }
let datosVivos = null;   // el objeto que la app tiene en la cabeza
let foto = null;         // la instantánea de la última vez (sincronia.js)
let pendientes = 0;      // lotes enviados que el servidor no ha confirmado
let conectado = true;
let despegar = [];       // funciones para soltar los oyentes de Firestore
let enPausa = false;     // nube vacía: no se manda nada hasta subirTodo()

const oyentes = { usuario: new Set(), cambios: new Set(), estado: new Set(), error: new Set() };

function avisar(cual, dato) {
  for (const fn of oyentes[cual]) {
    try { fn(dato); } catch (e) { console.error(e); }
  }
}

export function alCambiarUsuario(fn) { oyentes.usuario.add(fn); return () => oyentes.usuario.delete(fn); }
export function alLlegarCambios(fn) { oyentes.cambios.add(fn); return () => oyentes.cambios.delete(fn); }
export function alCambiarEstado(fn) { oyentes.estado.add(fn); return () => oyentes.estado.delete(fn); }
export function alFallar(fn) { oyentes.error.add(fn); return () => oyentes.error.delete(fn); }

/** ¿Hay señas de un proyecto? Sin ellas, nada de esto se usa. */
export function configurada() {
  return Boolean(CONFIG_NUBE && CONFIG_NUBE.apiKey && CONFIG_NUBE.projectId);
}

/** ¿Está cargada y con alguien adentro? */
export function activa() {
  return Boolean(sdk && usuarioVivo);
}

export function usuario() {
  return usuarioVivo;
}

export function esAdministrador() {
  return Boolean(usuarioVivo && usuarioVivo.rol === "administrador");
}

/** Cómo va: para la lucecita de la barra. */
export function estado() {
  return { activa: activa(), conectado, pendientes, usuario: usuarioVivo };
}

// ---------------------------------------------------------------------------
//  Arrancar y entrar
// ---------------------------------------------------------------------------

/**
 * Carga la librería y espera a saber si ya hay alguien con sesión abierta
 * (Firebase la guarda en el navegador: no toca entrar cada día).
 */
export async function iniciar() {
  if (!configurada()) throw new Error("No hay señas de la nube en nube-config.js.");
  if (sdk) return sdk;

  const [fa, au, fs] = await Promise.all([
    import(RUTA_SDK + "firebase-app.js"),
    import(RUTA_SDK + "firebase-auth.js"),
    import(RUTA_SDK + "firebase-firestore.js"),
  ]);
  const app = fa.initializeApp(CONFIG_NUBE);
  const auth = au.getAuth(app);
  // La copia local, compartida entre pestañas: sin internet se sigue
  // trabajando con ella, y al volver se sincroniza sola.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  sdk = { app, auth, db, fs, au };

  await new Promise((resolver) => {
    let primera = true;
    au.onAuthStateChanged(auth, async (u) => {
      if (u) {
        usuarioVivo = { uid: u.uid, email: u.email || "", nombre: u.email || "", rol: "personal" };
        await leerMiRol();
      } else {
        usuarioVivo = null;
      }
      avisar("usuario", usuarioVivo);
      if (primera) { primera = false; resolver(); }
    });
  });
  return sdk;
}

/**
 * El rol vive en usuarios/{uid}: lo pone quien administra el proyecto. Si no
 * hay documento, es "personal": lo más restringido. Nadie es administrador
 * por accidente.
 */
async function leerMiRol() {
  const { fs, db } = sdk;
  try {
    const d = await fs.getDoc(fs.doc(db, "usuarios", usuarioVivo.uid));
    if (d.exists()) {
      const info = d.data() || {};
      usuarioVivo.rol = info.rol === "administrador" ? "administrador" : "personal";
      if (info.nombre) usuarioVivo.nombre = String(info.nombre);
    }
  } catch (e) {
    console.warn("No se pudo leer el rol:", e);
  }
}

/** Mensajes en español para lo que devuelve Firebase al entrar. */
function porQueNoEntro(e) {
  const codigo = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(codigo)) {
    return "El correo o la clave no son correctos.";
  }
  if (/too-many-requests/.test(codigo)) return "Demasiados intentos. Espere unos minutos e intente de nuevo.";
  if (/network-request-failed/.test(codigo)) return "No hay internet. Para entrar la primera vez hace falta conexión.";
  if (/user-disabled/.test(codigo)) return "Esta cuenta está desactivada. Comuníquese con el administrador.";
  return "No se pudo entrar: " + ((e && e.message) || e);
}

export async function entrar(correo, clave) {
  const { au, auth } = sdk;
  try {
    await au.signInWithEmailAndPassword(auth, String(correo || "").trim(), String(clave || ""));
  } catch (e) {
    throw new Error(porQueNoEntro(e));
  }
  // onAuthStateChanged ya puso usuarioVivo; se espera a que tenga rol.
  for (let i = 0; i < 50 && !usuarioVivo; i++) await new Promise((r) => setTimeout(r, 100));
  return usuarioVivo;
}

export async function salir() {
  for (const fn of despegar) { try { fn(); } catch { /* ya estaba suelto */ } }
  despegar = [];
  datosVivos = null;
  foto = null;
  if (sdk) await sdk.au.signOut(sdk.auth);
}

// ---------------------------------------------------------------------------
//  Cargar y escuchar
// ---------------------------------------------------------------------------

/** Un documento de Firestore vuelto renglón nuestro: los sellos de tiempo
 *  se pasan a milisegundos para que el objeto siga siendo JSON. */
function renglonDe(docSnap) {
  const d = docSnap.data({ serverTimestamps: "estimate" }) || {};
  if (d._en && typeof d._en.toMillis === "function") d._en = d._en.toMillis();
  return d;
}

/**
 * Trae todo y se queda escuchando. Devuelve { datos, vacia }:
 *   vacia = true cuando el servidor confirmó que no hay nada (primera vez):
 *   ahí la administradora sube lo de su computador. Nunca se dice "vacía"
 *   desde la copia local sin internet, porque sería mentira.
 */
export async function cargar() {
  if (!activa()) throw new Error("Nadie ha entrado.");
  const { fs, db } = sdk;
  for (const fn of despegar) { try { fn(); } catch { /* nada */ } }
  despegar = [];

  const documentos = {};
  const primeras = [];
  let todoDesdeCache = true;

  for (const nombre of Object.keys(COLECCIONES)) {
    documentos[nombre] = {};
    let resolverPrimera, rechazarPrimera;
    primeras.push(new Promise((res, rej) => { resolverPrimera = res; rechazarPrimera = rej; }));
    let esLaPrimera = true;

    const soltar = fs.onSnapshot(fs.collection(db, nombre), (snap) => {
      if (esLaPrimera) {
        esLaPrimera = false;
        if (!snap.metadata.fromCache) todoDesdeCache = false;
        for (const d of snap.docs) documentos[nombre][d.id] = renglonDe(d);
        resolverPrimera();
        return;
      }
      if (!datosVivos) return;
      const cambios = snap.docChanges().map((c) => ({
        coleccion: nombre,
        id: c.doc.id,
        accion: c.type === "removed" ? "quitar" : "poner",
        doc: c.type === "removed" ? undefined : renglonDe(c.doc),
      }));
      const { cambiados } = aplicar(datosVivos, cambios, foto);
      if (cambiados) avisar("cambios", { cambiados, coleccion: nombre });
    }, (error) => {
      if (esLaPrimera) rechazarPrimera(error);
      else avisar("error", "Se perdió la conexión con la nube: " + error.message);
    });
    despegar.push(soltar);
  }

  // Conectado o no: Firestore avisa cuando lo que se ve está al día con el
  // servidor. Sirve para la lucecita, no para decidir nada.
  despegar.push(fs.onSnapshotsInSync(db, () => {
    conectado = true;
    avisar("estado", estado());
  }));

  try {
    await Promise.all(primeras);
  } catch (e) {
    throw new Error(traducirError(e));
  }

  const datos = completarDatos(documentosADatos(documentos));
  datosVivos = datos;
  foto = instantanea(datos);
  const vacia = !todoDesdeCache && !datos.empresas.length && !datos.consumos.length;
  return { datos, vacia, desdeCache: todoDesdeCache };
}

function documentosADatos(documentos) {
  const base = datosVacios();
  const cambios = [];
  for (const [coleccion, docs] of Object.entries(documentos)) {
    for (const [id, doc] of Object.entries(docs)) cambios.push({ coleccion, id, accion: "poner", doc });
  }
  aplicar(base, cambios);
  return base;
}

function traducirError(e) {
  const codigo = (e && e.code) || "";
  if (/permission-denied/.test(codigo)) {
    return "Esta cuenta no tiene permiso para ver los datos. Pídale al administrador que la active (usuarios/" +
      ((usuarioVivo && usuarioVivo.uid) || "?") + ").";
  }
  if (/unavailable/.test(codigo)) return "No hay internet y este computador todavía no tiene copia de los datos.";
  return (e && e.message) || String(e);
}

// ---------------------------------------------------------------------------
//  Guardar: solo lo que cambió
// ---------------------------------------------------------------------------

/**
 * Lo llama almacen.guardarYa() con el objeto entero. Aquí se saca la
 * diferencia con la última vez y se mandan solo esos renglones, con el
 * sello de quién. Devuelve cuántos renglones se mandaron.
 *
 * No se espera la confirmación del servidor: con la copia local el cambio
 * ya quedó, y sin internet la confirmación puede tardar horas. Lo pendiente
 * se cuenta para la lucecita.
 */
export function guardar(datos) {
  if (!activa() || enPausa) return 0;
  // Si la app reemplazó el objeto entero (devolver un respaldo, traer el
  // Excel), desde ahora se escucha sobre el nuevo.
  datosVivos = datos;
  const { cambios, instantanea: nueva } = diferencias(foto, datos);
  foto = nueva;
  if (!cambios.length) return 0;
  mandar(cambios);
  return cambios.length;
}

/**
 * Con la nube vacía no se manda nada: si cada cambio subiera la diferencia
 * contra "nada", el primer plato anotado subiría el archivo entero sin que
 * nadie lo decidiera, y con una cuenta de personal fallaría a medias.
 */
export function pausar(si) {
  enPausa = Boolean(si);
}

/** Primera vez: sube TODO lo de este computador. Devuelve cuántos renglones. */
export async function subirTodo(datos) {
  if (!activa()) throw new Error("Nadie ha entrado.");
  enPausa = false;
  datosVivos = datos;
  const { cambios, instantanea: nueva } = diferencias(null, datos);
  foto = nueva;
  await mandar(cambios, true);
  return cambios.length;
}

function mandar(cambios, esperar = false) {
  const { fs, db } = sdk;
  const sello = { _por: usuarioVivo.email || usuarioVivo.uid, _en: fs.serverTimestamp() };
  const promesas = [];
  for (const lote of enLotes(cambios, 450)) {
    const batch = fs.writeBatch(db);
    for (const c of lote) {
      const ref = c.coleccion === "config" ? fs.doc(db, "config", DOC_CONFIG) : fs.doc(db, c.coleccion, c.id);
      if (c.accion === "quitar") batch.delete(ref);
      else batch.set(ref, { ...c.doc, ...sello });
    }
    pendientes++;
    avisar("estado", estado());
    const p = batch.commit()
      .then(() => { pendientes--; conectado = true; })
      .catch((e) => {
        pendientes--;
        // Lo más probable: una cuenta de personal intentó cambiar algo de
        // administrador. Firestore ya deshizo el cambio en la copia local y
        // el renglón vuelve a como estaba en el servidor; aquí solo se dice.
        avisar("error", /permission-denied/.test(e.code || "")
          ? "La nube no aceptó un cambio: esta cuenta no tiene permiso para eso. El renglón vuelve a como estaba."
          : "La nube no aceptó un cambio: " + e.message);
      })
      .finally(() => avisar("estado", estado()));
    promesas.push(p);
  }
  return esperar ? Promise.all(promesas) : Promise.resolve();
}
