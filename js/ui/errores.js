// ============================================================================
//  errores.js  -  "Posibles errores"
//
//  La pantalla donde ella decide. La app señala lo que le parece raro y le
//  propone a qué se parece, pero NUNCA decide sola, porque estas decisiones
//  mueven plata: unir "AGUA CON GAS" con "AGUA GAS" le sube la cuenta a una
//  empresa, y eso no puede pasar a espaldas de nadie.
//
//  Siempre las mismas tres salidas, en el mismo orden, para que se vuelva
//  costumbre:
//
//      [ Sí, es la misma ]   [ No, es otra ]   [ Déjelo así ]
//
//  Y "Déjelo así" no es rendirse: es una respuesta válida que se guarda, para
//  que la app no le vuelva a preguntar lo mismo cada semana.
// ============================================================================

import {
  el, vaciar, mensaje, ventana, confirmar, pedirDatos, tabla, cinta, cifra, vacio,
  poner,
} from "./componentes.js";
import { estado, cambio, empresas } from "./estado.js";
import { pesos, normalizar } from "../nucleo/formato.js";
import { precioDe } from "../nucleo/calculos.js";
import {
  personasSueltas, platosSueltos, unirPersonaSuelta, crearPersonaSuelta,
  simularUnionDePlato, unirPlatoSuelto, crearPlatoSuelto, dejarComoEsta,
  cuantosSueltos, volverARevisar,
} from "../nucleo/sueltos.js";
import { gruposParaRevisar } from "../nucleo/nombres.js";

export function pintarErrores(raiz) {
  vaciar(raiz);

  const personas = personasSueltas(estado.datos);
  const platos = platosSueltos(estado.datos);
  const parecidos = gruposParaRevisar(estado.datos).length;

  // Lo que ella ya dijo "déjelo así". Se saca comparando la lista completa
  // con la que se muestra, que es la que los esconde.
  const sinNombre = (lista) => new Set(lista.map((x) => x.nombre + "|" + (x.empresa || "")));
  const visiblesP = sinNombre(platos);
  const visiblesQ = sinNombre(personas);
  const dejadosPlatos = platosSueltos(estado.datos, { incluirRevisados: true })
    .filter((p) => !visiblesP.has(p.nombre + "|"));
  const dejadasPersonas = personasSueltas(estado.datos, { incluirRevisadas: true })
    .filter((p) => !visiblesQ.has(p.nombre + "|" + (p.empresa || "")));
  const hayDejados = dejadosPlatos.length + dejadasPersonas.length > 0;

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Posibles errores" }),
        el("p", {
          texto:
            "Cosas que quedaron raras y la app no se atreve a arreglar sola. " +
            "Usted decide y ella obedece.",
        })
      )
    ),
    el("dl", { clase: "cifras" },
      // Solo se destaca UNA. Si se destacan dos, no se destaca ninguna:
      // el ojo no sabe adonde ir y el enfasis se pierde.
      cifra("Personas que no están en su empresa", String(personas.length)),
      cifra("Platos que no están en el catálogo", String(platos.length)),
      cifra("Nombres parecidos", String(parecidos)),
      // "Por arreglar" y no "sin cobrar": de estos renglones, los de plato SI
      // se estan cobrando en $ 0, pero los de persona se cobran bien y lo que
      // esta mal es a quien se le suman. Son dos problemas distintos y el
      // titulo no puede decir que son el mismo.
      cifra("Renglones por arreglar", String(
        personas.reduce((a, p) => a + p.renglones, 0) +
        platos.reduce((a, p) => a + p.renglones, 0)
      ), true)
    )
  );

  if (!personas.length && !platos.length) {
    poner(raiz,
      vacio(hayDejados ? "No queda nada por preguntar" : "No hay nada raro",
        el("p", {},
          "Todos los renglones apuntan a una persona y a un plato que existen. ",
          parecidos
            ? el("span", {},
                "Todavía quedan ", el("a", { href: "#nombres", texto: `${parecidos} nombres parecidos` }),
                " por revisar, pero eso no daña ninguna cuenta.")
            : "Todo en orden."
        ))
    );
    // Aunque no quede nada que preguntar, lo dejado así SÍ se muestra: si no,
    // esta pantalla diría "todo en orden" mientras hay renglones cobrándose en
    // $ 0 que ella misma escondió y no tiene por dónde volver a sacar.
    if (hayDejados) poner(raiz, tarjetaDeDejados(raiz, dejadosPlatos, dejadasPersonas));
    return;
  }

  poner(raiz,
    el("p", { clase: "nota" },
      "Los platos que no están en el catálogo entran en $ 0 a la cuenta de " +
      "cobro: se vendió la comida y no se está cobrando. Las personas que no " +
      "están en la lista sí se cobran, pero su consumo no se le suma a nadie, " +
      "así que los informes por persona salen mal.")
  );

  // --- Personas ------------------------------------------------------------
  if (personas.length) {
    poner(raiz, el("h2", { texto: "Personas que no están en la lista de su empresa" }));
    for (const p of personas) poner(raiz, tarjetaDePersona(raiz, p));
  }

  // --- Platos --------------------------------------------------------------
  if (platos.length) {
    poner(raiz, el("h2", {
      texto: platos.every((p) => p.faltaEnCatalogo)
        ? "Platos que no están en el catálogo"
        : "Platos por arreglar",
    }));

    const obvios = platos.filter((p) => p.sugerencias.some((s) => s.obvio));
    if (obvios.length > 1) poner(raiz, tarjetaDeObvios(raiz, obvios));

    for (const p of platos) poner(raiz, tarjetaDePlato(raiz, p));
  }

  if (hayDejados) poner(raiz, tarjetaDeDejados(raiz, dejadosPlatos, dejadasPersonas));

  if (parecidos) {
    poner(raiz,
      el("p", { clase: "nota" },
        `Aparte de esto hay ${parecidos} grupos de nombres parecidos en `,
        el("a", { href: "#nombres", texto: "Revisar nombres" }),
        ". Esos no dañan ninguna cuenta, solo parten el consumo de alguien en dos.")
    );
  }
}

// ---------------------------------------------------------------------------
//  Los tres botones, siempre iguales
// ---------------------------------------------------------------------------

function tresBotones({ siTexto, alSi, noTexto, alNo, alDejar }) {
  return el("div", { clase: "fila decision" },
    el("button", { clase: "principal", alHacerClic: alSi }, siTexto),
    el("button", { clase: "plano", alHacerClic: alNo }, noTexto),
    el("button", { clase: "plano suave", alHacerClic: alDejar }, "Déjelo así")
  );
}

/** La lista de "¿a cuál se parece?", con una marcada de una si es obvia. */
function elegirParecido(sugerencias, nombreGrupo) {
  let elegido = sugerencias[0] ? sugerencias[0].nombre : null;

  const lista = el("div", { clase: "opciones-parecidas" },
    ...sugerencias.map((s, i) =>
      el("label", { clase: "opcion-parecida" + (s.obvio ? " obvia" : "") },
        el("input", {
          type: "radio",
          name: nombreGrupo,
          checked: i === 0,
          alCambiar: () => { elegido = s.nombre; },
        }),
        el("span", {},
          el("strong", { texto: s.nombre }),
          el("small", { texto: s.razon + (s.obvio ? "  ·  casi seguro" : "") })
        )
      )
    )
  );

  return { nodo: lista, cual: () => elegido };
}

// ---------------------------------------------------------------------------
//  Una persona suelta
// ---------------------------------------------------------------------------

/**
 * Una tarjeta tiene que decir TRES cosas, en este orden:
 *
 *   1. QUE pasa      "hay 5 renglones a nombre de alguien que no está"
 *   2. QUE proponemos "¿será que es LEIDY ACOSTA?"
 *   3. QUE decide ella, con el nombre puesto en el botón
 *
 * Antes solo mostraba el nombre suelto y tres botones, y tocaba adivinar cuál
 * era el problema. Un aviso que hay que descifrar no sirve de nada: es como
 * el Excel fallando en silencio, pero con más pasos.
 */
function tarjetaDePersona(raiz, p) {
  const grupo = "sp-" + p.empresa + "-" + p.nombre.replace(/\s+/g, "_");
  const parecidas = p.sugerencias.length ? elegirParecido(p.sugerencias, grupo) : null;
  const cual = () => (parecidas ? parecidas.cual() : null);

  const cuantos = p.renglones === 1 ? "1 renglón" : `${p.renglones} renglones`;

  return el("section", { clase: "tarjeta suelto suelto-persona" },

    // 1. Qué pasa, dicho como se lo contaría uno a otra persona.
    el("p", { clase: "que-pasa" },
      "Hay ", el("strong", { texto: cuantos }), " a nombre de ",
      el("strong", { texto: p.nombre }), ", pero esa persona ",
      el("strong", { texto: "no está en la lista de " }),
      cinta(p.empresa), "."),

    // Ojo con esta frase: estos renglones SI se estan cobrando. Lo que pasa
    // es que no se le suman a nadie de la lista, asi que el consumo de esa
    // persona sale mal en los informes. Decir "sin cobrar" seria mentir.
    el("p", { clase: "apunte-suelto",
      texto: `${p.dias} días · ${pesos(p.plata)} que no se le suman a nadie` }),

    // 2. Qué proponemos.
    parecidas
      ? el("div", {},
          el("p", { clase: "la-pregunta" },
            "¿Será que es esta persona, que sí está en ", p.empresa, "?"),
          parecidas.nodo)
      : el("p", { clase: "nota" },
          `En ${p.empresa} no hay nadie con un nombre parecido, así que ` +
          "seguramente es alguien nuevo que hay que agregar a la lista."),

    // 3. Qué decide ella. El nombre va DENTRO del botón: así no hay que
    //    acordarse de cuál estaba marcada arriba.
    parecidas
      ? tresBotones({
          siTexto: `Sí, es ${cual() || ""}`,
          alSi: () => unirla(raiz, p, cual()),
          noTexto: "No, es otra persona",
          alNo: () => crearla(raiz, p),
          alDejar: () => dejarlaAsi(raiz, p),
        })
      : el("div", { clase: "fila decision" },
          el("button", {
            clase: "principal",
            alHacerClic: () => crearla(raiz, p),
          }, `Agregar a ${p.nombre} en ${p.empresa}`),
          el("button", {
            clase: "plano suave",
            alHacerClic: () => dejarlaAsi(raiz, p),
          }, "Déjelo así")
        )
  );
}

function unirla(raiz, p, nombreBueno) {
  if (!nombreBueno) { mensaje("Marque a cuál se parece.", "ojo"); return; }

  ventana({
    titulo: "¿Es la misma persona?",
    cuerpo: el("div", {},
      el("p", {},
        "Los ", el("strong", { texto: String(p.renglones) }), " renglones de ",
        el("strong", { texto: p.nombre }), " van a quedar a nombre de ",
        el("strong", { texto: nombreBueno }), ", en ", el("strong", { texto: p.empresa }), "."),
      el("p", { clase: "nota bien" },
        "El total del mes no cambia: los renglones son los mismos, solo cambian " +
        "de dueño.")
    ),
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Sí, es la misma",
        clase: "principal",
        alHacerClic: () => {
          try {
            const r = unirPersonaSuelta(estado.datos, p.empresa, p.nombre, nombreBueno);
            cambio();
            mensaje(`${r.movidos} renglones pasaron a ${r.nombreBueno}.`, "bien", 6);
            pintarErrores(raiz);
          } catch (e) {
            mensaje(e.message, "malo", 8);
          }
        },
      },
    ],
  });
}

async function crearla(raiz, p) {
  const datos = await pedirDatos({
    titulo: `Crear a ${p.nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", valor: p.nombre, requerido: true },
      // Ya no se pregunta a qué empresa se le cobra: es la misma donde come,
      // que es la del renglón que la trajo hasta aquí.
      {
        nombre: "documento", etiqueta: "Cédula (opcional)", tipo: "text",
        ayuda: "Sirve para no confundirla con otra del mismo nombre. La app " +
               "guarda solo los últimos 5 números, nada más.",
      },
    ],
    textoAceptar: "Crearla",
  });
  if (!datos) return;

  const r = crearPersonaSuelta(estado.datos, p.empresa, p.nombre, datos.documento);
  // Si además le cambió el nombre, lo aplicamos.
  if (normalizar(datos.nombre) !== normalizar(p.nombre)) {
    for (const persona of estado.datos.personas) {
      if (normalizar(persona.empresa) === p.empresa &&
          normalizar(persona.nombre) === normalizar(r.nombre)) {
        persona.nombre = normalizar(datos.nombre);
      }
    }
    for (const c of estado.datos.consumos) {
      if (normalizar(c.empresa) === p.empresa && normalizar(c.persona) === normalizar(r.nombre)) {
        c.persona = normalizar(datos.nombre);
      }
    }
  }
  cambio();
  mensaje(`${normalizar(datos.nombre)} quedó en ${p.empresa}, con sus ${r.arreglados} renglones.`, "bien", 6);
  pintarErrores(raiz);
}

async function dejarlaAsi(raiz, p) {
  const seguro = await confirmar({
    titulo: "Dejarlo así",
    mensaje:
      `Los ${p.renglones} renglones de ${p.nombre} se quedan como están y no ` +
      "le vuelvo a preguntar. Va a poder deshacerlo desde esta misma pantalla.",
    siTexto: "Sí, déjelo así",
  });
  if (!seguro) return;
  dejarComoEsta(estado.datos, "PERSONA", p.empresa, p.nombre);
  cambio();
  pintarErrores(raiz);
}

// ---------------------------------------------------------------------------
//  Un plato suelto
// ---------------------------------------------------------------------------

function tarjetaDePlato(raiz, p) {
  const grupo = "sl-" + p.nombre.replace(/\s+/g, "_");

  // Son DOS problemas distintos y hasta ahora la tarjeta decía siempre el
  // primero:
  //
  //   a) el plato no está en el catálogo  -> hay que agregarlo, o es otro mal
  //      escrito y toca unirlo con el bueno.
  //   b) el plato SÍ está, pero unos renglones quedaron sin precio -> no hay
  //      nada que agregar ni que unir: hay que ponerle el precio y ya.
  //
  // En el caso (b) la tarjeta decía "ese plato no está en el catálogo", que es
  // falso, y encima le ofrecía unirlo con otro plato. Preguntarle si "SOPA
  // GRANDE" es en realidad "SOPA DE LA CASA" cuando SOPA GRANDE existe y se
  // vende es empujarla a dañar el catálogo por un problema que no era ese.
  const soloSinPrecio = !p.faltaEnCatalogo;
  const parecidos = !soloSinPrecio && p.sugerencias.length
    ? elegirParecido(p.sugerencias, grupo)
    : null;
  const cual = () => (parecidos ? parecidos.cual() : null);

  const pedidos = p.cantidad === 1 ? "1 vez" : `${p.cantidad} veces`;

  // Cuanto se esta dejando de cobrar por este plato, para que se vea que no
  // es un detalle de orden sino plata que no se cobro.
  const suPrecio = parecidos && cual()
    ? precioDe(estado.datos, cual(), p.empresas[0])
    : null;
  const dejadoDeCobrar = suPrecio ? suPrecio * p.cantidad : 0;

  return el("section", { clase: "tarjeta suelto suelto-plato" },

    // 1. Que pasa.
    soloSinPrecio
      ? el("p", { clase: "que-pasa" },
          "Se pidió ", el("strong", { texto: p.nombre }), " ",
          el("strong", { texto: pedidos }),
          ". El plato ", el("strong", { texto: "sí está en el catálogo" }),
          ", pero ",
          el("strong", { texto: `${p.sinPrecio} ${p.sinPrecio === 1 ? "renglón quedó" : "renglones quedaron"} sin precio` }),
          ", así que se están cobrando en ",
          el("strong", { clase: "sube", texto: "$ 0" }), ".")
      : el("p", { clase: "que-pasa" },
          "Se pidió ", el("strong", { texto: p.nombre }), " ",
          el("strong", { texto: pedidos }),
          ", pero ese plato ", el("strong", { texto: "no está en el catálogo" }),
          p.sinPrecio
            ? el("span", {}, ", así que se está cobrando en ",
                el("strong", { clase: "sube", texto: "$ 0" }), ".")
            : "."),

    el("div", { clase: "fila" },
      el("span", { clase: "apunte-suelto", texto: `${p.renglones} renglones · ` }),
      ...p.empresas.map(cinta)),

    // 2. Que proponemos.
    parecidos
      ? el("div", {},
          el("p", { clase: "la-pregunta" },
            "¿Será que es este plato, que sí está en el catálogo",
            suPrecio ? ` a ${pesos(suPrecio)}` : "", "?"),
          parecidos.nodo,
          dejadoDeCobrar
            ? el("p", { clase: "nota ojo" },
                "Si es el mismo, se dejaron de cobrar ",
                el("strong", { texto: pesos(dejadoDeCobrar) }), ".")
            : null)
      : el("p", { clase: "nota" },
          soloSinPrecio
            ? "Solo falta decir cuánto vale. Al ponerle el precio, esos " +
              "renglones dejan de ir en $ 0 y la cuenta sube."
            : "No hay ningún plato parecido en el catálogo, así que hay que " +
              "agregarlo con su precio para poder cobrarlo."),

    // Otros platos que tampoco están catalogados y se parecen a este. Si no
    // se avisara, ella crearía el mismo plato dos veces con dos nombres.
    p.parientes && p.parientes.length
      ? el("p", { clase: "nota ojo" },
          "Ojo: tampoco está catalogado ",
          ...p.parientes.map((x, i) => [
            i ? ", " : "",
            el("strong", { texto: x.nombre }),
            ` (${x.renglones} renglones)`,
          ]).flat(),
          ". Si es el mismo plato, agréguelo UNA vez y después una el otro con él.")
      : null,

    parecidos
      ? tresBotones({
          siTexto: `Sí, es ${cual() || ""}`,
          alSi: () => unirPlato(raiz, p, cual()),
          noTexto: "No, es un plato distinto",
          alNo: () => crearPlato(raiz, p),
          alDejar: () => dejarPlatoAsi(raiz, p),
        })
      : el("div", { clase: "fila decision" },
          el("button", {
            clase: "principal",
            alHacerClic: () => crearPlato(raiz, p),
          }, soloSinPrecio
            ? `Póngale precio a ${p.sinPrecio === 1 ? "ese renglón" : "esos renglones"}`
            : "Agregar este plato con su precio"),
          el("button", {
            clase: "plano suave",
            alHacerClic: () => dejarPlatoAsi(raiz, p),
          }, "Déjelo así")
        )
  );
}

function unirPlato(raiz, p, nombreBueno) {
  if (!nombreBueno) { mensaje("Marque a cuál se parece.", "ojo"); return; }
  const previa = simularUnionDePlato(estado.datos, p.nombre, nombreBueno);

  ventana({
    titulo: "¿Es el mismo plato?",
    cuerpo: el("div", {},
      el("p", {},
        "Los ", el("strong", { texto: String(previa.renglones) }), " renglones de ",
        el("strong", { texto: p.nombre }), " van a pasar a ",
        el("strong", { texto: nombreBueno }), ", con el precio de ese plato."),

      previa.diferencia !== 0
        ? el("div", {},
            el("p", { clase: "nota ojo" },
              "Ojo, esto cambia lo que se cobra: de ",
              el("strong", { texto: pesos(previa.antes) }), " pasa a ",
              el("strong", { texto: pesos(previa.despues) }), "."),
            tabla(
              [{ titulo: "Empresa" }, { titulo: "Antes", clase: "dato" },
               { titulo: "Después", clase: "dato" }, { titulo: "Diferencia", clase: "dato" }],
              previa.porEmpresa.map((e) =>
                el("tr", {},
                  el("td", {}, cinta(e.empresa)),
                  el("td", { clase: "dato plata", texto: pesos(e.antes) }),
                  el("td", { clase: "dato plata", texto: pesos(e.despues) }),
                  el("td", { clase: "dato plata " + (e.diferencia > 0 ? "sube" : "baja"),
                             texto: (e.diferencia > 0 ? "+" : "") + pesos(e.diferencia) })
                )
              )
            ),
            el("p", { clase: "nota" },
              "Que suba está bien si de verdad se vendió y no se cobró. " +
              "Si ya le entregó esa cuenta de cobro a la empresa, mejor " +
              "arréglelo del mes que viene en adelante."))
        : el("p", { clase: "nota bien", texto: "No cambia ningún total." })
    ),
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Sí, es el mismo",
        clase: "principal",
        alHacerClic: () => {
          try {
            const r = unirPlatoSuelto(estado.datos, p.nombre, nombreBueno);
            cambio();
            mensaje(
              `${r.renglones} renglones pasaron a ${nombreBueno}` +
              (r.diferencia ? `, y la cuenta subió ${pesos(r.diferencia)}.` : "."),
              "bien", 7
            );
            pintarErrores(raiz);
          } catch (e) {
            mensaje(e.message, "malo", 8);
          }
        },
      },
    ],
  });
}

async function crearPlato(raiz, p) {
  const lista = empresas();
  const yaEsta = !p.faltaEnCatalogo;
  const datos = await pedirDatos({
    titulo: yaEsta ? `Precio de "${p.nombre}"` : `Agregar "${p.nombre}" al catálogo`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre del plato", valor: p.nombre, requerido: true },
      {
        nombre: "precio", etiqueta: "Precio", tipo: "number", min: 0, requerido: true,
        ayuda: `Se les va a poner a los ${p.renglones} renglones que ya están anotados.`,
      },
      {
        nombre: "todas", etiqueta: "Vale lo mismo en todas las empresas",
        tipo: "casilla", valor: true,
        ayuda: "Si en alguna vale distinto, después se cambia en Catálogo.",
      },
    ],
    textoAceptar: "Agregarlo",
  });
  if (!datos) return;

  const valor = Number(datos.precio) || 0;
  const precios = {};
  if (datos.todas) for (const e of lista) precios[e.codigo] = valor;
  else for (const e of p.empresas) precios[e] = valor;

  const r = crearPlatoSuelto(estado.datos, p.nombre, precios);
  cambio();
  mensaje(`"${r.nombre}" quedó a ${pesos(valor)}, y se arreglaron ${r.arreglados} renglones.`, "bien", 7);
  pintarErrores(raiz);
}

async function dejarPlatoAsi(raiz, p) {
  const seguro = await confirmar({
    titulo: "Dejarlo así",
    mensaje:
      `"${p.nombre}" se queda como está` +
      (p.sinPrecio ? ` y sus ${p.sinPrecio} renglones se siguen cobrando en $ 0.` : ".") +
      " No le vuelvo a preguntar.",
    siTexto: "Sí, déjelo así",
    peligroso: p.sinPrecio > 0,
  });
  if (!seguro) return;
  dejarComoEsta(estado.datos, "PLATO", "", p.nombre);
  cambio();
  pintarErrores(raiz);
}

/**
 * Lo que ella dijo "déjelo así", con la puerta para devolverse.
 *
 * "Déjelo así" era una puerta de una sola vía: el plato desaparecía de esta
 * pantalla y NADA en la app lo traía de vuelta, mientras sus renglones se
 * seguían cobrando en $ 0. La función para volver a mostrarlos existía desde
 * siempre; lo que faltaba era el botón. Cuando ella se daba cuenta -- semanas
 * después, cuadrando una cuenta -- no tenía para dónde coger.
 *
 * Va abajo y en amarillo y no en rojo: no es un error, es una decisión suya
 * que se puede cambiar de opinión.
 */
function tarjetaDeDejados(raiz, platos, personas) {
  const enCero = platos.reduce((a, p) => a + p.sinPrecio, 0);

  const volver = (tipo, empresa, nombre) => {
    volverARevisar(estado.datos, tipo, empresa, nombre);
    cambio();
    pintarErrores(raiz);
    mensaje(`"${nombre}" vuelve a la lista de arriba.`, "bien");
  };

  return el("section", { clase: "tarjeta aviso-arreglable" },
    el("h2", { texto: `Dejados así (${platos.length + personas.length})` }),
    el("p", { clase: "nota" },
      "Estos ya los revisó y dijo que se quedaran como están, así que no le " +
      "vuelvo a preguntar por ellos.",
      enCero
        ? el("span", {}, " Ojo: ", el("strong", { texto: `${enCero} de esos renglones se siguen cobrando en $ 0` }),
            ". Si fue sin querer, tráigalo de vuelta y póngale precio.")
        : ""),
    el("ul", { clase: "lista-arreglable" },
      ...platos.map((p) =>
        el("li", {},
          el("div", { clase: "quien" },
            el("strong", { texto: p.nombre }),
            el("div", { clase: "apunte" },
              `plato · ${p.renglones} ${p.renglones === 1 ? "renglón" : "renglones"}` +
              (p.sinPrecio ? ` · ${p.sinPrecio} en $ 0` : ""))
          ),
          el("button", { clase: "chico", alHacerClic: () => volver("PLATO", "", p.nombre) },
             "Volver a revisarlo")
        )
      ),
      ...personas.map((p) =>
        el("li", {},
          el("div", { clase: "quien" },
            el("strong", { texto: p.nombre }),
            el("div", { clase: "apunte" },
              `persona de ${p.empresa} · ${p.renglones} ${p.renglones === 1 ? "renglón" : "renglones"}`)
          ),
          el("button", { clase: "chico", alHacerClic: () => volver("PERSONA", p.empresa, p.nombre) },
             "Volver a revisarla")
        )
      )
    )
  );
}

// ---------------------------------------------------------------------------
//  Los obvios, todos de una
// ---------------------------------------------------------------------------

function tarjetaDeObvios(raiz, obvios) {
  const marcados = new Map(obvios.map((p) => [p.nombre, true]));

  const filas = obvios.map((p) => {
    const s = p.sugerencias.find((x) => x.obvio);
    const previa = simularUnionDePlato(estado.datos, p.nombre, s.nombre);
    return el("tr", {},
      el("td", {},
        el("input", {
          type: "checkbox", checked: true,
          alCambiar: (ev) => marcados.set(p.nombre, ev.target.checked),
        })),
      el("td", {}, el("code", { clase: "muestra-mal", texto: p.nombre })),
      el("td", { texto: "→" }),
      el("td", {}, el("code", { clase: "muestra-bien", texto: s.nombre })),
      el("td", { clase: "dato", texto: String(previa.renglones) }),
      el("td", { clase: "dato plata " + (previa.diferencia > 0 ? "sube" : ""),
                 texto: previa.diferencia ? "+" + pesos(previa.diferencia) : "—" })
    );
  });

  return el("section", { clase: "tarjeta aviso-arreglable" },
    el("h3", { texto: `${obvios.length} platos que casi seguro son el mismo` }),
    el("p", { clase: "nota" },
      "En estos, lo único que cambia son palabras que no dicen nada distinto " +
      '("con", "de"). Desmarque el que no le cuadre.'),
    tabla(
      [{ titulo: "" }, { titulo: "Como se anotó" }, { titulo: "" },
       { titulo: "Como está en el catálogo" },
       { titulo: "Renglones", clase: "dato" }, { titulo: "Cambia", clase: "dato" }],
      filas
    ),
    el("button", {
      clase: "principal",
      alHacerClic: async () => {
        const hacer = obvios.filter((p) => marcados.get(p.nombre));
        if (!hacer.length) { mensaje("No marcó ninguno.", "ojo"); return; }

        let cambioTotal = 0;
        for (const p of hacer) {
          const s = p.sugerencias.find((x) => x.obvio);
          cambioTotal += simularUnionDePlato(estado.datos, p.nombre, s.nombre).diferencia;
        }

        const seguro = await confirmar({
          titulo: `Unir ${hacer.length} platos`,
          mensaje:
            `Se van a unir ${hacer.length} platos con los del catálogo` +
            (cambioTotal ? `, y lo que se cobra sube ${pesos(cambioTotal)}.` : "."),
          siTexto: "Sí, unirlos",
        });
        if (!seguro) return;

        let renglones = 0;
        for (const p of hacer) {
          const s = p.sugerencias.find((x) => x.obvio);
          renglones += unirPlatoSuelto(estado.datos, p.nombre, s.nombre).renglones;
        }
        cambio();
        mensaje(`${hacer.length} platos unidos, ${renglones} renglones arreglados.`, "bien", 7);
        pintarErrores(raiz);
      },
    }, "Unir los marcados")
  );
}

export { cuantosSueltos };
