// ============================================================================
//  inicio.js  -  La portada: "¿qué va a hacer?"
//
//  El menú de arriba es una tira de nombres sueltos, y ya va por once. Con las
//  compras a proveedores encima se vuelve una lista de veinte palabras donde
//  hay que ADIVINAR cuál sirve para lo que uno quiere hacer.
//
//  Esta pantalla es el mapa: las cosas agrupadas por para-qué-sirven, y cada
//  una diciendo qué hace en una línea. El menú de arriba no se toca -- lo que
//  ella ya se sabe de memoria se queda donde está.
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
 * Los grupos los manda app.js, que es quien tiene el mapa de pantallas. Así
 * una pantalla nueva no se puede quedar por fuera de la portada sin que se
 * note: si no está en ningún grupo, sale abajo en "Lo demás".
 */
export function pintarInicio(raiz, grupos, pantallas) {
  vaciar(raiz);

  const ubicadas = new Set(grupos.flatMap((g) => g.pantallas));
  const sueltas = Object.keys(pantallas).filter(
    (k) => k !== "inicio" && !ubicadas.has(k));

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "¿Qué va a hacer?" }),
        el("p", { texto: "Todo lo que hace la app, por grupos. Toque lo que necesite." })
      )
    )
  );

  for (const grupo of grupos) {
    poner(raiz, tarjetaDeGrupo(grupo, pantallas));
  }

  // Una pantalla que no quedó en ningún grupo igual tiene que poder abrirse.
  // Callarla sería esconderla, y esconder algo en una app que ella no explora
  // es lo mismo que borrarlo.
  if (sueltas.length) {
    poner(raiz, tarjetaDeGrupo(
      { nombre: "Lo demás", explica: "Todavía sin agrupar", pantallas: sueltas },
      pantallas));
  }
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
        return el("a", { clase: "boton-inicio", href: "#" + cual },
          el("strong", { texto: p.titulo }),
          p.dice ? el("span", { texto: p.dice }) : null
        );
      })
    )
  );
}
