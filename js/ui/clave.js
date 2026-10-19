// ============================================================================
//  clave.js (ui)  -  Pedir la clave de administrador, acordarse de que ya se
//                    ingresó, y la pantalla donde se configura.
//
//  Las reglas (qué pantallas la piden, cómo se guarda) están en
//  nucleo/clave.js. Aquí solo va lo que se ve: el diálogo, el aviso de sesión
//  abierta en la barra, la tarjeta de pantalla cerrada, y la pantalla de
//  configurarla.
//
//  Una vez ingresada, la sesión queda abierta un rato: si pidiera la clave en
//  cada pantalla, cambiar tres precios y mirar las ventas sería escribirla
//  cuatro veces, y terminaría quitándola. Se cierra sola a los quince minutos
//  sin actividad, al recargar la página, o con "Cerrar sesión" arriba.
//
//  Los textos van en tono formal a propósito: esto ya no lo usa solo ella sino
//  el personal del negocio, y un aviso que suena a nota entre familia pierde
//  autoridad justo donde más la necesita.
// ============================================================================

import { el, poner, vaciar, ventana, mensaje, confirmar } from "./componentes.js";
import { estado, cambio } from "./estado.js";
import {
  hayClave, ponerClave, quitarClave, esLaClave, revisarClave, pideClave,
  pantallasConClave, ponerPantallasConClave, sePuedeUsarClave,
  NUNCA_PIDEN, PANTALLA_DE_LA_CLAVE,
} from "../nucleo/clave.js";

// ---------------------------------------------------------------------------
//  Sesión abierta o cerrada
// ---------------------------------------------------------------------------

const QUINCE_MINUTOS = 15 * 60 * 1000;

/** Hasta cuándo está abierta. 0 es cerrada. Vive solo en memoria: al
 *  recargar la página se cierra, que es lo que uno espera de una clave. */
let abiertaHasta = 0;
const oyentes = new Set();

export function estaAbierta() {
  return hayClave(estado.datos) && Date.now() < abiertaHasta;
}

/** ¿Esta pantalla está cerrada AHORA? (Pide clave y no se ha ingresado.) */
export function necesitaClave(cual) {
  return pideClave(estado.datos, cual) && !estaAbierta();
}

export function abrir() {
  abiertaHasta = Date.now() + QUINCE_MINUTOS;
  avisar();
}

export function cerrar() {
  abiertaHasta = 0;
  avisar();
}

/** Para que la barra se entere cuando se abre o se cierra. */
export function alAbrirOCerrar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar() {
  for (const fn of oyentes) fn();
}

// ---------------------------------------------------------------------------
//  Pedirla
// ---------------------------------------------------------------------------

/** Si ya hay un diálogo pidiéndola, se devuelve ese mismo: pintar() puede
 *  correr dos veces seguidas y no pueden salir dos ventanas encimadas. */
let pidiendo = null;

/**
 * Deja pasar si no hay clave, si la sesión está abierta, o si la ingresa
 * bien. Devuelve true o false. "paraQue" sale en el diálogo: "entrar a
 * Catálogo".
 */
export function conClave(paraQue) {
  if (!hayClave(estado.datos)) return Promise.resolve(true);
  if (estaAbierta()) { abrir(); return Promise.resolve(true); }
  return pedirLaClave(paraQue);
}

/**
 * Lo mismo, pero solo si ESA pantalla está entre las que piden clave. Es lo
 * que usan los botones que tocan el catálogo desde Registrar: si Catálogo
 * quedó sin restricción, esos botones tampoco preguntan.
 */
export function conClavePara(pantalla, paraQue) {
  if (!pideClave(estado.datos, pantalla)) return Promise.resolve(true);
  return conClave(paraQue);
}

/** El diálogo. Resuelve true si la ingresó bien, false si canceló. */
export function pedirLaClave(paraQue) {
  if (pidiendo) return pidiendo;

  pidiendo = new Promise((resolver) => {
    let resultado = false;
    const campo = el("input", {
      type: "password", clase: "campo-clave", autocomplete: "current-password",
      "aria-label": "Clave de administrador",
    });
    const error = el("p", { clase: "nota malo oculto", role: "alert" });
    const ver = el("input", { type: "checkbox", estilo: "width:auto;min-height:auto" });
    ver.addEventListener("change", () => { campo.type = ver.checked ? "text" : "password"; campo.focus(); });

    const cuerpo = el("div", {},
      el("p", { texto: paraQue
        ? `Para ${paraQue} se requiere la clave de administrador.`
        : "Ingrese la clave de administrador." }),
      el("div", { clase: "campo" },
        el("label", { for: "campo-la-clave", texto: "Clave" }),
        campo),
      el("label", { clase: "casilla-ver" }, ver, " Mostrar la clave"),
      error,
      el("p", { clase: "nota", texto: "Si no tiene la clave, cancele: el registro diario de pedidos no la requiere. " +
        "Si un precio está mal, informe a la administradora." })
    );
    campo.id = "campo-la-clave";

    const { cerrar: cerrarVentana } = ventana({
      titulo: "Clave de administrador",
      cuerpo,
      botones: [
        { texto: "Cancelar" },
        { texto: "Ingresar", clase: "principal", alHacerClic: () => { revisar(); return false; } },
      ],
      alCerrar: () => { pidiendo = null; resolver(resultado); },
    });

    async function revisar() {
      try {
        const bien = await esLaClave(estado.datos, campo.value);
        if (!bien) {
          error.textContent = "La clave no es correcta. Inténtelo de nuevo.";
          error.classList.remove("oculto");
          campo.value = "";
          campo.focus();
          return;
        }
        resultado = true;
        abrir();
        cerrarVentana();
      } catch (e) {
        // Fuera de https el navegador no deja sacar la huella. Se dice, no se
        // deja el botón "sin hacer nada".
        error.textContent = String(e.message || e);
        error.classList.remove("oculto");
      }
    }
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); revisar(); }
    });
  });
  return pidiendo;
}

/**
 * Lo que se pinta en el sitio de una pantalla cerrada.
 *
 * Se pinta ANTES de preguntar la clave, no después: si cancela el diálogo
 * tiene que quedar algo que diga qué pasó y cómo seguir, no una pantalla en
 * blanco. "alAbrir" es lo que hay que hacer cuando la ingrese bien.
 */
export function pintarCerrada(raiz, titulo, alAbrir) {
  vaciar(raiz);
  poner(raiz,
    el("section", { clase: "tarjeta pantalla-cerrada" },
      el("div", { clase: "candado-grande", "aria-hidden": "true", texto: "🔒" }),
      el("h1", { texto: `${titulo} requiere la clave de administrador` }),
      el("p", { texto: "Ingrese la clave para continuar. El registro diario de pedidos no la requiere." }),
      el("p", { clase: "nota", texto:
        "Si un precio está mal, anote el pedido normalmente e informe a la administradora " +
        "para que lo corrija: el pedido se puede ajustar después." }),
      el("div", { clase: "acciones" },
        el("button", {
          clase: "principal",
          alHacerClic: async () => { if (await conClave(`entrar a ${titulo}`)) alAbrir(); },
        }, "Ingresar la clave"),
        el("a", { clase: "boton", href: "#registrar", texto: "Ir a Registrar el día" })
      )
    )
  );
}

// ---------------------------------------------------------------------------
//  La barra: "Sesión de administrador · Cerrar sesión", y cerrarse sola
// ---------------------------------------------------------------------------

/**
 * Pone en la barra el aviso de sesión abierta, y la cierra sola a los quince
 * minutos sin actividad. "alCerrarseSola" lo da app.js: vuelve a pintar si
 * la pantalla en la que quedó parada era de las cerradas.
 *
 * Cada toque en la página corre el reloj: mientras se estén cambiando
 * precios no se cierra en la cara. Se cierra cuando se dejó sola.
 */
export function vigilarLaClave(alCerrarseSola) {
  const sitio = document.getElementById("clave-abierta");

  const pintarAviso = () => {
    if (!sitio) return;
    vaciar(sitio);
    if (!estaAbierta()) { sitio.classList.add("oculto"); return; }
    sitio.classList.remove("oculto");
    poner(sitio,
      el("span", { texto: "Sesión de administrador" }),
      el("button", {
        clase: "chico",
        type: "button",
        title: "Las pantallas con candado volverán a solicitar la clave",
        alHacerClic: () => {
          cerrar();
          mensaje("Sesión cerrada. Las pantallas con candado volverán a solicitar la clave.", "bien", 5);
          alCerrarseSola();
        },
      }, "Cerrar sesión")
    );
  };
  alAbrirOCerrar(pintarAviso);
  pintarAviso();

  const correrElReloj = () => { if (estaAbierta()) abiertaHasta = Date.now() + QUINCE_MINUTOS; };
  document.addEventListener("pointerdown", correrElReloj, true);
  document.addEventListener("keydown", correrElReloj, true);

  setInterval(() => {
    if (abiertaHasta && Date.now() >= abiertaHasta) {
      cerrar();
      alCerrarseSola();
    }
  }, 30 * 1000);
}

// ---------------------------------------------------------------------------
//  La pantalla: configurarla, cambiarla, quitarla, y escoger qué restringe
// ---------------------------------------------------------------------------

/**
 * "pantallas" es el mapa de app.js: de ahí salen los títulos. Se recibe y no
 * se importa porque app.js arranca la app al importarse.
 */
export function pintarClave(raiz, pantallas = {}) {
  vaciar(raiz);
  const hay = hayClave(estado.datos);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Clave de administrador" }),
        el("p", { texto: "Permite que el personal registre los pedidos sin modificar precios, catálogo, personas ni empresas." })
      )
    ),
    tarjetaDeEstado(raiz, pantallas, hay),
    tarjetaDeQueCierra(raiz, pantallas, hay),
    el("section", { clase: "tarjeta" },
      el("h2", { texto: "Si olvida la clave" }),
      el("p", { texto:
        "No se pierde información. El soporte técnico puede restablecerla para " +
        "que usted configure una nueva. Mientras tanto, el registro de pedidos " +
        "sigue funcionando con normalidad." })
    )
  );
}

function tarjetaDeEstado(raiz, pantallas, hay) {
  if (!sePuedeUsarClave()) {
    return el("section", { clase: "tarjeta con-problemas" },
      el("h2", { texto: "No es posible usar clave en esta dirección" }),
      el("p", { texto:
        "El navegador no permite usar claves en esta dirección. Abra la " +
        "aplicación desde la dirección publicada (la que empieza por https) " +
        "e intente de nuevo." })
    );
  }

  if (!hay) {
    return el("section", { clase: "tarjeta" },
      el("h2", { texto: "No hay clave configurada" }),
      el("p", { texto:
        "Sin clave, cualquier persona que use este computador puede modificar " +
        "precios, platos, personas y empresas, y consultar las ventas. Con una " +
        "clave, esas pantallas la solicitan antes de abrirse; el registro de " +
        "pedidos sigue disponible para todo el personal." }),
      el("div", { clase: "acciones" },
        el("button", { clase: "principal", alHacerClic: () => ponerla(raiz, pantallas) },
          "Configurar la clave"))
    );
  }

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "Clave configurada" }),
    el("p", { texto:
      "Las pantallas marcadas abajo la solicitan. Una vez ingresada, la sesión " +
      "permanece abierta 15 minutos sin actividad; arriba aparece " +
      "\"Cerrar sesión\" para cerrarla antes." }),
    el("div", { clase: "acciones" },
      el("button", { clase: "boton", alHacerClic: () => ponerla(raiz, pantallas) }, "Cambiar la clave"),
      el("button", { clase: "peligro", alHacerClic: () => quitarla(raiz, pantallas) }, "Quitar la clave")
    )
  );
}

/**
 * En qué orden se muestran para escoger: primero lo que más importa
 * restringir (las listas y los respaldos), después la plata del negocio, y
 * al final lo que casi siempre queda disponible. En el orden del mapa de la
 * app salían primero "Por persona" y "Cuenta de cobro", que son justo las
 * que no.
 */
const ORDEN_PARA_ESCOGER = [
  "catalogo", "personas", "empresas", "nombres", "datos",
  "ventas", "ventasmes", "compras", "pagos",
  "cobro", "persona", "compartir",
];

/** Las pantallas que se pueden restringir, en ese orden; lo nuevo va al final. */
function lasQueSePuedenCerrar(pantallas) {
  const puesto = (cual) => {
    const i = ORDEN_PARA_ESCOGER.indexOf(cual);
    return i < 0 ? ORDEN_PARA_ESCOGER.length : i;
  };
  return Object.entries(pantallas)
    .filter(([cual]) => !NUNCA_PIDEN.includes(cual) && cual !== PANTALLA_DE_LA_CLAVE)
    .map(([cual, p]) => ({ cual, titulo: p.titulo || cual, dice: p.dice || "" }))
    .sort((a, b) => puesto(a.cual) - puesto(b.cual));
}

function tarjetaDeQueCierra(raiz, pantallas, hay) {
  const lista = lasQueSePuedenCerrar(pantallas);
  const marcadas = new Set(pantallasConClave(estado.datos));
  const siempreAbiertas = NUNCA_PIDEN
    .filter((cual) => pantallas[cual])
    .map((cual) => pantallas[cual].titulo);

  const guardar = () => {
    const elegidas = [...raiz.querySelectorAll(".lista-clave input:checked")].map((c) => c.value);
    ponerPantallasConClave(estado.datos, elegidas);
    cambio();
    mensaje("Guardado.", "bien", 2);
  };

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: hay ? "Pantallas que requieren la clave" : "Pantallas que requerirán la clave" }),
    el("p", { clase: "nota", texto: hay
      ? "Marque las pantallas reservadas para el administrador. Los cambios se guardan automáticamente."
      : "Cuando configure la clave, estas pantallas la solicitarán. Puede cambiarlas aquí en cualquier momento." }),
    el("div", { clase: "lista-clave" },
      ...lista.map((p) => {
        const casilla = el("input", {
          type: "checkbox", value: p.cual, checked: marcadas.has(p.cual),
          disabled: !hay,
          alCambiar: guardar,
        });
        return el("label", {},
          casilla,
          el("span", {},
            el("strong", { texto: p.titulo }),
            p.dice ? el("small", { texto: p.dice }) : null)
        );
      })
    ),
    el("p", { clase: "nota" },
      el("strong", { texto: "Siempre disponibles: " }),
      siempreAbiertas.join(", ") + ". Corresponden al trabajo diario y no se pueden restringir."),
    el("p", { clase: "nota", texto:
      "En Registrar el día, asignar precio a un plato o crear un plato nuevo " +
      "también requiere la clave, porque modifica el catálogo. Crear una " +
      "persona nueva no la requiere." })
  );
}

/** Pide la clave nueva dos veces: una sola, con un dedo mal puesto, la deja por fuera. */
function pedirClaveNueva(titulo) {
  return new Promise((resolver) => {
    let resultado = null;
    const una = el("input", { type: "password", clase: "campo-clave", autocomplete: "new-password" });
    const otra = el("input", { type: "password", clase: "campo-clave", autocomplete: "new-password" });
    una.id = "campo-clave-una"; otra.id = "campo-clave-otra";
    const error = el("p", { clase: "nota malo oculto", role: "alert" });
    const ver = el("input", { type: "checkbox", estilo: "width:auto;min-height:auto" });
    ver.addEventListener("change", () => {
      una.type = otra.type = ver.checked ? "text" : "password";
    });

    const cuerpo = el("div", { clase: "rejilla" },
      el("p", { texto: "Puede contener números y letras. Mínimo 4 caracteres." }),
      el("div", { clase: "campo" }, el("label", { for: una.id, texto: "Clave nueva" }), una),
      el("div", { clase: "campo" }, el("label", { for: otra.id, texto: "Confirme la clave" }), otra),
      el("label", { clase: "casilla-ver" }, ver, " Mostrar la clave"),
      error
    );

    const { cerrar: cerrarVentana } = ventana({
      titulo,
      cuerpo,
      botones: [
        { texto: "Cancelar" },
        { texto: "Guardar la clave", clase: "principal", alHacerClic: () => { revisar(); return false; } },
      ],
      alCerrar: () => resolver(resultado),
    });

    function revisar() {
      const malo = revisarClave(una.value) ||
        (una.value.trim() !== otra.value.trim() ? "Las dos claves no coinciden. Escríbalas de nuevo." : null);
      if (malo) {
        error.textContent = malo;
        error.classList.remove("oculto");
        return;
      }
      resultado = una.value.trim();
      cerrarVentana();
    }
    cuerpo.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); revisar(); }
    });
  });
}

async function ponerla(raiz, pantallas) {
  const habia = hayClave(estado.datos);
  const clave = await pedirClaveNueva(habia ? "Cambiar la clave" : "Configurar la clave");
  if (clave === null) return;
  try {
    await ponerClave(estado.datos, clave);
  } catch (e) {
    mensaje(String(e.message || e), "malo", 10);
    return;
  }
  cambio();
  // Recién configurada, la sesión queda abierta: acaba de escribirla, no se
  // le pide de inmediato.
  abrir();
  const cuantas = pantallasConClave(estado.datos).length;
  mensaje(habia
    ? "La clave se cambió correctamente."
    : `Clave configurada. Desde ahora ${cuantas} pantallas la requieren; el registro de pedidos sigue disponible.`,
    "bien", 8);
  pintarClave(raiz, pantallas);
}

async function quitarla(raiz, pantallas) {
  const seguro = await confirmar({
    titulo: "Quitar la clave",
    mensaje:
      "Las pantallas de precios, platos, personas, empresas y ventas quedarán " +
      "disponibles para cualquier persona que use este computador.",
    siTexto: "Sí, quitarla", peligroso: true,
  });
  if (!seguro) return;
  quitarClave(estado.datos);
  cambio();
  cerrar();
  mensaje("Clave eliminada. Todas las pantallas quedan disponibles sin clave.", "bien", 6);
  pintarClave(raiz, pantallas);
}
