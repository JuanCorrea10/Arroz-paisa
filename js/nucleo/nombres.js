// ============================================================================
//  nombres.js  -  El problema de los nombres: repetidos, parecidos, mal escritos.
//
//  Este archivo es PURO: recibe datos y devuelve datos. No toca la pantalla y
//  no guarda nada. Por eso se puede probar solo.
//
//  Hay que tener MUY claro que aquí se mezclan DOS problemas que se parecen
//  pero NO son el mismo:
//
//  A) ERRORES DE ESCRITURA. "JUAN PEREZ", "juan perez ", "JUAN.PEREZ" y
//     "JUAN  PEREZ" son LA MISMA persona escrita de cuatro formas. Eso es un
//     error y se arregla uniendo los nombres.
//
//  B) TOCAYOS DE VERDAD. En los datos reales hay 79 nombres que existen en dos
//     empresas a la vez (AGRO y BASARILI son sedes vecinas). Esos NO son
//     errores: son personas distintas que se llaman igual. Unirlos dañaría el
//     25% de los datos.
//
//  La regla que separa A de B es sencilla y no falla nunca:
//
//        Dos nombres solo se pueden unir si están en LA MISMA empresa.
//
//  Si están en empresas distintas son dos personas, y punto. Este archivo
//  jamás propone unir a través de empresas.
// ============================================================================

import { normalizar, paraBuscar } from "./formato.js";
import { clavePersona, subtotal } from "./calculos.js";

// ---------------------------------------------------------------------------
//  1. LIMPIAR: la defensa contra los puntos y los espacios
//
//  Esto se aplica SIEMPRE que alguien escribe un nombre. Ella no se entera de
//  que existe: simplemente ya no puede crear "JUAN PEREZ." por accidente,
//  porque el punto se cae solo antes de guardar.
// ---------------------------------------------------------------------------

/**
 * Espacios que existen pero NO se ven. Se pegan al copiar de Excel o de
 * WhatsApp y son de los peores errores posibles, porque en la pantalla el
 * nombre se ve perfecto pero no coincide con nada.
 *
 * Los ponemos por su codigo numerico y no por el caracter, porque si los
 * escribieramos tal cual esta lista se veria vacia y nadie entenderia nada.
 */
const CODIGOS_INVISIBLES = [
  0x00a0, // espacio duro: el clasico que mete Excel al copiar y pegar
  0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x200b, // espacio de ancho cero: el peor de todos, ocupa nada
  0x200c, 0x200d,
  0x202f, 0x205f,
  0x3000, // espacio japones, entra al copiar de paginas web
  0xfeff, // marca invisible del principio de algunos archivos
];

const ESPACIOS_INVISIBLES = new RegExp(
  "[" + CODIGOS_INVISIBLES.map((c) => String.fromCharCode(c)).join("") + "]",
  "g"
);

/** Signos que nunca son parte de un nombre de persona ni de un plato. */
const SIGNOS_QUE_SOBRAN = /[.,;:_"'`´¨^~|\\/<>{}\[\]()=+*#$%&!?¡¿@]/g;

/** Guiones de todos los sabores: "MARIA-JOSE" y "MARIA — JOSE" son "MARIA JOSE". */
const GUIONES = /[-‐‑‒–—]/g;

/**
 * Deja un nombre en su forma buena.
 *
 *     "  juan.  perez_  "   ->   "JUAN PEREZ"
 *
 * Ojo con lo que NO quita: las tildes y la Ñ se respetan, porque "MUÑOZ" y
 * "MUNOZ" podrían ser dos personas distintas. Para COMPARAR sí las
 * ignoramos (ver esqueleto()), pero para GUARDAR se respeta lo que escribió.
 */
export function limpiarNombre(txt) {
  if (txt === null || txt === undefined) return "";
  return String(txt)
    .replace(ESPACIOS_INVISIBLES, " ")
    .replace(SIGNOS_QUE_SOBRAN, " ")
    .replace(GUIONES, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** ¿Limpiar este texto lo cambiaría? Sirve para avisar "esto lo voy a arreglar". */
export function necesitaLimpieza(txt) {
  return limpiarNombre(txt) !== normalizar(txt);
}

// ---------------------------------------------------------------------------
//  2. EL ESQUELETO: la forma de comparar dos nombres
//
//  El esqueleto es el nombre reducido a lo esencial: sin tildes, sin Ñ, sin
//  signos, y con las palabras ordenadas alfabéticamente. Sirve para que
//  "PEREZ JUAN" y "JUAN PÉREZ" den exactamente lo mismo.
// ---------------------------------------------------------------------------

export function esqueleto(txt) {
  return paraBuscar(limpiarNombre(txt))
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** El esqueleto pero sin espacios: "JUANPEREZ". Aguanta hasta los nombres pegados. */
export function esqueletoApretado(txt) {
  return esqueleto(txt).replace(/ /g, "");
}

// ---------------------------------------------------------------------------
//  3. DISTANCIA: cuántas letras hay que cambiar para pasar de un nombre al otro
//
//  Es el algoritmo de Levenshtein. Cuenta cuántas letras hay que meter, quitar
//  o cambiar para convertir una palabra en la otra:
//      "PEREZ" -> "PERES"  da 1   (cambiar la Z por la S)
//      "PEREZ" -> "GOMEZ"  da 4
//
//  Le ponemos un tope: si ya vamos por encima del tope, cortamos de una.
//  Comparar 561 personas contra 561 son 157.000 comparaciones, y sin el tope
//  la pantalla se congelaría.
// ---------------------------------------------------------------------------

export function distancia(a, b, tope = 3) {
  if (a === b) return 0;
  // Si solo por el largo ya se pasan del tope, ni empezamos.
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let actual = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    actual[0] = i;
    let mejorDeLaFila = actual[0];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        actual[j - 1] + 1,       // meter una letra
        anterior[j] + 1,         // quitar una letra
        anterior[j - 1] + costo  // cambiar una letra
      );
      if (actual[j] < mejorDeLaFila) mejorDeLaFila = actual[j];
    }
    // Si la fila entera ya se pasó del tope, no hay forma de que baje después.
    if (mejorDeLaFila > tope) return tope + 1;
    const guardar = anterior;
    anterior = actual;
    actual = guardar;
  }
  return anterior[b.length];
}

// ---------------------------------------------------------------------------
//  3.5 EL DOCUMENTO: cuando no hay que adivinar nada
//
//  Todo lo de arriba (esqueletos, distancias) es adivinar comparando letras.
//  Se adivina bien, pero se adivina. Cuando las dos personas tienen número de
//  documento no hay nada que adivinar, y esto manda sobre todo lo demás.
//
//  Vive aquí y no en personal.js a propósito: personal.js ya importa de este
//  archivo, y si este importara de aquel quedarían dándose vueltas el uno al
//  otro. Las flechas de los import tienen que ir siempre en un solo sentido.
// ---------------------------------------------------------------------------

/**
 * ¿Qué dice el documento sobre estas dos personas?
 *   "misma"    mismo documento: es la misma persona, sin duda
 *   "distinta" documentos distintos: son dos personas, sin duda
 *   "no sabe"  a alguna le falta el documento: toca comparar por el nombre
 */
export function queDiceElDocumento(personaA, personaB) {
  const a = (personaA && personaA.documento) || "";
  const b = (personaB && personaB.documento) || "";
  if (!a || !b) return "no sabe";
  return a === b ? "misma" : "distinta";
}

// ---------------------------------------------------------------------------
//  4. COMPARAR: ¿estos dos nombres son el mismo, mal escrito?
//
//  Devuelve null si no se parecen, o { razon, fuerza } si sí.
//  La fuerza va de 1 a 4: entre más alta, más seguros estamos.
//  Solo la 4 se puede unir casi sin pensar; las demás las decide ella.
// ---------------------------------------------------------------------------

export function compararNombres(a, b) {
  const limpioA = limpiarNombre(a);
  const limpioB = limpiarNombre(b);
  if (!limpioA || !limpioB) return null;

  // Solo nos rendimos si lo GUARDADO es idéntico letra por letra. Ojo con la
  // diferencia: si comparáramos los nombres ya limpios, "JUAN PEREZ" y
  // "JUAN.PEREZ" darían iguales y esta función diría "no hay nada que hacer",
  // cuando justamente son dos fichas distintas que hay que juntar.
  if (normalizar(a) === normalizar(b)) return null;

  // Al limpiarlos quedan iguales: solo sobraba un punto o un espacio.
  if (limpioA === limpioB) {
    return { razon: "es el mismo nombre, solo sobran puntos o espacios", fuerza: 4 };
  }

  const esqA = esqueleto(a);
  const esqB = esqueleto(b);

  // --- Fuerza 4: el esqueleto es idéntico. Es el mismo nombre con otra ropa:
  // sobra un punto, sobra un espacio, falta una tilde, o está al revés.
  if (esqA === esqB) {
    const palabrasA = limpioA.split(" ");
    const palabrasB = limpioB.split(" ");
    const mismasPalabrasOtroOrden =
      palabrasA.length === palabrasB.length &&
      palabrasA.slice().sort().join(" ") === palabrasB.slice().sort().join(" ");

    if (mismasPalabrasOtroOrden) {
      return { razon: "es el mismo nombre pero con el apellido de primero", fuerza: 4 };
    }
    if (paraBuscar(limpioA) === paraBuscar(limpioB)) {
      return { razon: "solo cambian las tildes o la ñ", fuerza: 4 };
    }
    return { razon: "es el mismo nombre escrito distinto", fuerza: 4 };
  }

  // --- Fuerza 3: quitando los espacios queda igual. "JUANPABLO" / "JUAN PABLO".
  if (esqueletoApretado(a) === esqueletoApretado(b)) {
    return { razon: "es el mismo nombre, solo cambia dónde va el espacio", fuerza: 3 };
  }

  // --- Fuerza 3: a uno le falta un pedazo del otro.
  // "JUAN PEREZ" y "JUAN PEREZ GOMEZ": puede ser la misma persona anotada a
  // veces con el segundo apellido y a veces sin él.
  const palA = esqA.split(" ");
  const palB = esqB.split(" ");
  const cortas = palA.length < palB.length ? palA : palB;
  const largas = palA.length < palB.length ? palB : palA;
  if (cortas.length >= 2 && cortas.length < largas.length &&
      cortas.every((p) => largas.includes(p))) {
    return { razon: "a uno le falta un apellido del otro", fuerza: 3 };
  }

  // --- Fuerza 2: una sola letra de diferencia en todo el nombre.
  // Aquí caen "PEREZ"/"PERES" y "MARCELA"/"MARCELLA".
  const d = distancia(esqA, esqB, 2);
  if (d === 1) return { razon: "se diferencian en una sola letra", fuerza: 2 };

  // --- Fuerza 1: dos letras de diferencia. Ya es dudoso ("MARIA" y "MARIO" no
  // son la misma persona), por eso solo lo miramos en nombres largos y va de
  // último en la lista, sin recomendar unir.
  if (d === 2 && esqA.length >= 10) {
    return { razon: "se diferencian en dos letras", fuerza: 1 };
  }

  return null;
}

// ---------------------------------------------------------------------------
//  5. ANTES DE CREAR: buscar parecidos para que el duplicado no llegue a nacer
//
//  Esta es la defensa más importante de todas. Un duplicado que nunca nace no
//  hay que arreglarlo después. Se llama en el momento exacto en que ella
//  escribe un nombre que no está en la lista y la app le ofrece crearlo.
// ---------------------------------------------------------------------------

/**
 * Personas parecidas al nombre, DENTRO de la empresa donde va a comer.
 * Ordenadas de la más parecida a la menos parecida.
 */
export function parecidasEnEmpresa(datos, nombre, codigoEmpresa, documento = "") {
  const empresa = normalizar(codigoEmpresa);
  const buscado = limpiarNombre(nombre);
  const encontradas = [];

  for (const p of datos.personas) {
    if (normalizar(p.empresa) !== empresa) continue;

    // Si sabemos los dos documentos, no hay nada que adivinar.
    const veredicto = queDiceElDocumento({ documento }, p);
    if (veredicto === "distinta") continue;
    if (veredicto === "misma") {
      encontradas.push({ persona: p, razon: "tiene el mismo documento", fuerza: 6 });
      continue;
    }

    if (limpiarNombre(p.nombre) === buscado) {
      encontradas.push({ persona: p, razon: "ya está en la lista, escrita igual", fuerza: 5 });
      continue;
    }
    const c = compararNombres(nombre, p.nombre);
    if (c) encontradas.push({ persona: p, razon: c.razon, fuerza: c.fuerza });
  }

  return encontradas.sort((a, b) => b.fuerza - a.fuerza);
}

/**
 * El mismo nombre pero en OTRAS empresas.
 * Esto NO es un error y no se une nunca: se muestra solo como dato, para que
 * ella sepa que existe un tocayo y no se asuste de verlo repetido.
 */
export function tocayosEnOtrasEmpresas(datos, nombre, codigoEmpresa) {
  const empresa = normalizar(codigoEmpresa);
  const esq = esqueleto(nombre);
  return datos.personas.filter(
    (p) => normalizar(p.empresa) !== empresa && esqueleto(p.nombre) === esq
  );
}

// ---------------------------------------------------------------------------
//  6. LOS QUE YA ESTÁN: agrupar lo que hay, para revisarlo de a poquitos
// ---------------------------------------------------------------------------

/** La marca de un par ya revisado. Siempre en el mismo orden, para no duplicarla. */
export function llavePar(codigoEmpresa, nombreA, nombreB) {
  const dos = [limpiarNombre(nombreA), limpiarNombre(nombreB)].sort();
  return normalizar(codigoEmpresa) + "|" + dos[0] + "|" + dos[1];
}

/** ¿Ella ya dijo que estos dos son personas distintas? */
export function yaRevisado(datos, codigoEmpresa, nombreA, nombreB) {
  const lista = datos.nombresDistintos || [];
  return lista.includes(llavePar(codigoEmpresa, nombreA, nombreB));
}

/** Deja escrito que estos dos son personas distintas, para no volver a preguntar. */
export function marcarDistintos(datos, codigoEmpresa, nombreA, nombreB) {
  if (!Array.isArray(datos.nombresDistintos)) datos.nombresDistintos = [];
  const llave = llavePar(codigoEmpresa, nombreA, nombreB);
  if (!datos.nombresDistintos.includes(llave)) datos.nombresDistintos.push(llave);
  return datos;
}

/**
 * Cuánto "pesa" cada persona: cuántos renglones tiene y cuánta plata suma.
 * Se usa para adivinar cuál nombre es el bueno: casi siempre es el que tiene
 * más renglones, porque el malo es el error de un día suelto.
 */
export function pesoDePersonas(datos) {
  const peso = new Map();
  for (const c of datos.consumos) {
    const llave = clavePersona(c.empresa, c.persona);
    const p = peso.get(llave) || { renglones: 0, total: 0, ultimaFecha: "" };
    p.renglones++;
    p.total += subtotal(c);
    if (c.fecha > p.ultimaFecha) p.ultimaFecha = c.fecha;
    peso.set(llave, p);
  }
  return peso;
}

/**
 * Recorre todas las personas y arma los grupos de nombres que se parecen.
 * Siempre dentro de la misma empresa. Nunca entre empresas.
 *
 * Devuelve algo así:
 *   [{ empresa: "AGRO", razon: "...", fuerza: 4, sugerido: "JUAN PEREZ",
 *      integrantes: [{ nombre, renglones, total, activa, ultimaFecha }, ...] }]
 */
export function gruposParaRevisar(datos, { incluirRevisados = false } = {}) {
  const peso = pesoDePersonas(datos);

  // Primero repartimos las personas por empresa: solo se comparan entre ellas.
  const porEmpresa = new Map();
  for (const p of datos.personas) {
    const emp = normalizar(p.empresa);
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, []);
    porEmpresa.get(emp).push(p);
  }

  const grupos = [];

  for (const [empresa, personas] of porEmpresa) {
    // Cada nombre empieza siendo su propio grupo. Cuando encontramos que dos
    // se parecen, los juntamos. Si A se parece a B y B se parece a C, los tres
    // terminan en el mismo grupo solitos.
    const padre = new Map(personas.map((p) => [p.nombre, p.nombre]));
    const razones = new Map();

    const raiz = (x) => {
      while (padre.get(x) !== x) x = padre.get(x);
      return x;
    };
    const juntar = (a, b) => {
      const ra = raiz(a);
      const rb = raiz(b);
      if (ra !== rb) padre.set(ra, rb);
    };

    for (let i = 0; i < personas.length; i++) {
      for (let j = i + 1; j < personas.length; j++) {
        const a = personas[i].nombre;
        const b = personas[j].nombre;
        if (!incluirRevisados && yaRevisado(datos, empresa, a, b)) continue;

        // El documento manda. Donde hay documento no se adivina.
        const veredicto = queDiceElDocumento(personas[i], personas[j]);
        if (veredicto === "distinta") continue;   // probado que son dos personas
        if (veredicto === "misma") {              // probado que es una sola
          juntar(a, b);
          razones.set(raiz(a), { razon: "tienen el mismo documento", fuerza: 5 });
          continue;
        }

        const c = compararNombres(a, b);
        if (!c) continue;
        juntar(a, b);
        const r = raiz(a);
        const previo = razones.get(r);
        if (!previo || c.fuerza > previo.fuerza) razones.set(r, c);
      }
    }

    // Ahora recogemos los que quedaron juntos.
    const bolsas = new Map();
    for (const p of personas) {
      const r = raiz(p.nombre);
      if (!bolsas.has(r)) bolsas.set(r, []);
      bolsas.get(r).push(p);
    }

    for (const [r, miembros] of bolsas) {
      if (miembros.length < 2) continue;
      const info = razones.get(r) || { razon: "se parecen", fuerza: 1 };

      const integrantes = miembros
        .map((p) => {
          const w = peso.get(clavePersona(p.empresa, p.nombre)) ||
            { renglones: 0, total: 0, ultimaFecha: "" };
          return {
            nombre: p.nombre,
            empresa: p.empresa,
            activa: p.activa !== false,
            documento: p.documento || "",
            renglones: w.renglones,
            total: w.total,
            ultimaFecha: w.ultimaFecha,
          };
        })
        // El de más renglones primero: ese es casi siempre el nombre bueno.
        .sort((a, b) => b.renglones - a.renglones || a.nombre.localeCompare(b.nombre, "es"));

      grupos.push({
        empresa,
        razon: info.razon,
        fuerza: info.fuerza,
        integrantes,
        sugerido: integrantes[0].nombre,
        renglonesEnJuego: integrantes.reduce((s, x) => s + x.renglones, 0),
      });
    }
  }

  // Los más seguros primero y, dentro de esos, los que mueven más renglones.
  return grupos.sort(
    (a, b) => b.fuerza - a.fuerza || b.renglonesEnJuego - a.renglonesEnJuego
  );
}

/** Nombres que solo tienen basura (puntos, espacios) y se arreglan sin preguntar. */
export function nombresSucios(datos) {
  const sucios = [];
  for (const p of datos.personas) {
    if (necesitaLimpieza(p.nombre)) {
      sucios.push({
        empresa: normalizar(p.empresa),
        antes: p.nombre,
        despues: limpiarNombre(p.nombre),
      });
    }
  }
  return sucios;
}

// ---------------------------------------------------------------------------
//  7. UNIR: la operación de verdad
//
//  Unir dos personas significa tocar varios sitios a la vez. Si se olvida uno,
//  quedan renglones huérfanos, que es justo el bug del Excel que estamos
//  tratando de matar. Por eso está todo en una sola función y en ningún otro
//  lado se hace a mano.
// ---------------------------------------------------------------------------

/**
 * Mira qué pasaría si se unen, SIN tocar nada.
 * Es la vista previa que se le muestra antes de preguntarle "¿seguro?".
 */
export function simularUnion(datos, codigoEmpresa, nombreBueno, nombresAbsorbidos) {
  const empresa = normalizar(codigoEmpresa);

  // Hay que distinguir DOS formas del mismo nombre y no confundirlas nunca:
  //
  //   guardadoBueno  cómo está escrito HOY en los renglones ("JUAN.PEREZ")
  //   bueno          cómo va a quedar después ("JUAN PEREZ")
  //
  // Los renglones se buscan por la forma guardada. Si los buscáramos por la
  // forma limpia, "JUAN.PEREZ" y "JUAN PEREZ" darían iguales, el filtro los
  // descartaría por "repetidos" y esta función diría que no hay nada que
  // mover, cuando sí lo hay.
  const guardadoBueno = normalizar(nombreBueno);
  const bueno = limpiarNombre(nombreBueno);
  const malos = nombresAbsorbidos
    .map(normalizar)
    .filter((n) => n && n !== guardadoBueno);

  let renglones = 0;
  let plata = 0;
  const dias = new Set();

  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== empresa) continue;
    if (!malos.includes(normalizar(c.persona))) continue;
    renglones++;
    plata += subtotal(c);
    dias.add(c.fecha);
  }

  // Mucho cuidado con esto: si "JUAN PEREZ" y "JUAN.PEREZ" comieron EL MISMO
  // DÍA, hoy cuentan como 2 facturas y después de unir van a contar como 1.
  // Hay que decírselo, porque el número de facturas del día va a bajar y ella
  // cuadra ese número contra lo que le dice el trabajador.
  const nombresPorDia = new Map();
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== empresa) continue;
    const n = normalizar(c.persona);
    if (n !== guardadoBueno && !malos.includes(n)) continue;
    if (!nombresPorDia.has(c.fecha)) nombresPorDia.set(c.fecha, new Set());
    nombresPorDia.get(c.fecha).add(n);
  }
  let facturasQueSePierden = 0;
  for (const conjunto of nombresPorDia.values()) {
    if (conjunto.size > 1) facturasQueSePierden += conjunto.size - 1;
  }

  return {
    empresa,
    nombreBueno: bueno,
    guardadoBueno,
    absorbidos: malos,
    renglones,
    plata,
    dias: dias.size,
    facturasQueSePierden,
  };
}

/**
 * Une de verdad. Devuelve el resumen de lo que movió.
 * La plata NO cambia: los renglones son los mismos, solo cambian de dueño.
 */
export function unirPersonas(datos, codigoEmpresa, nombreBueno, nombresAbsorbidos) {
  const previa = simularUnion(datos, codigoEmpresa, nombreBueno, nombresAbsorbidos);
  const { empresa, nombreBueno: bueno, guardadoBueno, absorbidos } = previa;
  if (!absorbidos.length) return { ...previa, hecho: false };

  // La persona que se queda, buscada por su nombre TAL COMO ESTÁ GUARDADO.
  // Si buscáramos por el nombre limpio podríamos agarrar por error a una de
  // las que están a punto de desaparecer.
  const laBuena = datos.personas.find(
    (p) => normalizar(p.empresa) === empresa && normalizar(p.nombre) === guardadoBueno
  );

  // 1) Los renglones pasan al nombre bueno, ya limpio.
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== empresa) continue;
    const guardado = normalizar(c.persona);
    const eraAbsorbido = absorbidos.includes(guardado);
    // Los del bueno también se tocan, para que queden con el nombre limpio.
    if (!eraAbsorbido && guardado !== guardadoBueno) continue;
    c.persona = bueno;
    // A quién se le factura lo manda la persona que se queda, pero solo se
    // les cambia a los que vienen de otra ficha. Los del bueno se respetan.
    if (eraAbsorbido && laBuena && laBuena.empresa) {
      c.empresa = normalizar(laBuena.empresa);
    }
  }

  // 2) Las personas absorbidas salen de la lista.
  datos.personas = datos.personas.filter(
    (p) => !(normalizar(p.empresa) === empresa &&
             absorbidos.includes(normalizar(p.nombre)))
  );

  // 3) El nombre bueno queda limpio y presente, sí o sí.
  if (laBuena) {
    laBuena.nombre = bueno;
    laBuena.activa = true;
  } else {
    datos.personas.push({
      nombre: bueno,
      empresa: empresa,
      empresa: empresa,
      activa: true,
    });
  }

  // 4) Se caen las marcas de "son distintos" que ya no tienen sentido.
  if (Array.isArray(datos.nombresDistintos)) {
    // Las marcas se guardan con el nombre ya limpio (así las arma llavePar),
    // y "absorbidos" trae el nombre como estaba guardado. Hay que comparar las
    // dos listas en la misma forma o no se borraría ninguna marca.
    const absorbidosLimpios = absorbidos.map(limpiarNombre);
    datos.nombresDistintos = datos.nombresDistintos.filter((llave) => {
      const [emp, a, b] = llave.split("|");
      if (emp !== empresa) return true;
      return !absorbidosLimpios.includes(a) && !absorbidosLimpios.includes(b);
    });
  }

  return { ...previa, hecho: true };
}

// ---------------------------------------------------------------------------
//  CAMBIAR DE EMPRESA
//
//  Hacía falta por una razón muy concreta: la misma persona quedaba anotada
//  dos veces, una en cada empresa -- porque se cambió de sede, o porque al
//  anotarla estaba escogida la empresa equivocada. Y como unir solo se puede
//  dentro de la misma empresa (y así tiene que ser: hay 79 nombres que existen
//  en dos sedes y son personas distintas), esas dos fichas se quedaban ahí
//  para siempre, cada una con la mitad de los renglones.
//
//  Con esto se pasa una a la empresa de la otra, y ahí sí se pueden unir. Si
//  al llegar ya hay alguien con ese mismo nombre, la mudanza ES la unión: los
//  renglones se juntan y la ficha que sobra se cae.
//
//  Lo que NO hace: tocar el precio de un renglón viejo. El precio quedó
//  congelado el día que se anotó y así se queda -- lo que cambia es a qué
//  empresa se le cobra, que es justamente lo que se le está pidiendo.
// ---------------------------------------------------------------------------

/** Qué pasaría si se moviera. No cambia nada. */
export function simularCambioDeEmpresa(datos, empresaVieja, nombre, empresaNueva) {
  const vieja = normalizar(empresaVieja);
  const nueva = normalizar(empresaNueva);
  const quien = normalizar(nombre);

  let renglones = 0;
  let plata = 0;
  const dias = new Set();
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== vieja) continue;
    if (normalizar(c.persona) !== quien) continue;
    renglones++;
    plata += subtotal(c);
    dias.add(c.fecha);
  }

  // ¿Allá ya hay alguien que se llama igual? Entonces esto es una unión.
  const laOtra = datos.personas.find(
    (p) => normalizar(p.empresa) === nueva && normalizar(p.nombre) === quien
  );
  let renglonesDeLaOtra = 0;
  if (laOtra) {
    for (const c of datos.consumos) {
      if (normalizar(c.empresa) !== nueva) continue;
      if (normalizar(c.persona) !== quien) continue;
      renglonesDeLaOtra++;
    }
  }

  return {
    vieja, nueva, nombre: quien,
    renglones, plata, dias: dias.size,
    seFusiona: Boolean(laOtra),
    renglonesDeLaOtra,
  };
}

/** La mueve de verdad. Devuelve lo mismo que la simulación, más `hecho`. */
export function cambiarDeEmpresa(datos, empresaVieja, nombre, empresaNueva) {
  const previa = simularCambioDeEmpresa(datos, empresaVieja, nombre, empresaNueva);
  const { vieja, nueva, nombre: quien } = previa;
  if (!vieja || !nueva || vieja === nueva) return { ...previa, hecho: false };

  for (const c of datos.consumos) {
    if (normalizar(c.empresa) !== vieja) continue;
    if (normalizar(c.persona) !== quien) continue;
    c.empresa = nueva;
  }

  const ficha = datos.personas.find(
    (p) => normalizar(p.empresa) === vieja && normalizar(p.nombre) === quien
  );
  if (previa.seFusiona) {
    // Allá ya estaba: la ficha de acá sobra. Los renglones ya se fueron.
    datos.personas = datos.personas.filter((p) => p !== ficha);
  } else if (ficha) {
    ficha.empresa = nueva;
  }

  // Las marcas de "estos dos son distintos" eran de la empresa vieja y ya no
  // dicen nada de nadie. Se caen las que hablan de esta persona.
  if (Array.isArray(datos.nombresDistintos)) {
    const limpio = limpiarNombre(quien);
    datos.nombresDistintos = datos.nombresDistintos.filter((llave) => {
      const [emp, a, b] = llave.split("|");
      if (emp !== vieja) return true;
      return a !== limpio && b !== limpio;
    });
  }

  return { ...previa, hecho: true };
}

/** Cambia el nombre de una persona y arrastra todos sus renglones con ella. */
export function renombrarPersona(datos, codigoEmpresa, nombreViejo, nombreNuevo) {
  const empresa = normalizar(codigoEmpresa);
  // Otra vez lo mismo: el viejo se busca COMO ESTÁ GUARDADO y el nuevo se
  // guarda LIMPIO. Si el viejo lo buscáramos limpio, renombrar a "JUAN PEREZ"
  // se llevaría por delante también los renglones de "JUAN.PEREZ", que es una
  // ficha distinta y no se pidió tocar.
  const viejo = normalizar(nombreViejo);
  const nuevo = limpiarNombre(nombreNuevo);
  if (!nuevo) throw new Error("El nombre no puede quedar vacío.");
  if (viejo === nuevo) return { movidos: 0 };

  const chocaCon = datos.personas.find(
    (p) => normalizar(p.empresa) === empresa &&
           normalizar(p.nombre) !== viejo &&
           limpiarNombre(p.nombre) === nuevo
  );
  if (chocaCon) {
    throw new Error(
      `En ${empresa} ya hay alguien que se llama ${nuevo}. Si son la misma ` +
      `persona, use el botón Unir en la pantalla Revisar nombres.`
    );
  }

  let movidos = 0;
  for (const c of datos.consumos) {
    if (normalizar(c.empresa) === empresa && normalizar(c.persona) === viejo) {
      c.persona = nuevo;
      movidos++;
    }
  }
  const persona = datos.personas.find(
    (p) => normalizar(p.empresa) === empresa && normalizar(p.nombre) === viejo
  );
  if (persona) persona.nombre = nuevo;
  return { movidos };
}

/**
 * Limpia de una sola vez todos los nombres sucios (puntos y espacios de
 * sobra), tanto en la lista de personas como en los renglones ya registrados.
 * Si al limpiar dos nombres quedan iguales, sobra uno: eran el mismo.
 */
export function limpiarTodosLosNombres(datos) {
  let personasArregladas = 0;
  let renglonesArreglados = 0;

  for (const c of datos.consumos) {
    const persona = limpiarNombre(c.persona);
    if (persona !== c.persona) { c.persona = persona; renglonesArreglados++; }
    const plato = limpiarNombre(c.producto);
    if (plato !== c.producto) { c.producto = plato; renglonesArreglados++; }
  }

  const vistas = new Set();
  const quedan = [];
  for (const p of datos.personas) {
    const limpio = limpiarNombre(p.nombre);
    if (limpio !== p.nombre) { p.nombre = limpio; personasArregladas++; }
    const llave = clavePersona(p.empresa, p.nombre);
    if (vistas.has(llave)) continue; // quedó repetida al limpiar: sobra
    vistas.add(llave);
    quedan.push(p);
  }
  const personasFundidas = datos.personas.length - quedan.length;
  datos.personas = quedan;

  for (const p of datos.productos) {
    const limpio = limpiarNombre(p.nombre);
    if (limpio !== p.nombre) { p.nombre = limpio; personasArregladas++; }
  }

  return { personasArregladas, renglonesArreglados, personasFundidas };
}
