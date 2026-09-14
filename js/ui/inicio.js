// ============================================================================
//  inicio.js  -  La portada: "¿qué va a hacer?"
//
//  El negocio son DOS cosas al revés una de la otra:
//
//    Almuerzos    lo que se VENDE. Quién nos debe.
//    Proveedores  lo que se COMPRA. A quién le debemos.
//
//  Casi no comparten datos -- los empleados de las fábricas no son
//  proveedores, un almuerzo no es un tocino -- pero van en la MISMA app: dos
//  sitios serían dos respaldos, dos versiones y dos carpetas, y ella tendría
//  que acordarse de en cuál está.
//
//  La portada es la puerta entre los dos. Al entrar a uno, el menú de arriba
//  muestra solo ese: así vuelve a ser corto, que era el problema.
//
//  NO es la pantalla de arranque a propósito: la app sigue abriendo en
//  Registrar. Ella entra a anotar a las seis de la mañana, y meterle una
//  portada por delante todos los días sería cobrarle un paso a la que trabaja
//  para ayudarle a la que explora -- y ella no explora.
// ============================================================================

import { el, poner, vaciar } from "./componentes.js";

/**
 * Pinta la portada.
 *
 * Los mundos los manda app.js, que es quien tiene el mapa de pantallas. Así
 * una pantalla nueva no se puede quedar por fuera sin que se note: si no está
 * en ningún mundo, sale abajo en "Lo demás".
 */
export function pintarInicio(raiz, mundos, deLosDos, pantallas) {
  vaciar(raiz);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "¿Qué va a hacer?" }),
        el("p", { texto: "Toque una de las dos. Arriba le quedan solo las cosas de esa." })
      )
    ),

    el("div", { clase: "mundos" },
      ...mundos.map((m) => tarjetaDeMundo(m, pantallas))
    )
  );

  // Lo que sirve para los dos mundos, aparte y más discreto.
  poner(raiz, tarjetaDeGrupo(deLosDos, pantallas));

  // Una pantalla que no quedó en ningún lado igual tiene que poder abrirse.
  // Esconderla, en una app que ella no explora, es lo mismo que borrarla.
  const ubicadas = new Set([
    ...mundos.flatMap((m) => m.grupos.flatMap((g) => g.pantallas)),
    ...deLosDos.pantallas,
  ]);
  const sueltas = Object.keys(pantallas).filter(
    (k) => k !== "inicio" && !ubicadas.has(k));
  if (sueltas.length) {
    poner(raiz, tarjetaDeGrupo(
      { nombre: "Lo demás", explica: "Todavía sin agrupar", pantallas: sueltas },
      pantallas));
  }
}

/**
 * Un mundo: el botón grande y, debajo, lo que hay adentro POR GRUPOS.
 *
 * Se ve lo de adentro y no solo el nombre porque ella no explora: un botón que
 * dice "Proveedores" y nada más la obliga a entrar a ver qué hay, y si no le
 * suena, no entra.
 *
 * Y va por grupos y no de corrido: Almuerzos tiene trece pantallas, y trece
 * botones uno debajo del otro son una pared -- hay que leerla entera para
 * encontrar una. Partidas en "el día a día", "la plata" y "las listas", se
 * salta directo al montón donde está lo que busca.
 */
function tarjetaDeMundo(mundo, pantallas) {
  const primera = mundo.grupos[0] && mundo.grupos[0].pantallas[0];

  return el("section", { clase: "mundo" },
    el("a", { clase: "mundo-entrar", href: "#" + (primera || "inicio") },
      el("h2", { texto: mundo.nombre }),
      el("p", { texto: mundo.dice })
    ),
    el("div", { clase: "mundo-dentro" },
      ...mundo.grupos.map((g) =>
        el("div", { clase: "mundo-grupo" },
          // Con un solo grupo el rótulo sobra: sería un título para decir lo
          // mismo que ya dice el nombre del mundo.
          mundo.grupos.length > 1
            ? el("h3", { clase: "mundo-grupo-titulo", texto: g.nombre })
            : null,
          el("div", { clase: "mundo-grupo-botones" },
            ...g.pantallas
              .filter((cual) => pantallas[cual])
              .map((cual) => botonDePantalla(pantallas[cual], cual))
          )
        )
      )
    )
  );
}

function tarjetaDeGrupo(grupo, pantallas) {
  return el("section", { clase: "grupo-inicio" },
    el("div", { clase: "grupo-inicio-titulo" },
      el("h2", { texto: grupo.nombre }),
      grupo.explica ? el("p", { texto: grupo.explica }) : null
    ),
    el("div", { clase: "grupo-inicio-botones" },
      ...grupo.pantallas.map((cual) => {
        const p = pantallas[cual];
        if (!p) return null;
        return botonDePantalla(p, cual);
      })
    )
  );
}

/**
 * Un botón de la portada, con lo que tiene pendiente.
 *
 * El numerito era lo único que valía la pena de la vieja pantalla de Ajustes
 * -- que era otra portada, duplicada, con los mismos destinos que esta. Aquí
 * sirve más: "Revisar nombres" y "Datos y respaldos" ya no están en la barra
 * de arriba, así que sin esto no habría cómo enterarse de que tienen algo
 * esperando.
 *
 * Un contador roto no puede tumbar la portada: si falla, se queda sin numerito.
 */
function botonDePantalla(pantalla, cual) {
  let pendientes = 0;
  if (typeof pantalla.contar === "function") {
    try { pendientes = pantalla.contar(); } catch { pendientes = 0; }
  }

  return el("a", {
    clase: "boton-inicio" + (pendientes ? " con-pendiente" : ""),
    href: "#" + cual,
  },
    el("strong", { texto: pantalla.titulo }),
    pantalla.dice ? el("span", { texto: pantalla.dice }) : null,
    pendientes
      ? el("span", { clase: "etiqueta pendiente", texto: pendientes + " por revisar" })
      : null
  );
}
