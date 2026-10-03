// ============================================================================
//  dictado.js  -  Leer el pedido que el señor manda por audio
//
//  Todas las mañanas un señor mayor le dicta a ella los pedidos por una nota
//  de voz. WhatsApp la transcribe, ella copia ese texto y lo pega aquí. Esto
//  lo lee y le dice qué entendió, para que ella apruebe.
//
//  Una transcripción de verdad se ve así (nombres cambiados):
//
//    "Agro James Amórtegui oferta, Pablo Rincón, Paisa, con papas abierto,
//     rado, dos ofertas Solvera, combo de andas maracuyá en agua rayo.
//     Jerson _____ _____. O sea el apellido como de chuleta de pollo si eso
//     está cuatro de 1.5 ... ayer ella pidió un jugo y tocó llevárselo..."
//
//  De ahí salen las cuatro reglas de este archivo:
//
//  1. NO HAY PUNTUACIÓN FIABLE. Un párrafo corrido, comas donde no van
//     ("Paisa, con papas") y ninguna donde sí. La primera versión partía por
//     comas y dio 0 aciertos de 15. El único separador que el señor nunca se
//     salta es EL NOMBRE: cada vez que nombra a alguien empieza un pedido.
//
//  2. EL APELLIDO SOBREVIVE, EL NOMBRE NO. "James Amórtegui" era ANDRES
//     AMORTEGUI; "John Triviño" era JHON TRIVIÑO; "rado" era JAVIER TORRADO.
//     WhatsApp destroza el nombre de pila y respeta el apellido.
//
//  3. UNA SOLA PALABRA NO IDENTIFICA A NADIE. "Juan Camilo" enganchó con una
//     persona llamada JUAN, y el pedido era de CAMILO BERTEL. Con 190
//     personas en una empresa, un nombre de pila suelto se da por DUDOSO
//     siempre, aunque calce exacto.
//
//  4. NADA SE ADIVINA. Todo lo que no sea una coincidencia exacta sale
//     marcado, con la sugerencia al lado. Ella confirma, llama al señor, o lo
//     anota a mano. Un pedido anotado mal es plata cobrada a quien no era, y
//     eso no sale a la luz hasta que alguien reclama a fin de quincena.
//
//  Se buscan en el texto los nombres y platos que la app YA conoce. No se
//  intenta entender cómo habla el señor: eso cambia cada mañana. Lo que no
//  cambia es la lista de gente y el catálogo.
// ============================================================================

import { paraBuscar, normalizar } from "./formato.js";
import { limpiarNombre, esqueletoApretado, distancia } from "./nombres.js";

/**
 * Cuántos platos se piden de verdad en un renglón.
 *
 * Más de dos es rarísimo, y las transcripciones de voz fallan feo con los
 * números: "trece" por "tres" son $ 120.000 de diferencia en una cuenta de
 * cobro, y ese error NO salta a la vista como salta un nombre raro.
 */
export const CANTIDAD_NORMAL = 2;

/** Números dichos con la boca. El señor no dice "1", dice "uno". */
const EN_LETRAS = {
  UN: 1, UNA: 1, UNO: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6,
  SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10, ONCE: 11, DOCE: 12, TRECE: 13,
  CATORCE: 14, QUINCE: 15, VEINTE: 20,
};

/**
 * Palabras que no son ni el nombre ni el plato.
 *
 * Son las que el señor usa para hilar, y las que WhatsApp pone cuando no
 * entiende ("o sea", "si eso"). No tiene que ser perfecta: lo que falte aquí
 * solo le suma a las "palabras que sobran", y eso se marca igual.
 */
const RELLENO = new Set([
  "PARA", "A", "AL", "LE", "LES", "LA", "EL", "LO", "LOS", "LAS", "UN", "UNA",
  "UNO", "Y", "O", "DE", "DEL", "CON", "SIN", "QUE", "ES", "SON", "ME", "SE",
  "SU", "SI", "NO", "YA", "EN", "POR", "FAVOR", "PORFA", "MAS", "TAMBIEN",
  "OTRO", "OTRA", "OTROS", "OTRAS", "ESO", "ESA", "ESE", "ESTO", "ESTA",
  "ESTE", "AHI", "AQUI", "ALLA", "COMO", "SEA", "OSEA", "SIGUE", "DICE",
  "PIDE", "PIDIO", "QUIERE", "LLEVA", "MANDA", "MANDO", "ANOTE", "ANOTA",
  "APUNTE", "APUNTA", "TOCA", "TOCO", "ENTONCES", "PORQUE", "CUANDO",
  "DON", "DONA", "SENOR", "SENORA", "SRA", "SR", "BUENOS", "DIAS", "BUENAS",
  "TARDES", "HOY", "AYER", "SOLO", "ELLA", "ELLOS", "ELLAS", "PEDIDO",
  "PEDIDOS",
]);

// ---------------------------------------------------------------------------
//  El texto, en palabras
// ---------------------------------------------------------------------------

/**
 * El texto pegado, en palabras limpias y en orden.
 *
 * Se quita la puntuación PEGADA a los bordes de cada palabra y nada más:
 * "ALMUERZO," tiene que quedar "ALMUERZO" -- si no, un pedido perfecto sale
 * marcado como dudoso -- pero "1.5" tiene que seguir siendo "1.5", que es
 * como se llama la gaseosa en el catálogo.
 *
 * Los guiones se vuelven espacios ("Coca-Cola" -> COCA COLA) y las rayas
 * bajas con que WhatsApp tapa lo que no entendió ("Jerson _____") se van.
 */
export function palabrasDe(texto) {
  return paraBuscar(String(texto || "")
    .replace(/[_\-–—]+/g, " ")
    // "1,5" y "1.5" son la misma gaseosa: el catálogo la tiene con coma y
    // WhatsApp la escribe con punto.
    .replace(/(\d),(\d)/g, "$1.$2"))
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Z0-9]+/, "").replace(/[^A-Z0-9]+$/, ""))
    .filter(Boolean);
}

/**
 * Si el texto viene pegado DOS veces, se deja una.
 *
 * Pasó con el primer texto de verdad: la transcripción entera, dos veces
 * seguidas. Sin esto, cada almuerzo se anotaría doble.
 */
export function sinRepetir(texto) {
  const t = String(texto || "").trim();
  if (t.length < 80) return { texto: t, estabaRepetido: false };
  const palabras = palabrasDe(t);
  if (palabras.length % 2 !== 0) return { texto: t, estabaRepetido: false };
  const mitad = palabras.length / 2;
  const a = palabras.slice(0, mitad).join(" ");
  const b = palabras.slice(mitad).join(" ");
  if (a && a === b) {
    // Se devuelve la primera mitad del texto ORIGINAL, cortada por donde
    // empieza la segunda copia, para que ella vea su texto y no uno limpio.
    const corte = t.toUpperCase().lastIndexOf(palabras[mitad], Math.ceil(t.length / 2) + 40);
    return { texto: corte > 0 ? t.slice(0, corte).trim() : t, estabaRepetido: true };
  }
  return { texto: t, estabaRepetido: false };
}

const esNumero = (w) => EN_LETRAS[w] !== undefined || /^\d{1,3}$/.test(w);

// ---------------------------------------------------------------------------
//  Los platos
// ---------------------------------------------------------------------------

/** El catálogo, listo para buscar: solo los platos prendidos, los largos primero. */
function catalogoListo(productos) {
  return (productos || [])
    .filter((p) => p && p.nombre && p.activo !== false)
    .map((p) => ({ nombre: p.nombre, palabras: palabrasDe(p.nombre) }))
    .filter((p) => p.palabras.length)
    // Los de más palabras primero: "COCA COLA 1.5" le tiene que ganar a
    // "COCA COLA", o se cobra la grande al precio de la personal.
    .sort((a, b) => b.palabras.length - a.palabras.length);
}

const mismaPalabra = (dicha, delCatalogo) =>
  dicha === delCatalogo || dicha === delCatalogo + "S" || dicha === delCatalogo + "ES";

/**
 * Palabritas que el señor mete ENTRE las palabras de un plato y el catálogo
 * no tiene: el catálogo dice "MANGO LECHE" y él dice "mango en leche"; dice
 * "COMBO CHULETA CERDO" y él "combo en chuleta de cerdo". Se permite saltar
 * UNA entre palabra y palabra. Sin esto no coincidía casi ningún plato real.
 */
const CONECTOR = new Set(["DE", "DEL", "EN", "CON", "LA", "EL", "A"]);

/** Casi la misma: una letra de diferencia, y solo en palabras de cinco o más. */
const casiLaMisma = (dicha, delCatalogo) =>
  delCatalogo.length >= 5 && dicha.length >= 4 && distancia(dicha, delCatalogo, 1) <= 1;

/**
 * Si el plato calza empezando en i, devuelve dónde termina; si no, -1.
 *
 * Con "tolerante", se deja pasar UNA palabra mal oída dentro de un plato de
 * varias: "cuatro de 1.5" es la gaseosa QUATRO 1,5. Lo que calza así no se da
 * por seguro -- sale como sugerencia.
 */
function calzaDesde(palabras, i, suyas, usadas, tolerante = false) {
  let j = i;
  let perdonadas = 0;
  for (let k = 0; k < suyas.length; k++) {
    if (k > 0 && j < palabras.length && !usadas.has(j) &&
        CONECTOR.has(palabras[j]) && !mismaPalabra(palabras[j], suyas[k])) j++;
    if (j >= palabras.length || usadas.has(j)) return -1;
    if (!mismaPalabra(palabras[j], suyas[k])) {
      if (!tolerante || suyas.length < 2 || perdonadas >= 1 || !casiLaMisma(palabras[j], suyas[k])) return -1;
      perdonadas++;
    }
    j++;
  }
  return j - 1;
}

/**
 * TODOS los platos que nombra el texto, con el sitio que ocupan.
 *
 * Se buscan ANTES que los nombres y sobre el texto entero. Así una palabra
 * que es plato no puede confundirse después con una persona, y un renglón
 * del señor con dos platos ("dos almuerzos y una coca cola") da dos pedidos.
 *
 * Tres pasadas, de la más segura a la menos:
 *   1. El plato entero, palabra por palabra, en orden. Seguro.
 *   2. Las dos primeras palabras de un plato largo ("coca cola" sin el
 *      tamaño). Dudoso, y con las opciones si hay varios que empiezan así.
 *   3. Una palabra parecida ("almuerso", "gaseoza"). Dudoso.
 */
export function losPlatos(palabras, productos, reservadas = new Set()) {
  const catalogo = catalogoListo(productos);
  // Lo reservado ya es de un apodo ("el paisa" puede ser una persona): ahí no
  // se buscan platos.
  const usadas = new Set(reservadas);
  const hallados = [];

  // 1. Enteros (saltando un conector si hace falta). Primero los exactos de
  //    TODO el catálogo, y solo después los que tienen una palabra mal oída:
  //    así un plato dicho bien nunca pierde contra uno dicho a medias.
  //
  //    Y entre dos que calzan sobre las mismas palabras, gana el que CUBRE
  //    MÁS de lo dicho. "Combo en chuleta de cerdo" calza con CHULETA DE
  //    CERDO (tres palabras) y con COMBO CHULETA CERDO (las cinco). Ganaba el
  //    primero del catálogo: otro plato, otro precio, y el "combo" sobraba.
  for (const tolerante of [false, true]) {
    const candidatos = [];
    for (const p of catalogo) {
      for (let i = 0; i < palabras.length; i++) {
        if (usadas.has(i)) continue;
        const hasta = calzaDesde(palabras, i, p.palabras, usadas, tolerante);
        if (hasta >= 0) candidatos.push({ p, desde: i, hasta });
      }
    }
    candidatos.sort((a, b) =>
      (b.hasta - b.desde) - (a.hasta - a.desde) ||
      b.p.palabras.length - a.p.palabras.length ||
      a.desde - b.desde);
    for (const c of candidatos) {
      let libre = true;
      for (let k = c.desde; k <= c.hasta; k++) if (usadas.has(k)) { libre = false; break; }
      if (!libre) continue;
      for (let k = c.desde; k <= c.hasta; k++) usadas.add(k);
      hallados.push({ nombre: c.p.nombre, seguro: !tolerante, desde: c.desde, hasta: c.hasta, opciones: [] });
    }
  }

  // 2. Empieza como un plato largo, pero le falta el final.
  for (const p of catalogo) {
    if (p.palabras.length < 3) continue;
    const cabeza = p.palabras.slice(0, 2);
    for (let i = 0; i + 2 <= palabras.length; i++) {
      if (usadas.has(i) || usadas.has(i + 1)) continue;
      if (!mismaPalabra(palabras[i], cabeza[0]) || !mismaPalabra(palabras[i + 1], cabeza[1])) continue;
      // Si varios platos empiezan así ("COCA COLA 1.5" y "COCA COLA
      // PERSONAL"), no se escoge: se dan las opciones y ella decide.
      const empiezanAsi = catalogo.filter((q) =>
        q.palabras.length >= 2 && q.palabras[0] === cabeza[0] && q.palabras[1] === cabeza[1]);
      usadas.add(i); usadas.add(i + 1);
      hallados.push({
        nombre: empiezanAsi.length === 1 ? empiezanAsi[0].nombre : null,
        seguro: false, desde: i, hasta: i + 1,
        opciones: empiezanAsi.map((q) => q.nombre),
      });
    }
  }

  // 3. Mal escritos. Solo palabras de cuatro letras o más: con tres, "DOS"
  //    se parece a "DOÑA" y empieza a inventar platos donde no los hay.
  for (let i = 0; i < palabras.length; i++) {
    if (usadas.has(i)) continue;
    const w = palabras[i];
    if (w.length < 4 || RELLENO.has(w) || esNumero(w)) continue;
    let mejor = null;
    for (const p of catalogo) {
      if (p.palabras.length !== 1) continue;      // solo platos de una palabra
      const suyo = p.palabras[0];
      if (suyo.length < 4) continue;
      const d = distancia(w, suyo, 2);
      if (d <= 2 && (!mejor || d < mejor.d)) mejor = { nombre: p.nombre, d };
    }
    if (mejor) {
      usadas.add(i);
      hallados.push({ nombre: mejor.nombre, seguro: false, desde: i, hasta: i, opciones: [] });
    }
  }

  hallados.sort((a, b) => a.desde - b.desde);
  return { platos: hallados, usadas };
}

/**
 * La cantidad que le toca a un plato.
 *
 * Es el número que esté ANTES del plato y después del anterior: en "dos
 * almuerzos y una coca cola", el "dos" es de los almuerzos y el "una" de la
 * gaseosa. Mirando el renglón entero, los dos saldrían con la misma cantidad
 * y se cobraría de más.
 */
export function cantidadDe(palabras, desde, tope) {
  for (let i = desde - 1; i >= tope; i--) {
    const w = palabras[i];
    if (EN_LETRAS[w] !== undefined) {
      return { valor: EN_LETRAS[w], dicha: true, rara: EN_LETRAS[w] > CANTIDAD_NORMAL };
    }
    if (/^\d{1,3}$/.test(w) && Number(w) >= 1) {
      return { valor: Number(w), dicha: true, rara: Number(w) > CANTIDAD_NORMAL };
    }
  }
  return { valor: 1, dicha: false, rara: false };
}

// ---------------------------------------------------------------------------
//  Las personas
// ---------------------------------------------------------------------------

/** La gente, lista para buscar. */
function genteLista(gente) {
  return (gente || []).filter(Boolean).map((n) => {
    const partes = palabrasDe(limpiarNombre(n));
    return {
      nombre: n,
      esq: esqueletoApretado(n),
      cuantas: partes.length,
      // El apellido es la última palabra tal como está escrita. Es lo que
      // WhatsApp respeta.
      apellido: partes.length > 1 ? partes[partes.length - 1] : "",
      primero: partes.length > 1 ? partes[0] : "",
    };
  });
}

/**
 * Dónde empieza cada persona dentro del texto corrido.
 *
 * Se prueban ventanas de tres, dos y una palabra, saltando lo que ya es
 * plato, número o relleno. Y se es más exigente mientras menos palabras:
 *
 *   - Dos o tres palabras: exacto es seguro; hasta dos letras de diferencia
 *     ("Paula Alvares" por PAOLA ALVAREZ) es dudoso con sugerencia.
 *   - Una palabra: NUNCA es segura. Exacta contra un nombre completo de una
 *     palabra, o exacta contra el APELLIDO de una sola persona, se sugiere.
 *     Si ese apellido es de dos personas, no se escoge ninguna.
 */
export function dondeEstanLosNombres(palabras, gente, ocupadas = new Set(), palabrasDePlato = new Set()) {
  const lista = genteLista(gente);
  if (!lista.length) return [];

  const sirve = (i) => i < palabras.length && !ocupadas.has(i) &&
                       !RELLENO.has(palabras[i]) && !esNumero(palabras[i]);
  // "Suelta" es una palabra que no es nada conocido: ni plato, ni palabra
  // de algún plato, ni número, ni relleno. Es la huella de un nombre que
  // WhatsApp destrozó. "COMBO" solo (sin su plato) NO es suelta: es un plato
  // que no se reconoció, y no puede tomarse por continuación de un nombre.
  const suelta = (i) => sirve(i) && !palabrasDePlato.has(palabras[i]);
  const hallados = [];
  let i = 0;

  while (i < palabras.length) {
    if (!sirve(i)) { i++; continue; }
    let encontrado = null;

    for (const cuantas of [3, 2, 1]) {
      if (i + cuantas > palabras.length) continue;
      let limpia = true;
      for (let k = 0; k < cuantas; k++) if (!sirve(i + k)) { limpia = false; break; }
      if (!limpia) continue;

      const apretado = esqueletoApretado(palabras.slice(i, i + cuantas).join(" "));
      if (apretado.length < 4) continue;

      if (cuantas >= 2) {
        const cerca = [];
        for (const p of lista) {
          const d = distancia(apretado, p.esq, 3);
          if (d <= 2) cerca.push({ nombre: p.nombre, d });
        }
        if (!cerca.length) continue;
        cerca.sort((a, b) => a.d - b.d || a.nombre.localeCompare(b.nombre, "es"));
        const mejor = cerca[0].d;
        const empatadas = cerca.filter((c) => c.d === mejor);
        encontrado = {
          // Si varias empatan a la misma distancia, no se escoge ninguna:
          // escoger sería adivinar.
          nombre: empatadas.length === 1 ? empatadas[0].nombre : null,
          segura: mejor === 0 && empatadas.length === 1,
          opciones: cerca.slice(0, 5).map((c) => c.nombre),
          desde: i, hasta: i + cuantas - 1,
        };
        break;
      }

      // Una sola palabra. Exacta contra el nombre ENTERO de alguien -- aunque
      // ese alguien tenga dos: WhatsApp pega los nombres y "Solvera" es SOL
      // VERA --, o contra el apellido, o contra el primer nombre si es de una
      // sola persona (con tres Camilos no se sugiere ninguno: sería ruido).
      const exactaEntera = lista.filter((p) => p.esq === apretado);
      const porApellido = apretado.length >= 5 ? lista.filter((p) => p.apellido === apretado) : [];
      const porPrimero = lista.filter((p) => p.primero === apretado);
      const candidatas = [...new Set([
        ...exactaEntera, ...porApellido, ...(porPrimero.length === 1 ? porPrimero : []),
      ].map((p) => p.nombre))];
      if (!candidatas.length) continue;
      // Si se reconoció por APELLIDO y justo antes hay una palabra suelta,
      // esa palabra es el nombre de pila que WhatsApp destrozó ("James"
      // Amórtegui). Se la lleva el nombre: no es basura que haya que contar.
      const porElApellido = porApellido.length > 0 && exactaEntera.length === 0;
      const desde = porElApellido && i > 0 && suelta(i - 1) && !hallados.some((h) => h.hasta === i - 1)
        ? i - 1 : i;
      // Si detrás viene otra palabra suelta, el nombre dicho era más largo
      // que lo reconocido: "Juan Camilo" no es JUAN. Se marca y NO se deja
      // confirmar de un toque.
      const incompleto = suelta(i + 1);
      encontrado = {
        nombre: candidatas.length === 1 ? candidatas[0] : null,
        segura: false,          // una palabra nunca es segura
        opciones: candidatas.slice(0, 5),
        desde, hasta: i,
        incompleto,
        dicho: palabras.slice(desde, incompleto ? i + 2 : i + 1).join(" "),
      };
      break;
    }

    if (encontrado) { hallados.push(encontrado); i = encontrado.hasta + 1; }
    else i++;
  }

  // Dos nombres pegados, sin ni una palabra en medio, son UNA persona dicha
  // con dos nombres: "Juan Camilo" dio JUAN y luego CAMILO BERTEL. No se
  // escoge entre los dos -- se dejan los dos como opciones y se dice lo que
  // dijo. El señor siempre mete un plato entre persona y persona; dos
  // nombres seguidos sin plato no son dos personas.
  const juntos = [];
  for (const h of hallados) {
    const previo = juntos[juntos.length - 1];
    if (previo && previo.hasta + 1 === h.desde && previo.hasta === previo.desde) {
      const opciones = [...new Set([...h.opciones, ...previo.opciones])].slice(0, 5);
      juntos[juntos.length - 1] = {
        ...h,
        desde: previo.desde,
        nombre: opciones.length === 1 ? opciones[0] : (h.nombre && !previo.nombre ? h.nombre : null),
        segura: false,
        opciones,
        incompleto: false,
        dicho: palabras.slice(previo.desde, h.hasta + 1).join(" "),
      };
      continue;
    }
    juntos.push(h);
  }
  return juntos;
}

// ---------------------------------------------------------------------------
//  Cómo le dice el señor a cada quien
//
//  Hay errores que ningún parecido rescata. La persona se llama TETE RIVERA,
//  el señor le dice "Tete Tomate" -- un apodo que no está en ninguna lista --
//  y WhatsApp escribe "te tomate". De ahí a TETE RIVERA no hay letras que
//  comparar.
//
//  Pero el señor es CONSTANTE en sus errores: a Tete le va a decir "Tete
//  Tomate" todos los días, y WhatsApp lo va a escribir casi siempre igual.
//  Así que no se adivina: se APRENDE. La primera vez ella dice quién era, y
//  de ahí en adelante "te tomate" es Tete Rivera.
//
//  Se guarda por empresa, y exacto como salió del texto. Es lo que ella
//  enseñó, con su propia mano, así que la próxima vez se da por bueno -- pero
//  la pantalla dice de dónde salió y deja desaprenderlo.
// ---------------------------------------------------------------------------

/** La llave de un apodo: las palabras tal como se leen del texto. */
export function claveDeApodo(dicho) {
  return palabrasDe(dicho).join(" ");
}

/** Los apodos aprendidos de una empresa: [{ dicho, persona }]. */
export function apodosDe(datos, codigoEmpresa) {
  const prefijo = normalizar(codigoEmpresa) + "|";
  return Object.entries((datos && datos.apodos) || {})
    .filter(([llave]) => llave.startsWith(prefijo))
    .map(([llave, persona]) => ({ dicho: llave.slice(prefijo.length), persona }));
}

/**
 * ¿Vale la pena recordar que "esto" es esa persona?
 *
 * No, si es su nombre tal cual (no hay nada que aprender). Y no, si es UNA
 * palabra que comparten varias personas: aprender que "Juan" es Juan Pérez
 * haría que mañana el pedido de Juan Gómez se le anote a Pérez sin preguntar.
 */
export function valeLaPenaAprender(dicho, persona, gente = []) {
  const clave = claveDeApodo(dicho);
  const palabras = clave.split(" ").filter(Boolean);
  if (!clave || !persona) return false;
  if (palabras.length > 4 || clave.replace(/ /g, "").length < 3) return false;
  if (esqueletoApretado(clave) === esqueletoApretado(persona)) return false;
  if (palabras.length === 1) {
    const comparten = genteLista(gente).filter(
      (p) => p.primero === clave || p.apellido === clave || p.esq === clave);
    if (comparten.length > 1) return false;
  }
  return true;
}

/** Recuerda que así le dice el señor a esa persona. Dice si lo aprendió. */
export function aprenderApodo(datos, codigoEmpresa, dicho, persona, gente = []) {
  if (!valeLaPenaAprender(dicho, persona, gente)) return false;
  if (!datos.apodos) datos.apodos = {};
  datos.apodos[normalizar(codigoEmpresa) + "|" + claveDeApodo(dicho)] = persona;
  return true;
}

/** Lo desaprende, por si ella enseñó uno mal. */
export function olvidarApodo(datos, codigoEmpresa, dicho) {
  if (!datos || !datos.apodos) return;
  delete datos.apodos[normalizar(codigoEmpresa) + "|" + claveDeApodo(dicho)];
}

/**
 * Dónde aparecen en el texto los apodos ya aprendidos.
 *
 * Van ANTES que los platos y que los nombres: un apodo puede llevar una
 * palabra que también es plato ("el paisa") o relleno ("la negra").
 *
 * Dos cuidados:
 *   - Un apodo de alguien que ya no está en la lista (se renombró, se unió
 *     con otro) se ignora: no se anota un pedido a nombre de nadie.
 *   - Si justo ahí empieza el nombre COMPLETO de otra persona, gana el
 *     nombre: el apodo "JUAN" no puede comerse a "JUAN CAMILO RESTREPO".
 */
function losApodos(palabras, apodos, gente) {
  const lista = genteLista(gente);
  const vivos = new Map(lista.map((p) => [normalizar(p.nombre), p.nombre]));
  const conocidos = (apodos || [])
    .map((a) => ({ persona: vivos.get(normalizar(a.persona)), palabras: palabrasDe(a.dicho) }))
    .filter((a) => a.persona && a.palabras.length)
    .sort((a, b) => b.palabras.length - a.palabras.length);

  const hayNombreMasLargo = (i, n) => [3, 2].some((c) =>
    c > n && i + c <= palabras.length &&
    lista.some((p) => p.esq === esqueletoApretado(palabras.slice(i, i + c).join(" "))));

  const usadas = new Set();
  const hallados = [];
  for (const a of conocidos) {
    const n = a.palabras.length;
    for (let i = 0; i + n <= palabras.length; i++) {
      let calza = true;
      for (let k = 0; k < n; k++) {
        if (usadas.has(i + k) || palabras[i + k] !== a.palabras[k]) { calza = false; break; }
      }
      if (!calza || hayNombreMasLargo(i, n)) continue;
      for (let k = 0; k < n; k++) usadas.add(i + k);
      hallados.push({
        nombre: a.persona, segura: true, opciones: [], porApodo: true,
        desde: i, hasta: i + n - 1, dicho: a.palabras.join(" "),
      });
    }
  }
  return { hallados, usadas };
}

// ---------------------------------------------------------------------------
//  Leerlo todo
// ---------------------------------------------------------------------------

/**
 * Lee el texto pegado y devuelve lo que entendió: un pedido por plato, cada
 * uno con su persona, y cada uno diciendo si hay algo de qué dudar y qué.
 *
 * El texto se recorre de principio a fin, y se va partiendo en TRAMOS: uno
 * por cada persona que se nombra. Lo que va detrás de un nombre es suyo
 * hasta que aparezca el siguiente.
 *
 * Y hay un tercer caso, que es el que más importa: palabras que no son nada
 * conocido, justo antes de un plato, cuando la persona de antes YA pidió.
 * Eso es alguien a quien no se reconoció -- "rado" por Javier Torrado, "te
 * tomate" por Tete Rivera -- y sale como su PROPIO tramo, "desconocida",
 * para que ella diga quién es. Antes sus platos se le colgaban a la persona
 * anterior: marcados, sí, pero sin forma de decirle a la app de quién eran.
 *
 * "relleno" son palabras de más que hay que ignorar en ESTE texto: el nombre
 * de la empresa, que el señor dice al arrancar ("Agro, fulano...").
 */
export function leerElDictado(textoCrudo, { gente = [], productos = [], apodos = [], relleno = [] } = {}) {
  const { texto, estabaRepetido } = sinRepetir(textoCrudo);
  const deMas = new Set(relleno.flatMap((r) => palabrasDe(r)));
  const palabras = palabrasDe(texto).filter((w) => !deMas.has(w));

  const conApodo = losApodos(palabras, apodos, gente);
  const { platos, usadas } = losPlatos(palabras, productos, conApodo.usadas);
  const palabrasDePlato = new Set(catalogoListo(productos).flatMap((p) => p.palabras));
  const nombres = [
    ...conApodo.hallados,
    ...dondeEstanLosNombres(palabras, gente, usadas, palabrasDePlato),
  ].sort((a, b) => a.desde - b.desde);

  const enUnNombre = new Set();
  for (const n of nombres) for (let i = n.desde; i <= n.hasta; i++) enUnNombre.add(i);

  // "Suelta": no es plato, ni palabra de plato, ni número, ni relleno, ni
  // parte de un nombre. Es la huella de alguien que no se reconoció.
  const suelta = (i) => !usadas.has(i) && !enUnNombre.has(i) && !RELLENO.has(palabras[i]) &&
                        !esNumero(palabras[i]) && !palabrasDePlato.has(palabras[i]);

  // --- 1. Partir en tramos --------------------------------------------------
  const eventos = [
    ...nombres.map((n) => ({ tipo: "nombre", desde: n.desde, hasta: n.hasta, n })),
    ...platos.map((p) => ({ tipo: "plato", desde: p.desde, hasta: p.hasta, p })),
  ].sort((a, b) => a.desde - b.desde);

  const tramos = [];
  let cur = { tipo: "inicio", platos: [], desde: 0, nombreDesde: -1, nombreHasta: -1 };
  let ultimo = -1;
  const cerrar = (dondeEmpiezaElQueSigue) => {
    cur.fin = dondeEmpiezaElQueSigue - 1;
    if (cur.tipo !== "inicio" || cur.platos.length) tramos.push(cur);
  };

  for (const ev of eventos) {
    if (ev.tipo === "nombre") {
      // Los platos de antes del PRIMER nombre son del primero: "un almuerzo
      // para Pedro" también es español.
      const eraElInicio = cur.tipo === "inicio";
      const heredados = eraElInicio ? cur.platos : [];
      if (!eraElInicio) cerrar(ev.desde);
      cur = {
        tipo: "persona", n: ev.n, platos: [...heredados],
        desde: eraElInicio ? 0 : ev.desde, nombreDesde: ev.desde, nombreHasta: ev.hasta,
      };
    } else {
      const corrida = [];
      for (let i = ultimo + 1; i < ev.desde; i++) if (suelta(i)) corrida.push(i);
      // De una a cuatro palabras sueltas antes de un plato son un NOMBRE que
      // no se reconoció -- siempre que la persona de antes ya tenga su plato:
      // el señor le da al menos uno a cada quien, así que lo suelto entre un
      // nombre y su primer plato es un plato mal dicho, no otra persona.
      // Cinco o más ya no son un nombre: es el señor contándole algo.
      const hayAlguienNuevo = corrida.length >= 1 && corrida.length <= 4 &&
                              (cur.tipo === "inicio" || cur.platos.length >= 1);
      if (hayAlguienNuevo) {
        cerrar(corrida[0]);
        const hasta = corrida[corrida.length - 1];
        cur = {
          tipo: "desconocida", platos: [ev.p], desde: corrida[0],
          nombreDesde: corrida[0], nombreHasta: hasta,
          dicho: palabras.slice(corrida[0], hasta + 1).join(" "),
        };
      } else {
        cur.platos.push(ev.p);
      }
    }
    ultimo = ev.hasta;
  }
  cerrar(palabras.length);

  // --- 2. De cada tramo, sus pedidos ----------------------------------------
  const pedidos = [];
  const dudaDelPlato = (p) => {
    if (!p.nombre && p.opciones.length > 1) return `¿cuál: ${p.opciones.join(" o ")}?`;
    if (!p.nombre) return "no se entiende qué pidió";
    if (!p.seguro) return `¿será ${p.nombre}?`;
    return null;
  };

  tramos.forEach((t, cual) => {
    const comoLoDijo = palabras.slice(t.desde, t.fin + 1).join(" ");

    let persona;
    const dudasDelNombre = [];
    let sePuedeDecirQuien = false;
    if (t.tipo === "persona") {
      persona = {
        escrito: t.n.dicho || palabras.slice(t.n.desde, t.n.hasta + 1).join(" "),
        elegida: t.n.nombre, opciones: t.n.opciones, segura: t.n.segura,
        porApodo: t.n.porApodo === true,
      };
      if (!t.n.nombre) dudasDelNombre.push("el nombre se parece a varios");
      else if (!t.n.segura) dudasDelNombre.push(`¿será ${t.n.nombre}?`);
      if (t.n.incompleto) dudasDelNombre.push(`dijo «${t.n.dicho}» y solo reconozco una parte`);
      sePuedeDecirQuien = !t.n.incompleto && t.n.opciones.length > 0;
    } else if (t.tipo === "desconocida") {
      persona = { escrito: t.dicho, elegida: null, opciones: [], segura: false, desconocida: true };
      dudasDelNombre.push(`no sé quién es «${t.dicho}»`);
      sePuedeDecirQuien = true;
    } else {
      persona = { escrito: "", elegida: null, opciones: [], segura: false };
      dudasDelNombre.push("no se entiende de quién es");
    }

    // Las palabras que la app no entendió dentro del tramo. En un pedido
    // limpio son cero. En una divagación del señor son veinte, y ahí adentro
    // puede ir un pedido colgándose de la persona equivocada. Se avisa.
    const sobran = [];
    for (let i = t.desde; i <= t.fin; i++) {
      if (i >= t.nombreDesde && i <= t.nombreHasta) continue;
      // Lo de antes del primer nombre es el saludo, no algo que entender.
      if (t.tipo === "persona" && i < t.nombreDesde) continue;
      if (usadas.has(i) || RELLENO.has(palabras[i]) || esNumero(palabras[i])) continue;
      sobran.push(palabras[i]);
    }
    // UNA sola palabra que sobre ya se marca, y se dice cuál.
    //
    // El umbral era dos, y con eso se perdía plata callada: en "Pablo oferta,
    // sancocho" el sancocho no está en el catálogo, sobraba una palabra, no
    // alcanzaba a marcar, y el pedido salía "listo" con un plato de menos.
    // En el audio de verdad, los pedidos limpios no dejan ni una palabra
    // suelta, así que marcar desde la primera no molesta a los que están bien.
    const dudaDeTexto = sobran.length
      ? [`no entendí: «${sobran.slice(0, 5).join(" ")}${sobran.length > 5 ? "…" : ""}»`]
      : [];

    const base = { tramo: cual, linea: comoLoDijo, persona };

    if (!t.platos.length) {
      const porque = [...dudasDelNombre, "no se entiende qué pidió", ...dudaDeTexto];
      pedidos.push({ ...base, cantidad: 1, cantidadDicha: false,
        producto: { nombre: null, seguro: false, opciones: [] },
        porque, listo: false, soloFaltaElNombre: false });
      return;
    }

    t.platos.forEach((p, k) => {
      const tope = k === 0 ? t.desde : t.platos[k - 1].hasta + 1;
      const cantidad = cantidadDe(palabras, p.desde, tope);
      const porque = [...dudasDelNombre];
      const dp = dudaDelPlato(p);
      if (dp) porque.push(dp);
      if (cantidad.rara) porque.push(`¿de verdad son ${cantidad.valor}?`);
      porque.push(...dudaDeTexto);

      pedidos.push({
        ...base,
        cantidad: cantidad.valor,
        cantidadDicha: cantidad.dicha,
        producto: { nombre: p.nombre, seguro: p.seguro, opciones: p.opciones },
        porque,
        listo: porque.length === 0,
        // Si lo ÚNICO que falla es el nombre, ella lo resuelve en la misma
        // pantalla: escogiendo entre las parecidas, o diciendo quién es la
        // desconocida. Es el caso de todos los días.
        soloFaltaElNombre: porque.length > 0 && porque.length === dudasDelNombre.length &&
                           sePuedeDecirQuien && p.seguro && !cantidad.rara,
      });
    });
  });

  return {
    renglones: pedidos,
    listos: pedidos.filter((x) => x.listo).length,
    porRevisar: pedidos.filter((x) => !x.listo).length,
    // Ni un nombre ni un apodo reconocido: casi siempre es que el audio era
    // de otra empresa.
    nadieReconocido: nombres.length === 0,
    estabaRepetido,
  };
}
