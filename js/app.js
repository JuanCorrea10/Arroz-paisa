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

import { el, vaciar, mensaje, poner } from "./ui/componentes.js";
import { estado, alCambiar, sincronizarPeriodo, asegurarEmpresa, cambiarPeriodo } from "./ui/estado.js";
import { nombreMes } from "./nucleo/formato.js";
import * as almacen from "./datos/almacen.js";

import { pintarRegistrar } from "./ui/registrar.js";
import { pintarCocina, pintarResumenDia, pintarPorPersona, pintarCuadre } from "./ui/informes.js";
import { pintarCobro } from "./ui/cobro.js";
import { pintarInicio } from "./ui/inicio.js";
import { pintarCompras, pintarPagos } from "./ui/proveedores.js";
import { pintarVentas } from "./ui/ventas.js";
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
// ---------------------------------------------------------------------------

//  "dice" es qué hace la pantalla, en una línea y en sus palabras. Sale en la
//  portada. El menú de arriba solo tiene el nombre, y un nombre suelto
//  ("Cuadre", "Compartir") no dice para qué sirve: hay que abrirlo a ver.
//  "barra" = sale en el menú de arriba. "dice" = qué hace, para la portada.
//
//  En la barra va SOLO lo que tiene ritmo: lo de todos los días y lo de cada
//  quincena. Todo lo demás -- las listas, los respaldos, el manual -- vive en
//  la portada, que para eso está.
//
//  Llegó a haber DIECISIETE pestañas. Una barra de diecisiete palabras, para
//  alguien que no explora, es una barra donde no se encuentra nada: se lee de
//  corrido buscando la que suene y se entra a la primera que se parezca.
const PANTALLAS = {
  inicio:    { titulo: "Inicio",           barra: true,
               dice: "Todo lo que hace la app",
               pintar: (raiz) => pintarInicio(raiz, MUNDOS, DE_LOS_DOS, PANTALLAS) },

  // --- Almuerzos -----------------------------------------------------------
  registrar: { titulo: "Registrar el día", pintar: pintarRegistrar, barra: true,
               dice: "Anotar lo que pidió cada persona" },
  cocina:    { titulo: "Cocina",           pintar: pintarCocina,    barra: true,
               dice: "Cuánto hay que preparar hoy" },
  resumen:   { titulo: "Resumen del día",  pintar: pintarResumenDia, barra: true,
               dice: "Cómo fue el día y qué se le manda a cada empresa" },
  persona:   { titulo: "Por persona",      pintar: pintarPorPersona, barra: true,
               dice: "Cuánto lleva cada persona" },
  cobro:     { titulo: "Cuenta de cobro",  pintar: pintarCobro,     barra: true,
               dice: "La cuenta de la quincena para cada empresa" },
  ventas:    { titulo: "Cuánto vendí",     pintar: pintarVentas,    barra: true,
               dice: "Cuántos platos salieron y cuánta plata entró" },

  // Revisar sale en la barra SOLO cuando hay algo que revisar.
  //
  // Es una alerta, no una sección: una pestaña que dice "Revisar" y al entrar
  // no hay nada es una pestaña que se aprende a ignorar -- y el día que sí
  // haya algo, tampoco se mira. Cuando hay, aparece con su numerito rojo.
  revisar:   { titulo: "Revisar",          pintar: pintarErrores,
               barra: () => cuantosSueltos(estado.datos).total > 0,
               dice: "Lo que quedó raro y hay que arreglar",
               contar: () => cuantosSueltos(estado.datos).total },

  cuadre:    { titulo: "Cuadre",           pintar: pintarCuadre,
               dice: "Cuadrar las facturas del día con lo que le dicen" },
  compartir: { titulo: "Compartir",        pintar: pintarCompartir,
               dice: "Mandarle a una empresa lo suyo" },

  // --- Proveedores ---------------------------------------------------------
  compras:   { titulo: "Facturas",         pintar: pintarCompras,   barra: true,
               dice: "Anotar la factura que trajo el proveedor" },
  pagos:     { titulo: "Pago semanal",     pintar: pintarPagos,     barra: true,
               dice: "Cuánto hay que girarle a cada proveedor esta semana" },

  // --- Las listas y la app: solo en la portada -----------------------------
  personas:  { titulo: "Personas",         pintar: pintarPersonas,
               dice: "La gente de cada empresa" },
  nombres:   { titulo: "Revisar nombres",  pintar: pintarNombres,
               dice: "Juntar al mismo empleado anotado de dos formas",
               contar: () => gruposParaRevisar(estado.datos).length +
                             nombresSucios(estado.datos).length },
  catalogo:  { titulo: "Catálogo",         pintar: pintarCatalogo,
               dice: "Los platos y cuánto vale cada uno" },
  empresas:  { titulo: "Empresas",         pintar: pintarEmpresas,
               dice: "A quiénes se les vende y cómo corta la quincena" },
  datos:     { titulo: "Datos y respaldos", pintar: pintarDatos,
               dice: "Respaldos, la carpeta y traer el Excel",
               contar: () => revisarTodo(estado.datos).length },
  ayuda:     { titulo: "Cómo se usa",      pintar: pintarAyuda,
               dice: "El manual, por si se le olvida algo" },
};

/**
 * Los dos MUNDOS del negocio.
 *
 *   Almuerzos    lo que se VENDE: a quién se le vendió y quién nos debe.
 *   Proveedores  lo que se COMPRA: a quién le compramos y a quién le debemos.
 *
 *  Son negocios al revés uno del otro y casi no comparten datos: los empleados
 *  de las fábricas no son proveedores, un almuerzo no es un tocino, y las
 *  empresas clientes no son las sedes del restaurante. Lo único que comparten
 *  es la señora, el día y la plata -- y por eso van en la MISMA app y no en dos
 *  sitios distintos: dos sitios serían dos respaldos, dos versiones y dos
 *  carpetas, y ella tendría que acordarse de en cuál está. Además el día que
 *  quiera saber "cuánto entró contra cuánto salió", los datos tienen que estar
 *  juntos.
 *
 *  El menú de arriba muestra SOLO el mundo en el que está parada. Así vuelve a
 *  ser corto, que era el problema: con todo junto iba por doce entradas y
 *  camino a veinte.
 */
const MUNDOS = [
  {
    id: "almuerzos",
    nombre: "Almuerzos",
    dice: "Lo que le vende a las fábricas: anotar los pedidos, las cuentas de cobro y cuánto vendió.",
    grupos: [
      {
        nombre: "El día a día",
        explica: "Lo de todas las mañanas",
        pantallas: ["registrar", "cocina", "resumen"],
      },
      {
        nombre: "La plata",
        explica: "Lo que se cobra y lo que entra",
        pantallas: ["cobro", "ventas", "persona", "cuadre", "compartir"],
      },
      {
        nombre: "Las listas",
        explica: "La gente, los platos y las empresas",
        pantallas: ["personas", "catalogo", "empresas", "revisar", "nombres"],
      },
    ],
  },
  {
    id: "proveedores",
    nombre: "Proveedores",
    dice: "Lo que le compra a los proveedores: las facturas que entran y cuánto hay que pagarles cada semana.",
    grupos: [
      {
        nombre: "Las compras",
        explica: "Las facturas que traen los proveedores",
        pantallas: ["compras", "pagos"],
      },
    ],
  },
];

// Lo que no es de ningún mundo: sirve para los dos y sale abajo en la portada.
const DE_LOS_DOS = {
  nombre: "La app",
  explica: "Respaldos y ayuda",
  pantallas: ["datos", "ayuda"],
};

/** En qué mundo está una pantalla. El de almuerzos es el de siempre. */
function mundoDe(cual) {
  for (const m of MUNDOS) {
    if (m.grupos.some((g) => g.pantallas.includes(cual))) return m;
  }
  return null;
}

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
  construirMenu(cual);
  marcarMenu(cual);
  // Instantáneo a propósito: con scroll-behavior suave en toda la página,
  // cambiar de pantalla se volvería una animación de subida cada vez, y eso
  // se usa diez veces al día. Lo suave es para lo que hace la persona.
  window.scrollTo({ top: 0, behavior: "instant" });

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
  poner(donde,
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
  let activa = null;
  for (const a of document.querySelectorAll(".menu a")) {
    const suyo = a.getAttribute("href").replace("#", "");
    if (suyo === cual) { a.setAttribute("aria-current", "page"); activa = a; }
    else a.removeAttribute("aria-current");
  }
  moverIndicador(activa);
}

/**
 * La barrita de abajo se DESLIZA de una pestaña a otra, en vez de apagarse
 * en una y prenderse en otra. Eso hace que el ojo siga el movimiento y sepa
 * de dónde vino, que es lo que uno quiere de un menú.
 *
 * Se mueve con transform y se estira con scaleX, nunca cambiando "left" ni
 * "width": esas dos obligan al navegador a recalcular el tamaño de todo en
 * cada cuadro, y ahí es donde las animaciones se ponen a tirones.
 */
function moverIndicador(enlace) {
  const barrita = document.getElementById("indicador-nav");
  if (!barrita) return;
  if (!enlace) { barrita.style.opacity = "0"; return; }

  const menu = enlace.parentElement;
  const izquierda = enlace.offsetLeft - menu.scrollLeft;
  const ancho = enlace.offsetWidth;

  barrita.style.opacity = "1";
  barrita.style.transform = `translateX(${izquierda}px) scaleX(${ancho})`;
}

// ---------------------------------------------------------------------------
//  La barra de arriba
// ---------------------------------------------------------------------------

/**
 * El menú de arriba: SOLO el mundo en el que está parada.
 *
 * Antes salían todas las pantallas juntas y ya iba por doce entradas, camino a
 * veinte cuando entraran las compras. Un menú de veinte palabras, para alguien
 * que no explora, es un menú donde no se encuentra nada.
 *
 * Se vuelve a armar en cada pintada porque el mundo cambia al cambiar de
 * pantalla. "Inicio" va siempre, que es la puerta para pasar de un mundo a
 * otro; si no estuviera, entrar a Proveedores sería un camino sin regreso.
 */
function construirMenu(cual) {
  const menu = document.getElementById("menu");
  vaciar(menu);

  const mundo = mundoDe(cual);
  const suyas = mundo ? mundo.grupos.flatMap((g) => g.pantallas) : [];
  const visibles = ["inicio", ...suyas, ...DE_LOS_DOS.pantallas];

  for (const nombre of visibles) {
    const p = PANTALLAS[nombre];
    if (!p) continue;
    // "barra" puede ser una función: así Revisar solo aparece cuando de
    // verdad hay algo que revisar.
    let vaEnLaBarra = typeof p.barra === "function" ? p.barra() : p.barra === true;
    // La pantalla en la que está parada SIEMPRE sale, aunque no sea de barra.
    // Si no, al entrar a Personas desde la portada el menú no la marcaría por
    // ningún lado y ella no sabría dónde está.
    if (nombre === cual) vaEnLaBarra = true;
    if (!vaEnLaBarra) continue;
    menu.append(
      el("a", { href: "#" + nombre },
        p.titulo,
        p.contar ? el("span", { clase: "contador oculto" }) : null
      )
    );
  }

  // El indicador se crea AQUI y no en el HTML, porque esta funcion vacia el
  // menu cada vez que corre: si estuviera en el HTML, lo borraria y el
  // indicador desapareceria para siempre. (Paso, y por eso esta escrito.)
  menu.append(el("span", { clase: "indicador-nav", id: "indicador-nav", "aria-hidden": "true" }));

  refrescarContadores();
}

/**
 * Pone el numerito al lado de "Revisar". Se vuelve a calcular cada vez que
 * cambian los datos: si ella arregla el ultimo, el numerito tiene que
 * desaparecer solo, sin recargar la pagina.
 */
function refrescarContadores() {
  for (const [nombre, p] of Object.entries(PANTALLAS)) {
    if (!p.contar) continue;
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

  poner(caja,
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

/**
 * ¿Le llego a este navegador una mezcla de versiones?
 *
 * GitHub guarda cada archivo 10 minutos por su cuenta. Justo despues de
 * publicar, un navegador puede quedarse con el HTML nuevo y el CSS viejo. Y
 * eso no se ve "desactualizado": se ve ROTO, con las cajas donde no van.
 *
 * Aqui se compara la version que dice el HTML contra la que dice el CSS. Si
 * no coinciden, se avisa y se ofrece recargar, en vez de dejarla mirando una
 * pantalla descuadrada sin saber que paso.
 */
function revisarLaVersion() {
  const meta = document.querySelector('meta[name="version"]');
  if (!meta) return;
  const delHtml = meta.content.trim();

  const delCss = getComputedStyle(document.documentElement)
    .getPropertyValue("--version").trim().replace(/^"|"$/g, "");

  if (!delCss || delCss === delHtml) return;

  const barra = el("div", { clase: "aviso-version" },
    el("span", {},
      el("strong", { texto: "Hay una versión nueva a medias. " }),
      "La página puede verse descuadrada hasta que se recargue."),
    el("button", {
      clase: "principal chico",
      alHacerClic: () => location.reload(),
    }, "Recargar ahora")
  );
  document.body.prepend(barra);
  console.warn(`Versiones distintas: el HTML dice ${delHtml} y el CSS dice ${delCss}`);
}

/**
 * El header se encoge y saca sombra cuando la página deja de estar arriba.
 *
 * Se vigila un centinela invisible en vez de escuchar el scroll: el scroll
 * avisa cientos de veces por segundo y esto solo avisa cuando de verdad
 * cambió algo. Menos trabajo, y no se pone a tirones al deslizar.
 */
function headerQueSeEncoge() {
  const centinela = document.getElementById("tope-pagina");
  const barra = document.querySelector(".barra");
  if (!centinela || !barra || typeof IntersectionObserver !== "function") return;

  // Ojo con el "threshold". Al principio le puse 1, o sea "avisame cuando el
  // centinela se vea COMPLETO". Con un centinela de 1 px pegado al borde de
  // arriba, el navegador a veces lo calcula como 0.99 por redondeo, y la
  // barra salia encogida estando en el tope de la pagina.
  //
  // Con 0 la pregunta es otra y no tiene esa fragilidad: "avisame cuando no
  // se vea NADA de el". Y el centinela mide 8 px para que la respuesta no
  // dependa de un pixel.
  new IntersectionObserver(
    ([entrada]) => barra.classList.toggle("encogida", !entrada.isIntersecting),
    { threshold: 0 }
  ).observe(centinela);
}

/**
 * La red que faltaba.
 *
 * pintarPantalla() ya atrapaba lo que se dañara al ENTRAR a una pantalla. Pero
 * las pantallas se vuelven a pintar solas cada vez que ella toca algo -- elegir
 * una persona, agregar un plato -- y ESE repintado no lo atrapaba nadie: si se
 * caía, la pantalla se quedaba a medias, sin un solo aviso, y el error solo
 * aparecía en una consola que ella nunca va a abrir.
 *
 * Fue exactamente lo que pasó: un plato sin nombre en el catálogo tumbaba el
 * repintado al elegir a la persona, y desde afuera se veía como si la app
 * simplemente no hiciera nada.
 *
 * Aquí no se arregla el error -- eso se arregla donde toque --, pero deja de
 * ser invisible, que es la regla que manda en esta app.
 */
function nadaFallaCallado() {
  let yaAvise = false;
  const avisar = (error) => {
    console.error(error);
    if (yaAvise) return;
    yaAvise = true;
    setTimeout(() => { yaAvise = false; }, 4000);
    mensaje(
      "Algo se dañó al dibujar la pantalla y quedó a medias. Sus datos están " +
      "guardados. Recargue la página (Ctrl + Shift + R) y, si vuelve a pasar, " +
      "avísele a Juan: " + String((error && error.message) || error),
      "malo", 20
    );
  };
  window.addEventListener("error", (e) => avisar(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => avisar(e.reason));
}

async function arrancar() {
  nadaFallaCallado();
  revisarLaVersion();
  construirMenu(pantallaActual());
  headerQueSeEncoge();
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
      `${nombreMes(estado.mes)}. Si algo no cuadra, en "Datos y respaldos" ` +
      "puede volver a traer el Excel.",
      "bien", 8
    );
  }

  // El logo para los PDF, en segundo plano. No se espera: si tarda, la app
  // arranca igual y el primer PDF sale sin logo, que es preferible a hacerla
  // esperar por una imagen.
  import("./exportar/pdf.js").then((m) => m.prepararLogo()).catch(() => {});

  // Lo que se boto al cargar. Se dice, no se calla: es el catalogo de ella.
  const basura = estado.datos.sinNombre || { productos: 0, personas: 0 };
  if (basura.productos || basura.personas) {
    const partes = [];
    if (basura.productos) partes.push(`${basura.productos} plato(s)`);
    if (basura.personas) partes.push(`${basura.personas} persona(s)`);
    mensaje(
      `Había ${partes.join(" y ")} guardados sin nombre y se quitaron. ` +
      "No se perdió ningún pedido: los pedidos guardan el nombre aparte.",
      "ojo", 12
    );
  }

  window.addEventListener("hashchange", pintar);
  // Si cambia el tamaño de la ventana, la pestaña activa se movió de sitio.
  window.addEventListener("resize", () => marcarMenu(pantallaActual()));
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
      "La carpeta de respaldo está ahí, pero el navegador pide permiso otra vez, " +
      "así que por ahora no se está guardando en ella. Entre a Datos y respaldos " +
      "y toque “Volver a conectarla”.",
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
  poner(donde,
    el("section", { clase: "tarjeta con-problemas" },
      el("h1", { texto: "La app no pudo arrancar" }),
      el("p", { texto: "Sus datos no se tocaron. Pruebe a cerrar y volver a abrir." }),
      el("details", {},
        el("summary", { texto: "Detalle para quien arregle la app" }),
        el("pre", { texto: String(error && error.stack || error) }))
    )
  );
});
