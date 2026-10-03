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

import { paraBuscar } from "./formato.js";
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
  return paraBuscar(String(texto || "").replace(/[_\-–—]+/g, " "))
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

/** Si el plato calza empezando en i, devuelve dónde termina; si no, -1. */
function calzaDesde(palabras, i, suyas, usadas) {
  let j = i;
  for (let k = 0; k < suyas.length; k++) {
    if (k > 0 && j < palabras.length && !usadas.has(j) &&
        CONECTOR.has(palabras[j]) && !mismaPalabra(palabras[j], suyas[k])) j++;
    if (j >= palabras.length || usadas.has(j) || !mismaPalabra(palabras[j], suyas[k])) return -1;
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
export function losPlatos(palabras, productos) {
  const catalogo = catalogoListo(productos);
  const usadas = new Set();
  const hallados = [];

  // 1. Enteros (saltando un conector si hace falta).
  for (const p of catalogo) {
    for (let i = 0; i < palabras.length; i++) {
      if (usadas.has(i)) continue;
      const hasta = calzaDesde(palabras, i, p.palabras, usadas);
      if (hasta < 0) continue;
      for (let k = i; k <= hasta; k++) usadas.add(k);
      hallados.push({ nombre: p.nombre, seguro: true, desde: i, hasta, opciones: [] });
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
//  Leerlo todo
// ---------------------------------------------------------------------------

/**
 * Lee el texto pegado y devuelve lo que entendió: un pedido por plato, cada
 * uno con su persona, y cada uno diciendo si hay algo de qué dudar y qué.
 *
 * El texto se parte en cada nombre. Lo que va entre un nombre y el siguiente
 * es de esa persona; lo que va antes del primer nombre también es del
 * primero ("un almuerzo para Pedro" es español). Si no se reconoce a nadie,
 * los platos que haya salen como "no se entiende de quién es", porque un
 * almuerzo que nadie anota es un almuerzo que nadie cobra.
 */
export function leerElDictado(textoCrudo, { gente = [], productos = [] } = {}) {
  const { texto, estabaRepetido } = sinRepetir(textoCrudo);
  const palabras = palabrasDe(texto);
  const { platos, usadas } = losPlatos(palabras, productos);
  const palabrasDePlato = new Set(catalogoListo(productos).flatMap((p) => p.palabras));
  const nombres = dondeEstanLosNombres(palabras, gente, usadas, palabrasDePlato);

  const pedidos = [];
  const pedido = (extra) => pedidos.push({
    cantidadDicha: false, soloFaltaElNombre: false, ...extra,
    listo: extra.porque.length === 0,
  });

  const dudaDelPlato = (p) => {
    if (!p.nombre && p.opciones.length > 1) return `¿cuál: ${p.opciones.join(" o ")}?`;
    if (!p.nombre) return "no se entiende qué pidió";
    if (!p.seguro) return `¿será ${p.nombre}?`;
    return null;
  };

  // Sin nadie reconocido, los platos salen igual, pero huérfanos.
  if (!nombres.length) {
    for (const p of platos) {
      pedido({
        linea: palabras.join(" "),
        cantidad: cantidadDe(palabras, p.desde, 0).valor,
        persona: { escrito: "", elegida: null, opciones: [], segura: false },
        producto: { nombre: p.nombre, seguro: p.seguro, opciones: p.opciones },
        porque: ["no se entiende de quién es", dudaDelPlato(p)].filter(Boolean),
      });
    }
    return {
      renglones: pedidos, listos: 0, porRevisar: pedidos.length,
      nadieReconocido: true, estabaRepetido,
    };
  }

  // Lo que ocupa cada persona: desde que acaba SU nombre hasta donde empieza
  // el siguiente. El señor dice el nombre y después el plato.
  //
  // La primera versión arrancaba el tramo donde acababa el nombre ANTERIOR,
  // y con eso cada persona se llevaba los platos de la de antes: Santiago
  // salía con la chuleta de Juan Camilo y Octavio con la oferta de Santiago.
  // Cobrado a quien no era, tres veces seguidas.
  //
  // Solo al primero se le suma lo que venga antes de su nombre, por si el
  // señor arranca con el plato: "un almuerzo para Pedro".
  const tramos = nombres.map((n, k) => ({
    ...n,
    inicio: k === 0 ? 0 : n.hasta + 1,
    fin: k + 1 < nombres.length ? nombres[k + 1].desde - 1 : palabras.length - 1,
  }));

  for (const t of tramos) {
    const suyos = platos.filter((p) => p.desde >= t.inicio && p.desde <= t.fin);
    const comoLoDijo = palabras.slice(t.inicio, t.fin + 1).join(" ");

    const dudasDelNombre = [];
    if (!t.nombre) dudasDelNombre.push("el nombre se parece a varios");
    else if (!t.segura) dudasDelNombre.push(`¿será ${t.nombre}?`);
    if (t.incompleto) dudasDelNombre.push(`dijo «${t.dicho}» y solo reconozco una parte`);

    // Las palabras que no son plato, ni número, ni relleno, ni el nombre:
    // lo que la app no entendió. En un pedido limpio son cero. En una
    // divagación del señor son veinte, y ahí adentro puede ir un pedido que
    // se le está colgando a la persona equivocada. Se avisa.
    let sobran = 0;
    for (let i = t.inicio; i <= t.fin; i++) {
      if (i >= t.desde && i <= t.hasta) continue;
      // Lo de antes del primer nombre es el saludo o la empresa ("Agro"),
      // no palabras que la app debía entender.
      if (i < t.desde) continue;
      if (usadas.has(i) || RELLENO.has(palabras[i]) || esNumero(palabras[i])) continue;
      sobran++;
    }
    // Dos palabras sueltas ya es raro en un pedido. Y si hay DOS platos en el
    // mismo tramo con una palabra suelta en medio, lo más probable es que ahí
    // había otra persona que no se reconoció ("...abierto, RADO, dos ofertas"
    // era Javier Torrado), y sus platos se le están colgando a la anterior.
    const sospechoso = sobran >= 2 || (suyos.length >= 2 && sobran >= 1);
    const dudaDeTexto = sospechoso
      ? [`hay ${sobran} ${sobran === 1 ? "palabra" : "palabras"} que no entendí`]
      : [];

    const persona = {
      escrito: t.dicho || palabras.slice(t.desde, t.hasta + 1).join(" "),
      elegida: t.nombre,
      opciones: t.opciones,
      segura: t.segura,
    };

    if (!suyos.length) {
      pedido({
        linea: comoLoDijo, cantidad: 1, persona,
        producto: { nombre: null, seguro: false, opciones: [] },
        porque: [...dudasDelNombre, "no se entiende qué pidió", ...dudaDeTexto],
      });
      continue;
    }

    suyos.forEach((p, k) => {
      const tope = k === 0 ? t.inicio : suyos[k - 1].hasta + 1;
      const cantidad = cantidadDe(palabras, p.desde, tope);
      const porque = [...dudasDelNombre];
      const dp = dudaDelPlato(p);
      if (dp) porque.push(dp);
      if (cantidad.rara) porque.push(`¿de verdad son ${cantidad.valor}?`);
      porque.push(...dudaDeTexto);

      pedido({
        linea: comoLoDijo,
        cantidad: cantidad.valor,
        cantidadDicha: cantidad.dicha,
        persona,
        producto: { nombre: p.nombre, seguro: p.seguro, opciones: p.opciones },
        porque,
        // Si lo ÚNICO que falla es el nombre y hay de dónde escoger, ella lo
        // resuelve en la misma pantalla. Es el caso de todos los días.
        soloFaltaElNombre: porque.length > 0 && porque.length === dudasDelNombre.length &&
                           !t.incompleto && p.seguro && !cantidad.rara && t.opciones.length > 0,
      });
    });
  }

  return {
    renglones: pedidos,
    listos: pedidos.filter((r) => r.listo).length,
    porRevisar: pedidos.filter((r) => !r.listo).length,
    nadieReconocido: false,
    estabaRepetido,
  };
}
