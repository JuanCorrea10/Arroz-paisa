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
} from "./componentes.js";
import { estado, cambio, empresas } from "./estado.js";
import { pesos, normalizar } from "../nucleo/formato.js";
import {
  personasSueltas, platosSueltos, unirPersonaSuelta, crearPersonaSuelta,
  simularUnionDePlato, unirPlatoSuelto, crearPlatoSuelto, dejarComoEsta,
  cuantosSueltos,
} from "../nucleo/sueltos.js";
import { gruposParaRevisar } from "../nucleo/nombres.js";

export function pintarErrores(raiz) {
  vaciar(raiz);

  const personas = personasSueltas(estado.datos);
  const platos = platosSueltos(estado.datos);
  const parecidos = gruposParaRevisar(estado.datos).length;

  raiz.append(
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
      cifra("Renglones sin cobrar bien", String(
        personas.reduce((a, p) => a + p.renglones, 0) +
        platos.reduce((a, p) => a + p.sinPrecio, 0)
      ), true)
    )
  );

  if (!personas.length && !platos.length) {
    raiz.append(
      vacio("No hay nada raro",
        el("p", {},
          "Todos los renglones apuntan a una persona y a un plato que existen. ",
          parecidos
            ? el("span", {},
                "Todavía quedan ", el("a", { href: "#nombres", texto: `${parecidos} nombres parecidos` }),
                " por revisar, pero eso no daña ninguna cuenta.")
            : "Todo en orden."
        ))
    );
    return;
  }

  raiz.append(
    el("p", { clase: "nota" },
      "Mientras no se arreglen, estos renglones entran en $ 0 a la cuenta de " +
      "cobro y no aparecen en la Cocina. O sea: se vendió la comida y no se " +
      "está cobrando.")
  );

  // --- Personas ------------------------------------------------------------
  if (personas.length) {
    raiz.append(el("h2", { texto: "Personas que no están en la lista de su empresa" }));
    for (const p of personas) raiz.append(tarjetaDePersona(raiz, p));
  }

  // --- Platos --------------------------------------------------------------
  if (platos.length) {
    raiz.append(el("h2", { texto: "Platos que no están en el catálogo" }));

    const obvios = platos.filter((p) => p.sugerencias.some((s) => s.obvio));
    if (obvios.length > 1) raiz.append(tarjetaDeObvios(raiz, obvios));

    for (const p of platos) raiz.append(tarjetaDePlato(raiz, p));
  }

  if (parecidos) {
    raiz.append(
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

function tarjetaDePersona(raiz, p) {
  const grupo = "sp-" + p.empresa + "-" + p.nombre.replace(/\s+/g, "_");
  const parecidas = p.sugerencias.length ? elegirParecido(p.sugerencias, grupo) : null;

  return el("section", { clase: "tarjeta suelto suelto-persona" },
    el("div", { clase: "fila entre" },
      el("div", { clase: "fila" },
        cinta(p.empresa),
        el("h3", { texto: p.nombre })
      ),
      el("span", { clase: "apunte-suelto", texto: `${p.renglones} renglones · ${p.dias} días · ${pesos(p.plata)}` })
    ),

    parecidas
      ? el("div", {},
          el("p", {}, "En ", el("strong", { texto: p.empresa }), " sí existe:"),
          parecidas.nodo)
      : el("p", { clase: "nota" },
          `En ${p.empresa} no hay nadie parecido. Seguramente es alguien nuevo.`),

    tresBotones({
      siTexto: parecidas ? "Sí, es la misma" : "Crearla",
      alSi: () => {
        if (!parecidas) return crearla(raiz, p);
        unirla(raiz, p, parecidas.cual());
      },
      noTexto: parecidas ? "No, es otra persona" : "Es un error de escritura",
      alNo: () => {
        if (!parecidas) {
          mensaje("Corrija el nombre desde Personas, o déjelo así por ahora.", "ojo", 7);
          return;
        }
        crearla(raiz, p);
      },
      alDejar: () => dejarlaAsi(raiz, p),
    })
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
  const lista = empresas();
  const datos = await pedirDatos({
    titulo: `Crear a ${p.nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", valor: p.nombre, requerido: true },
      {
        nombre: "empresaFactura",
        etiqueta: "¿A qué empresa se le cobra?",
        tipo: "seleccion",
        valor: p.empresaFactura || p.empresa,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
      },
    ],
    textoAceptar: "Crearla",
  });
  if (!datos) return;

  const r = crearPersonaSuelta(estado.datos, p.empresa, p.nombre, datos.empresaFactura);
  // Si además le cambió el nombre, lo aplicamos.
  if (normalizar(datos.nombre) !== normalizar(p.nombre)) {
    for (const persona of estado.datos.personas) {
      if (normalizar(persona.empresaCome) === p.empresa &&
          normalizar(persona.nombre) === normalizar(r.nombre)) {
        persona.nombre = normalizar(datos.nombre);
      }
    }
    for (const c of estado.datos.consumos) {
      if (normalizar(c.empresaCome) === p.empresa && normalizar(c.persona) === normalizar(r.nombre)) {
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
  const parecidos = p.sugerencias.length ? elegirParecido(p.sugerencias, grupo) : null;

  return el("section", { clase: "tarjeta suelto suelto-plato" },
    el("div", { clase: "fila entre" },
      el("h3", { texto: p.nombre }),
      el("span", { clase: "apunte-suelto" },
        `${p.renglones} renglones · ${p.cantidad} pedidos`,
        p.sinPrecio ? el("span", { clase: "etiqueta malo", texto: `${p.sinPrecio} en $ 0` }) : null)
    ),
    el("div", { clase: "fila" }, ...p.empresas.map(cinta)),

    parecidos
      ? el("div", {},
          el("p", { texto: "En el catálogo sí está:" }),
          parecidos.nodo)
      : el("p", { clase: "nota", texto: "No hay nada parecido en el catálogo." }),

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

    tresBotones({
      siTexto: parecidos ? "Sí, es el mismo" : "Agregarlo al catálogo",
      alSi: () => {
        if (!parecidos) return crearPlato(raiz, p);
        unirPlato(raiz, p, parecidos.cual());
      },
      noTexto: parecidos ? "No, es un plato distinto" : "Ponerle precio",
      alNo: () => crearPlato(raiz, p),
      alDejar: () => dejarPlatoAsi(raiz, p),
    })
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
  const datos = await pedirDatos({
    titulo: `Agregar "${p.nombre}" al catálogo`,
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
