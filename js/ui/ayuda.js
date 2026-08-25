// ============================================================================
//  ayuda.js  -  La pantalla "Cómo se usa"
//
//  El texto NO está escrito aquí: se trae de docs/manual.html.
//
//  Es a propósito. Si el manual estuviera escrito en dos sitios, el día que
//  cambiemos algo de la app arreglaríamos uno y el otro quedaría mintiendo,
//  que es peor que no tener manual. Así hay un solo texto: el de docs, que
//  además se puede imprimir y pegar al lado del computador.
// ============================================================================

import { el, vaciar, acciones, poner } from "./componentes.js";

const RUTA_MANUAL = "docs/manual.html";

/** Nos quedamos con esto ya cargado, para no ir a buscarlo cada vez. */
let manualEnMemoria = null;

export async function pintarAyuda(raiz) {
  vaciar(raiz);

  poner(raiz, 
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Cómo se usa" }),
        el("p", { texto: "Todo lo que hay que saber, en una sola página." })
      )
    ),
    acciones(
      el("button", {
        clase: "principal",
        alHacerClic: () => window.print(),
      }, "Imprimir esta página"),
      el("a", {
        clase: "boton-enlace",
        href: RUTA_MANUAL,
        target: "_blank",
        rel: "noopener",
      }, "Abrirla aparte")
    )
  );

  const caja = el("div", { clase: "manual-adentro" },
    el("p", { clase: "cargando", texto: "Trayendo el manual…" })
  );
  poner(raiz, caja);

  try {
    if (!manualEnMemoria) manualEnMemoria = await traerManual();
    vaciar(caja);
    poner(caja, manualEnMemoria.cloneNode(true));
  } catch (error) {
    vaciar(caja);
    poner(caja, 
      el("section", { clase: "tarjeta" },
        el("h2", { texto: "El manual no se pudo traer" }),
        el("p", {},
          "Ábralo directamente aquí: ",
          el("a", { href: RUTA_MANUAL, target: "_blank", rel: "noopener", texto: "manual" }),
          "."),
        el("p", { clase: "nota", texto: String(error.message || error) })
      )
    );
  }
}

/**
 * Trae docs/manual.html y saca de adentro solo el contenido y sus estilos.
 * No lo metemos en un iframe porque ahí no se puede imprimir junto con el
 * resto ni se adapta al ancho de la pantalla.
 */
async function traerManual() {
  const respuesta = await fetch(RUTA_MANUAL, { cache: "no-store" });
  if (!respuesta.ok) throw new Error("No se encontró " + RUTA_MANUAL);

  const documento = new DOMParser().parseFromString(await respuesta.text(), "text/html");
  const hoja = documento.querySelector(".hoja");
  if (!hoja) throw new Error("El manual no tiene la forma esperada.");

  const envoltura = document.createElement("div");

  // Los estilos del manual, encerrados para que no se desparramen por el
  // resto de la app. Le quitamos el body y el .hoja, que aquí los pone la app.
  const estilos = [...documento.querySelectorAll("style")]
    .map((s) => s.textContent)
    .join("\n")
    .replace(/^\s*body\s*\{[^}]*\}/gm, "")
    .replace(/^\s*\.hoja\s*\{[^}]*\}/gm, "");

  const etiqueta = document.createElement("style");
  etiqueta.textContent = `.manual-adentro { ${""} }\n` + estilos;
  envoltura.append(etiqueta);

  // Le quitamos el título grande: la pantalla ya tiene el suyo.
  const titulo = hoja.querySelector("h1");
  if (titulo) titulo.remove();
  const lema = hoja.querySelector(".lema");
  if (lema) lema.remove();

  // Los enlaces internos del manual (#dia, #quincena...) chocarían con el
  // menú de la app, que también usa #. Los volvemos saltos de verdad.
  for (const enlace of hoja.querySelectorAll('a[href^="#"]')) {
    const destino = enlace.getAttribute("href").slice(1);
    enlace.removeAttribute("href");
    enlace.setAttribute("role", "link");
    enlace.setAttribute("tabindex", "0");
    enlace.style.cursor = "pointer";
    enlace.style.color = "var(--verde)";
    enlace.style.textDecoration = "underline";
    const ir = () => {
      const alla = envoltura.querySelector("#" + CSS.escape(destino));
      if (alla) alla.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    enlace.addEventListener("click", ir);
    enlace.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    });
  }

  envoltura.append(...hoja.childNodes);
  return envoltura;
}
