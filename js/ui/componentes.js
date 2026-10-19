// ============================================================================
//  componentes.js  -  Los ladrillos con los que se arman todas las pantallas.
// ============================================================================

import { coincide, pesos, paraBuscar } from "../nucleo/formato.js";
import { distancia } from "../nucleo/nombres.js";

/**
 * Crea un elemento. Es la función más usada de todo el proyecto.
 *
 *   el("button", { clase: "principal", alHacerClic: guardar }, "Guardar")
 *
 * Usa "clase" y no "class" porque class es palabra reservada de JavaScript.
 */
export function el(etiqueta, props = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [llave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (llave === "clase") nodo.className = valor;
    else if (llave === "texto") nodo.textContent = valor;
    else if (llave === "html") nodo.innerHTML = valor;
    else if (llave === "alHacerClic") nodo.addEventListener("click", valor);
    else if (llave === "alCambiar") nodo.addEventListener("change", valor);
    else if (llave === "alEscribir") nodo.addEventListener("input", valor);
    else if (llave === "alTeclear") nodo.addEventListener("keydown", valor);
    else if (llave === "datos") for (const [k, v] of Object.entries(valor)) nodo.dataset[k] = v;
    else if (llave === "estilo") nodo.setAttribute("style", valor);
    else if (llave in nodo && typeof nodo[llave] !== "object") nodo[llave] = valor;
    else nodo.setAttribute(llave, valor);
  }
  for (const hijo of hijos.flat(3)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

/**
 * Mete hijos en un nodo, saltandose los que no existen.
 *
 * Hace falta porque el append del navegador NO ignora un null: lo convierte
 * en el texto "null" y lo pinta. Asi salio un "null" suelto arriba de la
 * pantalla de registrar, porque la tarjeta de "los mismos de ayer" devuelve
 * null cuando no hay nada que mostrar.
 *
 * el() ya filtraba bien; el descuido estaba en los append directos. Por eso
 * el arreglo va aqui y no en cada pantalla: los arreglos repartidos se
 * olvidan en el siguiente sitio donde haga falta.
 */
export function poner(nodo, ...hijos) {
  for (const hijo of hijos.flat(3)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  return nodo;
}

// ---------------------------------------------------------------------------
//  Mensajitos de esquina
// ---------------------------------------------------------------------------

/** Cuantos mensajes se dejan a la vez. Mas que esto tapan la pantalla. */
const MAXIMO_MENSAJES = 3;

export function mensaje(texto, tipo = "bien", segundos = 4) {
  const caja = document.getElementById("mensajes");
  if (!caja) return;

  const irse = (m) => {
    if (!m.isConnected || m.dataset.yendose) return;
    m.dataset.yendose = "si";
    m.style.transition = "opacity .25s, transform .25s";
    m.style.opacity = "0";
    m.style.transform = "translateY(8px)";
    setTimeout(() => m.remove(), 280);
  };

  const m = el("div", {
    clase: `mensaje ${tipo}`,
    role: "status",
    texto,
    title: "Toque para quitarlo",
    // Se pueden quitar tocandolos. Suena a detalle, pero un aviso largo
    // encima de la tabla justo cuando ella esta leyendo un numero es de las
    // cosas que mas molestan, y hasta ahora no habia forma de correrlo.
    alHacerClic: () => irse(m),
  });
  poner(caja, m);

  // Si se acumulan, los mas viejos se van. Lo ultimo que paso es lo que
  // importa; lo de hace diez segundos ya no.
  //
  // OJO: irse() quita el nodo 280 ms DESPUES (deja salir la animacion), asi
  // que no se puede mirar children.length en un while: nunca baja. Era un
  // bucle infinito y congelaba la app ENTERA al cuarto aviso seguido -- sin
  // error, sin nada: la pagina simplemente dejaba de responder. Lo destapo
  // la prueba de la app entera, que saca cuatro avisos en dos segundos.
  const vivos = [...caja.children].filter((n) => !n.dataset.yendose);
  for (const viejo of vivos.slice(0, Math.max(0, vivos.length - MAXIMO_MENSAJES))) irse(viejo);

  setTimeout(() => irse(m), segundos * 1000);
}

// ---------------------------------------------------------------------------
//  Ventanas
// ---------------------------------------------------------------------------

/** Una ventana con título, contenido y botones. Devuelve la ventana abierta. */
export function ventana({ titulo, cuerpo, botones = [], alCerrar }) {
  const dialogo = el("dialog");
  const pie = el("div", { clase: "ventana-pie" });
  for (const b of botones) {
    pie.append(
      el("button", {
        clase: b.clase || "",
        type: "button",
        alHacerClic: () => {
          const seguir = b.alHacerClic ? b.alHacerClic(dialogo) : true;
          if (seguir !== false) cerrar();
        },
      }, b.texto)
    );
  }
  // El pie va FUERA del cuerpo, no adentro.
  //
  // Estaba adentro, y el cuerpo es el que scrollea: en una ventana larga --
  // el historial de alguien que lleva medio año comiendo -- el botón de
  // "Cerrar" quedaba al final de diecisiete días de comidas. Para cerrar la
  // ventana había que recorrerla entera. Ahora el cuerpo se mueve y el pie se
  // queda quieto abajo, siempre a la vista.
  //
  // Y además una "×" arriba a la derecha, que es donde todo el mundo la busca.
  // Escape también cierra, pero eso hay que saberlo; la × se ve.
  const equis = el("button", {
    clase: "cerrar-x",
    type: "button",
    "aria-label": "Cerrar",
    title: "Cerrar",
    alHacerClic: () => cerrar(),
  }, "×");

  const contenido = el("div", { clase: "ventana-cuerpo" },
    el("h3", { texto: titulo }),
    cuerpo
  );
  dialogo.append(equis, contenido, botones.length ? pie : null);
  document.body.append(dialogo);

  function cerrar() {
    // Se deja salir la animacion antes de quitarla del todo. Si se borrara
    // de una, la ventana desapareceria de golpe y se sentiria brusco.
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rematar = () => {
      dialogo.close();
      dialogo.remove();
      if (alCerrar) alCerrar();
    };
    if (sinMovimiento) return rematar();
    dialogo.classList.add("cerrando");
    setTimeout(rematar, 150);
  }
  dialogo.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
  // Se busca dentro del CUERPO y no en la ventana entera: si no, el foco se lo
  // llevaría la × y un formulario dejaría de abrir con el cursor en su primera
  // casilla, que es lo que hace que se pueda llenar escribiendo de una.
  // Un botón con "foco: true" se gana el cursor: es el que se quiere con
  // Enter. Sin esto, en "Lo que se reconoció del pedido" el cursor caía en
  // Cancelar y Enter cerraba la ventana sin anotar nada.
  const conFoco = botones.findIndex((b) => b.foco);
  const primero = (conFoco >= 0 ? pie.children[conFoco] : null)
    || contenido.querySelector("input, select, textarea, button")
    || pie.querySelector("button");
  if (primero) {
    setTimeout(() => {
      // El preventScroll y el scrollTop van juntos, y hacen falta los dos.
      //
      // Al enfocar, el navegador arrastra el cuerpo para dejar el foco a la
      // vista. En una ventana larga -- el historial de alguien que lleva medio
      // ano comiendo -- lo unico enfocable es el boton de "Cerrar", que esta
      // al final: la ventana abria por la mitad, sin titulo ni totales, y
      // parecia que faltaba algo.
      primero.focus({ preventScroll: true });
      contenido.scrollTop = 0;
    }, 30);
  }
  return { dialogo, cerrar };
}

/** Pregunta sí o no. Devuelve una promesa con true o false. */
/** Dos saltos de linea seguidos: asi se parte un mensaje en parrafos. */
export const SALTO = "\n\n";

export function confirmar({ titulo, mensaje: texto, siTexto = "Sí, hacerlo", noTexto = "Cancelar", peligroso = false }) {
  return new Promise((resolver) => {
    let respuesta = false;
    ventana({
      titulo,
      // Un renglón en blanco parte el mensaje en dos párrafos.
      //
      // Antes todo iba en un solo <p>, así que un aviso de dos ideas -- "esto
      // hace tal cosa" y "si quería la otra, haga esto" -- salía como un
      // ladrillo de texto que ella no iba a leer. Los mensajes de una sola
      // idea no llevan renglón en blanco y siguen saliendo igual que siempre.
      cuerpo: el("div", {},
        ...String(texto).split(SALTO).map((parrafo) => el("p", { texto: parrafo }))),
      botones: [
        { texto: noTexto, alHacerClic: () => { respuesta = false; } },
        { texto: siTexto, clase: peligroso ? "peligro" : "principal", alHacerClic: () => { respuesta = true; } },
      ],
      alCerrar: () => resolver(respuesta),
    });
  });
}

/**
 * Un formulario en una ventana.
 * campos = [{ nombre, etiqueta, tipo, valor, opciones, requerido, ayuda }]
 * Devuelve una promesa con { nombre: valor } o null si canceló.
 */
export function pedirDatos({ titulo, campos, textoAceptar = "Guardar" }) {
  return new Promise((resolver) => {
    const nodos = {};
    const errorGeneral = el("p", { clase: "nota malo oculto" });
    const cuerpo = el("div", { clase: "rejilla" }, errorGeneral);

    for (const c of campos) {
      let entrada;
      if (c.tipo === "seleccion") {
        entrada = el("select", {},
          ...(c.opciones || []).map((o) =>
            el("option", { value: o.valor, selected: String(o.valor) === String(c.valor ?? "") }, o.texto)
          )
        );
      } else if (c.tipo === "casilla") {
        entrada = el("input", { type: "checkbox", checked: c.valor !== false, estilo: "width:auto;min-height:auto" });
      } else {
        entrada = el("input", { type: c.tipo || "text", value: c.valor ?? "" });
        if (c.tipo === "number") { entrada.min = c.min ?? 0; entrada.step = c.step ?? 1; }
      }
      entrada.id = "campo-" + c.nombre;
      nodos[c.nombre] = entrada;
      // La casilla de chulito va AL LADO de su rótulo, no debajo: debajo
      // quedaba sola en la mitad de la ventana y no se sabía de qué era.
      cuerpo.append(
        c.tipo === "casilla"
          ? el("div", { clase: "campo" },
              el("label", { clase: "casilla-ver", for: entrada.id }, entrada, " ", c.etiqueta),
              c.ayuda ? el("small", { estilo: "color:var(--tinta-suave)", texto: c.ayuda }) : null)
          : el("div", { clase: "campo" },
              el("label", { for: entrada.id, texto: c.etiqueta }),
              entrada,
              c.ayuda ? el("small", { estilo: "color:var(--tinta-suave)", texto: c.ayuda }) : null)
      );
    }

    let resultado = null;
    const { cerrar } = ventana({
      titulo,
      cuerpo,
      botones: [
        { texto: "Cancelar", alHacerClic: () => { resultado = null; } },
        {
          texto: textoAceptar,
          clase: "principal",
          alHacerClic: () => {
            const valores = {};
            let malo = null;
            for (const c of campos) {
              const nodo = nodos[c.nombre];
              const v = c.tipo === "casilla" ? nodo.checked : nodo.value.trim();
              if (c.requerido && (v === "" || v === null)) {
                malo = malo || `Falta llenar "${c.etiqueta}".`;
                nodo.setAttribute("aria-invalid", "true");
              } else {
                nodo.removeAttribute("aria-invalid");
              }
              valores[c.nombre] = v;
            }
            if (malo) {
              errorGeneral.textContent = malo;
              errorGeneral.classList.remove("oculto");
              return false; // no cerrar
            }
            resultado = valores;
          },
        },
      ],
      alCerrar: () => resolver(resultado),
    });
    // Enter dentro de un campo = aceptar.
    cuerpo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        // El pie va FUERA del cuerpo de la ventana (para que no se pierda al
        // bajar), así que se busca en la ventana entera. Con
        // cuerpo.parentElement no se encontraba, y Enter reventaba con
        // "Algo se dañó" en vez de crear a la persona.
        const aceptar = cuerpo.closest("dialog")?.querySelector(".ventana-pie button:last-child");
        if (aceptar) aceptar.click();
      }
    });
    void cerrar;
  });
}

// ---------------------------------------------------------------------------
//  El buscador con lista
//
//  Es el componente más importante de la app: es como se eligen las personas
//  (hasta 217 en una empresa) y los platos (75). Reglas:
//   - solo se puede elegir de la lista, nunca escribir libre;
//   - se filtra escribiendo, sin importar tildes;
//   - si lo que escribió no existe, ofrece crearlo ahí mismo;
//   - funciona con el teclado (flechas y Enter) y con el dedo.
// ---------------------------------------------------------------------------

/**
 * Separa una cantidad escrita adelante: "3 almuerzo" -> { cuantos: 3, resto: "almuerzo" }
 *
 * Existe porque ella transcribe de un audio donde le van dictando. Oye "tres
 * almuerzos" y lo natural es escribir "3 almuerzo", no buscar el plato y
 * despues darle tres veces al mas.
 *
 * Aguanta "3 almuerzo", "3almuerzo" y "3x almuerzo". Si no hay numero
 * adelante, devuelve 1 y el texto tal cual: no se pierde nada.
 */
export function separarCantidad(texto) {
  const m = String(texto || "").match(/^\s*(\d{1,3})\s*[xX*]?\s+?(.*)$/);
  if (!m) return { cuantos: 1, resto: String(texto || "") };
  const cuantos = Number(m[1]);
  const resto = m[2].trim();
  // "12" solo no es "12 de algo": es alguien buscando un plato con numeros.
  if (!resto) return { cuantos: 1, resto: String(texto || "") };
  return { cuantos: Math.max(1, Math.min(cuantos, 99)), resto };
}

export function buscador({
  etiqueta,
  placeholder = "Escriba para buscar...",
  opciones = [],
  alElegir,
  alCrear = null,
  permiteCantidad = false,
  textoCrear = (t) => `Crear "${t}"`,
  // Para los PLATOS: "almuerzos" encuentra ALMUERZO y "almuerso" lo ofrece
  // como "¿quiso decir?". Para las PERSONAS no: ofrecer a alguien parecido
  // cuando escriben a una persona nueva es anotarle el almuerzo a otra.
  aproximado = false,
  // Si Enter puede escoger el renglón de "Crear ...". Para los platos no:
  // un plato nuevo lleva precio, y crearlo por un error de dedo deja un
  // plato repetido con un precio inventado.
  enterCrea = true,
  id = "buscador-" + Math.random().toString(36).slice(2, 8),
}) {
  let lista = opciones;
  let resaltado = -1;
  let visibles = [];

  const entrada = el("input", {
    type: "text",
    id,
    placeholder,
    autocomplete: "off",
    role: "combobox",
    "aria-expanded": "false",
    "aria-autocomplete": "list",
    "aria-controls": id + "-lista",
  });

  const ul = el("ul", { clase: "buscador-lista oculto", id: id + "-lista", role: "listbox" });
  const caja = el("div", { clase: "buscador" }, entrada, ul);
  const contenedor = el("div", { clase: "campo" },
    etiqueta ? el("label", { for: id, texto: etiqueta }) : null,
    caja
  );

  /** Cuantos pidio en lo ultimo que escribio. Lo lee elegir(). */
  let ultimaCantidad = 1;

  function opcionesVisibles() {
    // Si se permite cantidad, se busca por lo que queda despues del numero.
    const escrito = entrada.value.trim();
    const { cuantos, resto } = permiteCantidad
      ? separarCantidad(escrito)
      : { cuantos: 1, resto: escrito };
    const texto = resto;
    ultimaCantidad = cuantos;
    const buscado = paraBuscar(texto);
    let encontradas = lista.filter((o) => coincide(o.texto, texto));
    let sonParecidas = false;
    if (aproximado && !encontradas.length && buscado.length >= 3) {
      const singular = buscado.split(" ").map(sinPlural).join(" ");
      encontradas = lista.filter((o) => coincide(o.texto, singular));
      if (!encontradas.length) {
        encontradas = lista.filter((o) => seParece(paraBuscar(o.texto), buscado));
        sonParecidas = encontradas.length > 0;
      }
    }
    // Primero la que es IGUAL a lo escrito, después las que EMPIEZAN así, y
    // al final las demás, cada grupo en su orden. Por abecedario solo, al
    // escribir "juan orozco" salía primero JUAN MANUEL OROZCO, y Enter le
    // anotaba el almuerzo a él.
    if (buscado) {
      const puesto = (o) => {
        const t = paraBuscar(o.texto);
        return t === buscado ? 0 : t.startsWith(buscado) ? 1 : 2;
      };
      encontradas = encontradas
        .map((o, i) => ({ o, i, p: puesto(o) }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map((x) => x.o);
    }
    const hayExacta = lista.some((o) => paraBuscar(o.texto) === buscado);
    const items = encontradas.slice(0, 60).map((o) => ({
      tipo: "opcion", ...o,
      ...(sonParecidas ? { apunte: (o.apunte ? o.apunte + " · " : "") + "¿quiso decir este?" } : {}),
    }));
    if (alCrear && texto.length >= 2 && !hayExacta) {
      items.push({ tipo: "crear", texto, valor: texto });
    }
    return items;
  }


  function pintar() {
    visibles = opcionesVisibles();
    vaciar(ul);
    if (!visibles.length) {
      ul.append(el("li", { estilo: "color:var(--tinta-suave);cursor:default", texto: "No hay nada con ese nombre." }));
    }
    visibles.forEach((o, i) => {
      ul.append(
        el("li", {
          role: "option",
          clase: o.tipo === "crear" ? "crear" : "",
          "aria-selected": String(i === resaltado),
          alHacerClic: () => elegir(i),
        },
          el("span", { texto: o.tipo === "crear" ? textoCrear(o.texto) : o.texto }),
          o.apunte ? el("span", { clase: "apunte", texto: o.apunte }) : null
        )
      );
    });
    ul.classList.remove("oculto");
    entrada.setAttribute("aria-expanded", "true");
    const activo = ul.children[resaltado];
    if (activo) activo.scrollIntoView({ block: "nearest" });
  }

  function ocultar() {
    ul.classList.add("oculto");
    entrada.setAttribute("aria-expanded", "false");
    resaltado = -1;
  }

  function elegir(i) {
    const o = visibles[i];
    if (!o) return;
    if (o.tipo === "crear") {
      ocultar();
      alCrear(o.texto);
      return;
    }
    entrada.value = "";
    ocultar();
    alElegir(o.valor, o, ultimaCantidad);
    ultimaCantidad = 1;
  }

  // Lo resaltado se calcula con la lista NUEVA, la de lo que acaba de escribir.
  // Con la vieja, si la lista no se había abierto antes (el cursor lo puso la
  // app), no quedaba nada resaltado y Enter no escogía a nadie.
  entrada.addEventListener("input", () => {
    visibles = opcionesVisibles();
    resaltado = visibles.length ? 0 : -1;
    pintar();
  });
  // Cuando la APP pone el cursor aquí (después de anotar, de tocar un filtro)
  // la lista NO se abre: se abría con los 124 nombres encima de los filtros y
  // del total, y un clic despistado caía en una persona. Se abre cuando la
  // persona toca la casilla, escribe o baja con la flecha.
  let enfocandoCallado = false;
  entrada.addEventListener("focus", () => {
    resaltado = -1;
    if (enfocandoCallado) { enfocandoCallado = false; return; }
    pintar();
  });
  entrada.addEventListener("click", () => { if (ul.classList.contains("oculto")) pintar(); });
  entrada.addEventListener("blur", () => setTimeout(ocultar, 180));
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (ul.classList.contains("oculto")) { pintar(); return; }
      resaltado = Math.min(resaltado + 1, visibles.length - 1); pintar();
    }
    else if (e.key === "ArrowUp") { e.preventDefault(); resaltado = Math.max(resaltado - 1, 0); pintar(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const i = resaltado >= 0 ? resaltado : visibles.length === 1 ? 0 : -1;
      if (i < 0) return;
      if (visibles[i] && visibles[i].tipo === "crear" && !enterCrea) {
        // No se crea con Enter, pero tampoco se queda callado.
        const li = ul.children[i];
        if (li) { li.classList.remove("avisar"); void li.offsetWidth; li.classList.add("avisar"); }
        return;
      }
      elegir(i);
    } else if (e.key === "Escape") { ocultar(); entrada.blur(); }
  });

  return {
    nodo: contenedor,
    entrada,
    enfocar: () => {
      enfocandoCallado = true;
      entrada.focus();
      if (document.activeElement !== entrada) enfocandoCallado = false;
    },
    limpiar: () => { entrada.value = ""; ocultar(); },
    cambiarOpciones: (nuevas) => { lista = nuevas; if (document.activeElement === entrada) pintar(); },
  };
}

/** "ALMUERZOS" -> "ALMUERZO", "LIMONES" -> "LIMON". Basta con que quede
 *  dentro del nombre: coincide() busca la palabra adentro. */
function sinPlural(palabra) {
  if (palabra.length > 4 && palabra.endsWith("ES")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("S")) return palabra.slice(0, -1);
  return palabra;
}

/** Cada palabra escrita se parece a alguna del nombre: una letra cambiada
 *  ("ALMUERSO"), o dos en palabras largas. Las de una o dos letras se saltan. */
function seParece(nombre, buscado) {
  const delNombre = nombre.split(" ");
  return buscado.split(" ").filter((p) => p.length >= 3).every((p) =>
    delNombre.some((n) => n.includes(p) ||
      distancia(p, n, 2) <= (p.length >= 7 ? 2 : 1) ||
      (p.length >= 4 && n.length > p.length && distancia(p, n.slice(0, p.length), 1) <= 1)));
}

// ---------------------------------------------------------------------------
//  Pedacitos que se repiten
// ---------------------------------------------------------------------------

/** Un color estable por empresa: el mismo código siempre da el mismo color. */
const COLORES_CINTA = [
  "#a81e17", // rojo hondo de la marca
  "#35678f", // azul
  "#7a4a2b", // tierra
  "#1f7a4c", // verde
  "#204461", // azul hondo
  "#8a5a1c", // ocre
  "#6b3a52", // vino
]
export function colorDeEmpresa(codigo) {
  let n = 0;
  for (const c of String(codigo || "")) n = (n * 31 + c.charCodeAt(0)) % 100000;
  return COLORES_CINTA[n % COLORES_CINTA.length];
}

export function cinta(codigo) {
  return el("span", { clase: "cinta", estilo: `background:${colorDeEmpresa(codigo)}`, texto: codigo || "?" });
}

export function cifra(titulo, valor, destacada = false, esPlata = false) {
  const texto = String(valor);
  // Una cifra de plata NO se parte: "$ 1.724.500" cortado deja un "0" solo en
  // el renglón de abajo, que se lee como otro número. Si no cabe, se achica.
  const clase = esPlata
    ? "plata-cifra" + (texto.length > 10 ? " apretada" : "")
    : "";
  return el("div", { clase: "cifra" + (destacada ? " destacada" : "") },
    el("dt", { texto: titulo }),
    el("dd", clase ? { clase, texto } : { texto })
  );
}

export function cifraPlata(titulo, valor, destacada = false) {
  return cifra(titulo, pesos(valor), destacada, true);
}

export function vacio(titulo, explicacion) {
  return el("div", { clase: "vacio" }, el("strong", { texto: titulo }), explicacion);
}

/** Tabla con encabezados. columnas = [{titulo, clase}] */
export function tabla(columnas, filas, pie = null) {
  const thead = el("thead", {}, el("tr", {}, ...columnas.map((c) => el("th", { clase: c.clase || "", texto: c.titulo }))));
  const tbody = el("tbody", {}, ...filas);
  const t = el("table", {}, thead, tbody, pie ? el("tfoot", {}, pie) : null);
  return el("div", { clase: "marco-tabla" }, t);
}

/**
 * Un boton que se queda "trabajando" mientras hace lo suyo.
 *
 * Hace falta de verdad: armar el PDF de la lista por persona son 268 filas y
 * el navegador se queda quieto un segundo largo. Sin aviso, ella cree que no
 * funciono y vuelve a tocar, y entonces se bajan dos archivos.
 *
 * Mientras trabaja se apaga, para que no se pueda tocar dos veces.
 */
export function botonQueTrabaja(texto, alHacerClic, clase = "principal chico") {
  const rueda = el("span", { clase: "rueda", "aria-hidden": "true" });
  const letras = el("span", { texto });

  const boton = el("button", {
    clase,
    alHacerClic: async () => {
      if (boton.disabled) return;
      boton.disabled = true;
      boton.classList.add("trabajando");
      // Un respiro para que el navegador alcance a pintar el boton apagado
      // antes de ponerse a trabajar. Sin esto, el aviso nunca se ve.
      await new Promise((listo) => setTimeout(listo, 30));
      try {
        await alHacerClic();
      } finally {
        boton.disabled = false;
        boton.classList.remove("trabajando");
      }
    },
  }, rueda, letras);

  return boton;
}

/** Botón que descarga o imprime, para las pantallas de informes. */
export function acciones(...botones) {
  return el("div", { clase: "acciones fila no-imprimir" }, ...botones.filter(Boolean));
}
