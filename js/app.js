// ============================================================================
//  app.js  -  El que prende todo y decide qué pantalla se ve.
//
//  Es a propósito el archivo más aburrido del proyecto. No hace cuentas ni
//  dibuja tablas: solo carga los datos al abrir, pinta el menú, y cuando
//  cambia la dirección (#cocina, #cobro...) llama a la pantalla que toca.
//
//  Lo único listo que tiene es la red de seguridad: si una pantalla se
//  revienta, no se queda la página en blanco. Se muestra qué pasó, en español,
//  y los datos siguen guardados.
// ============================================================================

import { el, vaciar, mensaje } from "./ui/componentes.js";
import { estado, alCambiar, sincronizarPeriodo, asegurarEmpresa, cambiarPeriodo } from "./ui/estado.js";
import { nombreMes } from "./nucleo/formato.js";
import * as almacen from "./datos/almacen.js";

import { pintarRegistrar } from "./ui/registrar.js";
import { pintarCocina, pintarResumenDia, pintarPorPersona, pintarCuadre } from "./ui/informes.js";
import { pintarCobro } from "./ui/cobro.js";
import { pintarCompartir } from "./ui/compartir.js";
import { pintarEmpresas, pintarCatalogo, pintarPersonas } from "./ui/mantenimiento.js";
import { pintarNombres } from "./ui/nombres.js";
import { pintarDatos } from "./ui/datos.js";
import { pintarAyuda } from "./ui/ayuda.js";
import { pintarErrores } from "./ui/errores.js";
import { cuantosSueltos } from "./nucleo/sueltos.js";
import { gruposParaRevisar, nombresSucios } from "./nucleo/nombres.js";
import { revisarTodo } from "./nucleo/calculos.js";

// ---------------------------------------------------------------------------
//  Las pantallas
//
//  "menu: true" quiere decir que sale arriba, en la barra verde.
//  Las demás viven dentro de Ajustes, para que la barra no se llene de cosas
//  que se usan una vez al mes.
// ---------------------------------------------------------------------------

const PANTALLAS = {
  registrar: { titulo: "Registrar el día", pintar: pintarRegistrar, menu: true },
  cocina:    { titulo: "Cocina",           pintar: pintarCocina,    menu: true },
  resumen:   { titulo: "Resumen del día",  pintar: pintarResumenDia, menu: true },
  persona:   { titulo: "Por persona",      pintar: pintarPorPersona, menu: true },
  cobro:     { titulo: "Cuenta de cobro",  pintar: pintarCobro,     menu: true },
  cuadre:    { titulo: "Cuadre",           pintar: pintarCuadre,    menu: true },
  compartir: { titulo: "Compartir",        pintar: pintarCompartir, menu: true },
  revisar:   { titulo: "Revisar",          pintar: pintarErrores,   menu: true,
               // El numerito rojo del menu: lo que esta esperando decision.
               contar: () => cuantosSueltos(estado.datos).total },
  ajustes:   { titulo: "Ajustes",          pintar: pintarAjustes,   menu: true },
  ayuda:     { titulo: "Cómo se usa",      pintar: pintarAyuda,     menu: true },

  personas:  { titulo: "Personas",         pintar: pintarPersonas },
  nombres:   { titulo: "Revisar nombres",  pintar: pintarNombres },
  catalogo:  { titulo: "Catálogo",         pintar: pintarCatalogo },
  empresas:  { titulo: "Empresas",         pintar: pintarEmpresas },
  datos:     { titulo: "Datos y respaldos", pintar: pintarDatos },
};

const INICIO = "registrar";

function pantallaActual() {
  const nombre = (location.hash || "").replace("#", "").trim();
  return PANTALLAS[nombre] ? nombre : INICIO;
}

// ---------------------------------------------------------------------------
//  Pintar
// ---------------------------------------------------------------------------

const raiz = () => document.getElementById("pantalla");

function pintar() {
  const cual = pantallaActual();
  const pantalla = PANTALLAS[cual];
  const donde = raiz();

  document.title = `${pantalla.titulo} — Arroz Paisa`;
  marcarMenu(cual);
  window.scrollTo(0, 0);

  try {
    // Hay pantallas que tardan (la de ayuda va a buscar el manual). Si esta
    // devuelve una promesa, hay que esperarla: si no, un error de adentro se
    // escaparía del try y dejaría la pantalla a medio pintar, sin avisar.
    const quizaPromesa = pantalla.pintar(donde);
    if (quizaPromesa && typeof quizaPromesa.catch === "function") {
      quizaPromesa.catch((error) => pantallaRota(donde, error));
    }
  } catch (error) {
    pantallaRota(donde, error);
  }
}

/**
 * La red de seguridad. Antes de esto, un error dejaba la página en blanco y
 * parecía que se hubieran perdido los datos.
 */
function pantallaRota(donde, error) {
  console.error(error);
  vaciar(donde);
  donde.append(
    el("section", { clase: "tarjeta con-problemas" },
      el("h1", { texto: "Se dañó esta pantalla" }),
      el("p", {},
        el("strong", { texto: "Sus datos están guardados y completos." }),
        " Lo que falló fue solo el dibujo de esta pantalla."),
      el("p", { texto: "Pruebe a entrar a otra pantalla del menú de arriba." }),
      el("details", {},
        el("summary", { texto: "Detalle para quien arregle la app" }),
        el("pre", { texto: String(error && error.stack || error) })),
      el("button", {
        clase: "principal",
        alHacerClic: () => { almacen.descargarRespaldo(estado.datos); },
      }, "Bajar un respaldo por si acaso")
    )
  );
}

function marcarMenu(cual) {
  for (const a of document.querySelectorAll(".menu a")) {
    const suyo = a.getAttribute("href").replace("#", "");
    if (suyo === cual) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

// ---------------------------------------------------------------------------
//  La pantalla de Ajustes: un centro con avisos de lo que hay pendiente
// ---------------------------------------------------------------------------

function pintarAjustes(donde) {
  vaciar(donde);

  const porRevisar = gruposParaRevisar(estado.datos).length;
  const sucios = nombresSucios(estado.datos).length;
  const problemas = revisarTodo(estado.datos).length;

  const tarjetas = [
    {
      href: "#personas",
      titulo: "Personas",
      texto: "Quién come en cada empresa y a quién se le cobra.",
      pendiente: null,
    },
    {
      href: "#nombres",
      titulo: "Revisar nombres",
      texto: "Juntar al mismo empleado que quedó anotado de dos formas.",
      pendiente: porRevisar + sucios > 0
        ? `${porRevisar + sucios} por revisar`
        : null,
    },
    {
      href: "#catalogo",
      titulo: "Catálogo",
      texto: "Los platos y cuánto vale cada uno en cada empresa.",
      pendiente: null,
    },
    {
      href: "#empresas",
      titulo: "Empresas",
      texto: "Los datos de cada empresa y hasta qué día va cada quincena.",
      pendiente: null,
    },
    {
      href: "#datos",
      titulo: "Datos y respaldos",
      texto: "Traer el Excel, bajar copias de seguridad y ver los renglones con problemas.",
      pendiente: problemas > 0 ? `${problemas} renglones con problemas` : null,
    },
  ];

  donde.append(
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Ajustes" }),
        el("p", { texto: "Las cosas que se tocan de vez en cuando." })
      )
    ),
    el("div", { clase: "rejilla-2 tarjetas-ajustes" },
      ...tarjetas.map((t) =>
        el("a", { clase: "tarjeta tarjeta-enlace", href: t.href },
          el("h2", { texto: t.titulo }),
          el("p", { texto: t.texto }),
          t.pendiente ? el("span", { clase: "etiqueta pendiente", texto: t.pendiente }) : null
        )
      )
    )
  );
}

// ---------------------------------------------------------------------------
//  La barra de arriba
// ---------------------------------------------------------------------------

function construirMenu() {
  const menu = document.getElementById("menu");
  vaciar(menu);
  for (const [nombre, p] of Object.entries(PANTALLAS)) {
    if (!p.menu) continue;
    menu.append(
      el("a", { href: "#" + nombre },
        p.titulo,
        p.contar ? el("span", { clase: "contador oculto" }) : null
      )
    );
  }
  refrescarContadores();
}

/**
 * Pone el numerito al lado de "Revisar". Se vuelve a calcular cada vez que
 * cambian los datos: si ella arregla el ultimo, el numerito tiene que
 * desaparecer solo, sin recargar la pagina.
 */
function refrescarContadores() {
  for (const [nombre, p] of Object.entries(PANTALLAS)) {
    if (!p.menu || !p.contar) continue;
    const enlace = document.querySelector(`.menu a[href="#${nombre}"]`);
    const globo = enlace && enlace.querySelector(".contador");
    if (!globo) continue;
    let cuantos = 0;
    try {
      cuantos = p.contar();
    } catch {
      cuantos = 0; // un contador roto no puede tumbar el menu
    }
    globo.textContent = String(cuantos);
    globo.classList.toggle("oculto", cuantos === 0);
  }
}

/**
 * El mes y el año que miran TODOS los informes.
 * Está arriba y siempre a la vista a propósito: el peor bug del Excel era que
 * la cuenta de cobro no filtraba por mes, y al llegar septiembre la quincena 1
 * sumaba agosto + septiembre y salía por el doble. Aquí el mes se ve siempre.
 */
function construirPeriodo() {
  const caja = document.getElementById("periodo");
  vaciar(caja);

  const meses = el("select", {
    "aria-label": "Mes de los informes",
    alCambiar: (ev) => { cambiarPeriodo(estado.anio, Number(ev.target.value)); pintar(); },
  }, ...Array.from({ length: 12 }, (_, i) =>
    el("option", { value: i + 1, selected: i + 1 === estado.mes }, nombreMes(i + 1))));

  const ahora = new Date().getFullYear();
  const anios = el("select", {
    "aria-label": "Año de los informes",
    alCambiar: (ev) => { cambiarPeriodo(Number(ev.target.value), estado.mes); pintar(); },
  }, ...Array.from({ length: 7 }, (_, i) => ahora - 3 + i).map((a) =>
    el("option", { value: a, selected: a === estado.anio }, String(a))));

  caja.append(
    el("span", { clase: "solo-lectores", texto: "Mes que se está mirando" }),
    meses, anios
  );
}

/**
 * El semáforo: "Guardado" en verde, "Guardando" en amarillo, los problemas en rojo.
 *
 * Ojo con el arranque: al abrir no se guarda nada, asi que si solo escuchara
 * los avisos de guardado, la lucecita se quedaria diciendo "Abriendo..." para
 * siempre. Y una lucecita que nunca cambia no tranquiliza a nadie: parece que
 * la app se quedo colgada. Por eso hay un estado de reposo explicito.
 */
function enReposo(hayDatos) {
  const luz = document.getElementById("guardado");
  if (!luz) return;
  luz.dataset.estado = "bien";
  luz.textContent = !hayDatos
    ? "Sin datos todavía"
    : (almacen.hayCarpeta() ? "Guardado en la carpeta" : "Guardado");
}

function semaforoDeGuardado() {
  const luz = document.getElementById("guardado");

  almacen.alGuardar((info) => {
    if (info.estado === "guardando") {
      luz.dataset.estado = "guardando";
      luz.textContent = "Guardando...";
    } else if (info.estado === "problema") {
      luz.dataset.estado = "problema";
      luz.textContent = "No se pudo guardar";
      luz.title = info.detalle || "";
      mensaje(info.detalle || "No se pudo guardar. Baje un respaldo.", "malo", 12);
    } else {
      luz.dataset.estado = "bien";
      luz.textContent = almacen.hayCarpeta() ? "Guardado en la carpeta" : "Guardado";
      luz.title = "";
    }
  });
}

// ---------------------------------------------------------------------------
//  Arrancar
// ---------------------------------------------------------------------------

async function arrancar() {
  construirMenu();
  semaforoDeGuardado();

  let cargado;
  try {
    cargado = await almacen.cargar();
  } catch (error) {
    console.error(error);
    cargado = { datos: null, origen: "dañado", problemas: [String(error.message || error)] };
  }

  if (cargado.origen === "dañado") {
    estado.datos = cargado.datos || estado.datos;
    mensaje(
      "Los datos guardados no se pudieron leer. No se borró nada: entre a " +
      "Datos y respaldos y devuelva el último respaldo.",
      "malo", 20
    );
  } else if (cargado.datos) {
    estado.datos = cargado.datos;
  }

  // Primera vez y sin nada guardado: si al lado hay unos datos iniciales,
  // se cargan solos. Así no abre vacía.
  let vinoDeSemilla = false;
  if (cargado.origen === "nuevo") {
    const semilla = await almacen.semillaInicial();
    if (semilla) {
      estado.datos = semilla;
      almacen.guardar(semilla);
      vinoDeSemilla = true;
    }
  }

  sincronizarPeriodo();
  asegurarEmpresa();
  construirPeriodo();

  // Cuando cambian los datos, el mes de la barra puede haber cambiado también.
  alCambiar(() => { construirPeriodo(); refrescarContadores(); });

  // Primera vez y de verdad vacía: la mandamos derecho a traer el Excel.
  const vacia = !estado.datos.consumos.length && !estado.datos.empresas.length;
  if (vacia && !location.hash) {
    location.hash = "#datos";
    mensaje("Bienvenida. Empiece trayendo el Excel.", "bien", 10);
  } else if (vinoDeSemilla) {
    mensaje(
      `Listo: ${estado.datos.consumos.length} renglones de ` +
      `${nombreMes(estado.mes)}. Si algo no cuadra, en Ajustes puede volver a ` +
      "traer el Excel.",
      "bien", 8
    );
  }

  window.addEventListener("hashchange", pintar);
  pintar();
  enReposo(estado.datos.consumos.length > 0);

  // Al cerrar la ventana, guardamos de una sin esperar el medio segundo.
  window.addEventListener("beforeunload", () => { almacen.guardarYa(); });
  // En el celular, "cerrar" muchas veces es solo cambiar de app.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") almacen.guardarYa();
  });

  if (cargado.origen === "carpeta") {
    mensaje("Datos cargados de la carpeta del computador.", "bien", 5);
  }
  // Ojo con el nombre exacto: almacen.js devuelve "necesita-permiso".
  if (cargado.carpeta && cargado.carpeta.estado === "necesita-permiso") {
    mensaje(
      "La carpeta de respaldo está conectada pero el navegador pide permiso " +
      "otra vez. Entre a Datos y respaldos para volverla a conectar.",
      "ojo", 12
    );
  }
  // Si el navegador no dejó leer sus datos, hay que decirlo. Callarlo sería
  // dejarla trabajar todo el día creyendo que se está guardando.
  if (cargado.problemaDelNavegador) {
    mensaje(
      "Cuidado: " + cargado.problemaDelNavegador +
      " Mientras tanto, baje un respaldo desde Datos y respaldos.",
      "malo", 20
    );
  }
}

// Si algo se revienta al arrancar, hay que decirlo. Una pantalla en blanco es
// lo peor que le puede pasar a alguien que no sabe qué hacer con eso.
arrancar().catch((error) => {
  console.error(error);
  const donde = raiz();
  if (!donde) return;
  vaciar(donde);
  donde.append(
    el("section", { clase: "tarjeta con-problemas" },
      el("h1", { texto: "La app no pudo arrancar" }),
      el("p", { texto: "Sus datos no se tocaron. Pruebe a cerrar y volver a abrir." }),
      el("details", {},
        el("summary", { texto: "Detalle para quien arregle la app" }),
        el("pre", { texto: String(error && error.stack || error) }))
    )
  );
});
