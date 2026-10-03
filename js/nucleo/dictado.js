// ============================================================================
//  dictado.js  -  Leer el pedido que el señor manda por audio
//
//  Todas las mañanas un señor le dicta a ella los pedidos por una nota de voz.
//  WhatsApp la transcribe, ella copia ese texto y lo pega aquí. Esto lo lee y
//  le dice qué entendió, renglón por renglón, para que ella apruebe.
//
//  LA DECISIÓN QUE MANDA EN TODO EL ARCHIVO: no se intenta entender cómo habla
//  el señor. Se BUSCAN en el texto los nombres y los platos que la app ya
//  conoce.
//
//  Es a propósito. Un lector de gramática ("para X un Y") se rompe en cuanto
//  el señor dice "a la señora Paola el almuerzo de siempre", y un señor mayor
//  dictando a las seis de la mañana dice las cosas de doce formas distintas.
//  Buscando contra las 562 personas y los 77 platos que ya existen, da igual
//  el orden y da igual el relleno.
//
//  Y nada de esto adivina a ciegas: todo lo que no sea una coincidencia exacta
//  sale MARCADO. Ella llama al señor, pregunta, y corrige. Un pedido anotado
//  mal es plata mal cobrada, así que aquí la duda nunca se resuelve sola.
// ============================================================================

import { paraBuscar, normalizar } from "./formato.js";
import { limpiarNombre, esqueleto, esqueletoApretado, distancia } from "./nombres.js";

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
 * Sin esto, "para la señora Paola" se compara entero contra la lista y no
 * encuentra a nadie. No hace falta que la lista sea perfecta: lo que sobre
 * solo le resta puntos a la comparación, y lo dudoso sale marcado igual.
 */
const RELLENO = new Set([
  "PARA", "A", "AL", "LE", "EL", "LA", "LOS", "LAS", "UN", "UNA", "UNO",
  "Y", "DE", "DEL", "CON", "SIN", "QUE", "ES", "SON", "ME", "SE", "SU",
  "DON", "DOÑA", "SENOR", "SEÑOR", "SENORA", "SEÑORA", "SRA", "SR",
  "POR", "FAVOR", "PORFA", "MAS", "MÁS", "TAMBIEN", "TAMBIÉN", "OTRO", "OTRA",
  "PIDE", "PIDIO", "PIDIÓ", "QUIERE", "LLEVA", "MANDA", "DICE", "ANOTE",
  "ANOTA", "APUNTE", "APUNTA", "BUENOS", "DIAS", "DÍAS", "BUENAS", "TARDES",
]);

/** Parte el texto pegado en renglones: un pedido por renglón. */
function enRenglones(texto) {
  return String(texto || "")
    // Los saltos de línea mandan, pero el señor también separa con punto y
    // con "y": "Paola un almuerzo, Pedro una gaseosa".
    .split(/[\n\r]+|[;]|(?<=\w)\s*[.]\s+|,/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/** Las palabras de un renglón, normalizadas y en orden. */
function palabrasDe(renglon) {
  return paraBuscar(renglon).split(/\s+/).filter(Boolean);
}

/**
 * TODOS los platos que nombra un renglón, con el sitio que ocupan.
 *
 * Son varios a propósito: "Pedro dos almuerzos y una coca cola" es un solo
 * renglón y dos pedidos. Buscando un plato nada más, la gaseosa se perdía --
 * y peor, la palabra "almuerzos" se quedaba pegada al nombre y el renglón
 * salía marcado como dudoso cuando estaba perfecto.
 *
 * Devuelve también DESDE y HASTA (en número de palabra) porque con eso se
 * sabe qué cantidad le toca a cada plato y qué palabras NO son del nombre.
 */
export function losPlatos(palabras, productos) {
  const activos = (productos || [])
    .filter((p) => p && p.nombre && p.activo !== false)
    // Los de nombre largo primero: así "COCA COLA 1.5" le gana a "COCA COLA"
    // y no se cobra la personal al precio de la grande.
    .sort((a, b) => paraBuscar(b.nombre).split(/\s+/).length - paraBuscar(a.nombre).split(/\s+/).length);

  const usadas = new Set();
  const hallados = [];

  // 1. Los que están dichos tal cual.
  for (const p of activos) {
    const suyas = paraBuscar(p.nombre).split(/\s+/).filter(Boolean);
    if (!suyas.length) continue;
    for (let i = 0; i + suyas.length <= palabras.length; i++) {
      if (usadas.has(i)) continue;
      const calza = suyas.every((w, k) => {
        const aqui = palabras[i + k];
        return !usadas.has(i + k) && (aqui === w || aqui === w + "S" || aqui === w + "ES");
      });
      if (!calza) continue;
      for (let k = 0; k < suyas.length; k++) usadas.add(i + k);
      hallados.push({ nombre: p.nombre, seguro: true, desde: i, hasta: i + suyas.length - 1 });
    }
  }

  // 2. Los mal escritos: "almuerso", "gaseoza". Solo palabras de cuatro
  //    letras o más -- con tres, "DOS" se parece a "DOÑA" y empieza a
  //    inventar platos donde no los hay.
  for (let i = 0; i < palabras.length; i++) {
    if (usadas.has(i)) continue;
    const w = palabras[i];
    if (w.length < 4 || RELLENO.has(w) || EN_LETRAS[w] !== undefined) continue;
    let mejor = null;
    for (const p of activos) {
      const suyo = esqueletoApretado(p.nombre);
      if (suyo.length < 4) continue;
      const d = distancia(w, suyo, 2);
      if (d <= 2 && (!mejor || d < mejor.d)) mejor = { nombre: p.nombre, d };
    }
    if (mejor) {
      usadas.add(i);
      hallados.push({ nombre: mejor.nombre, seguro: false, desde: i, hasta: i });
    }
  }

  hallados.sort((a, b) => a.desde - b.desde);
  return { platos: hallados, usadas };
}

/**
 * La cantidad que le toca a un plato.
 *
 * Es el número que esté ANTES del plato y después del plato anterior: en
 * "dos almuerzos y una coca cola", el "dos" es de los almuerzos y el "una"
 * de la gaseosa. Mirando el renglón entero, los dos platos saldrían con la
 * misma cantidad y se cobraría de más.
 */
export function cantidadDe(palabras, desde, tope) {
  for (let i = desde - 1; i >= tope; i--) {
    const w = palabras[i];
    if (EN_LETRAS[w] !== undefined) {
      const n = EN_LETRAS[w];
      return { valor: n, dicha: true, rara: n > CANTIDAD_NORMAL };
    }
    if (/^\d{1,3}$/.test(w) && Number(w) >= 1) {
      const n = Number(w);
      return { valor: n, dicha: true, rara: n > CANTIDAD_NORMAL };
    }
  }
  return { valor: 1, dicha: false, rara: false };
}

/**
 * La persona del renglón, buscada contra la gente de esa empresa.
 *
 * Recibe qué posiciones ya se llevó el plato, para no meterlas en el nombre.
 *
 * Devuelve las OPCIONES cuando hay más de una parecida. Que haya dos
 * candidatas no es un fallo: es justo lo que ella necesita saber para
 * preguntarle al señor cuál de las dos era.
 */
export function laPersona(palabras, usadas, gente) {
  const sueltas = palabras.filter((p, i) =>
    !usadas.has(i) && !RELLENO.has(p) && EN_LETRAS[p] === undefined && !/^\d+$/.test(p));

  const escrito = limpiarNombre(sueltas.join(" "));
  if (!escrito) return { escrito: "", elegida: null, opciones: [], segura: false };

  const lista = (gente || []).filter(Boolean);

  // Exacta: el esqueleto coincide. Da igual el orden y las tildes.
  const esq = esqueleto(escrito);
  const exactas = lista.filter((n) => esqueleto(n) === esq);
  if (exactas.length === 1) return { escrito, elegida: exactas[0], opciones: [], segura: true };
  if (exactas.length > 1) return { escrito, elegida: null, opciones: exactas, segura: false };

  // Por parecido. Se guardan TODAS las que empaten de cerca: escoger una
  // cuando hay dos a la misma distancia es adivinar, y adivinar un nombre es
  // cobrarle a la persona equivocada.
  const apretado = esqueletoApretado(escrito);
  const cerca = [];
  for (const n of lista) {
    const d = distancia(apretado, esqueletoApretado(n), 3);
    if (d <= 3) cerca.push({ nombre: n, d });
  }
  cerca.sort((a, b) => a.d - b.d || a.nombre.localeCompare(b.nombre, "es"));
  if (!cerca.length) return { escrito, elegida: null, opciones: [], segura: false };

  const laMejor = cerca[0].d;
  const empatadas = cerca.filter((c) => c.d === laMejor);
  return {
    escrito,
    elegida: empatadas.length === 1 ? empatadas[0].nombre : null,
    // Hasta cinco: una lista de veinte nombres no se lee, se cierra.
    opciones: cerca.slice(0, 5).map((c) => c.nombre),
    segura: false,
  };
}

/**
 * Lee el texto pegado y devuelve lo que entendió, un pedido por renglón.
 *
 * Un renglón del señor puede dar DOS pedidos ("almuerzo y gaseosa"), y los
 * dos salen por separado, como se van a anotar.
 *
 * NADA se da por bueno solo: cada pedido trae "listo" en falso si hay algo de
 * qué dudar, y "porque" dice qué es, en español, para que ella sepa qué
 * preguntarle al señor.
 */
export function leerElDictado(texto, { gente = [], productos = [] } = {}) {
  const pedidos = [];

  for (const linea of enRenglones(texto)) {
    const palabras = palabrasDe(linea);
    const { platos, usadas } = losPlatos(palabras, productos);
    const persona = laPersona(palabras, usadas, gente);

    const dudasDeLaPersona = [];
    if (!persona.escrito) dudasDeLaPersona.push("no se entiende de quién es");
    else if (!persona.elegida && persona.opciones.length) dudasDeLaPersona.push("el nombre se parece a varios");
    else if (!persona.elegida) dudasDeLaPersona.push(`"${persona.escrito}" no está en la lista`);
    else if (!persona.segura) dudasDeLaPersona.push(`¿será ${persona.elegida}?`);

    // Sin ningún plato, el renglón igual sale: puede ser un saludo (y hay que
    // poder descartarlo) o un plato que ella tiene que escribir a mano.
    const cuales = platos.length
      ? platos
      : [{ nombre: null, seguro: false, desde: palabras.length, hasta: palabras.length }];

    cuales.forEach((plato, i) => {
      const tope = i === 0 ? 0 : cuales[i - 1].hasta + 1;
      const cantidad = cantidadDe(palabras, plato.desde, tope);

      const porque = [...dudasDeLaPersona];
      if (!plato.nombre) porque.push("no se entiende qué pidió");
      else if (!plato.seguro) porque.push(`¿será ${plato.nombre}?`);
      if (cantidad.rara) porque.push(`¿de verdad son ${cantidad.valor}?`);

      pedidos.push({
        linea,
        cantidad: cantidad.valor,
        cantidadDicha: cantidad.dicha,
        persona,
        producto: { nombre: plato.nombre, seguro: plato.seguro },
        listo: porque.length === 0,
        porque,
        // Si lo ÚNICO que falla es el nombre, ella lo puede resolver en la
        // misma pantalla escogiendo de una lista. Es el caso de todos los
        // días -- el señor dice "Paula" por "Paola" -- y mandarla a anotarlo
        // a mano por eso sería devolverle el trabajo que esto le quita.
        soloFaltaElNombre: porque.length > 0 && dudasDeLaPersona.length === porque.length &&
                           Boolean(plato.nombre) && plato.seguro && !cantidad.rara &&
                           (Boolean(persona.elegida) || persona.opciones.length > 0),
      });
    });
  }

  return {
    renglones: pedidos,
    listos: pedidos.filter((r) => r.listo).length,
    porRevisar: pedidos.filter((r) => !r.listo).length,
  };
}
