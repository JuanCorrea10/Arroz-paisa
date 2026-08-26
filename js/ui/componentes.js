// ============================================================================
//  componentes.js  -  Los ladrillos con los que se arman todas las pantallas.
// ============================================================================

import { coincide, pesos } from "../nucleo/formato.js";

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
    if (!m.isConnected) return;
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
  while (caja.children.length > MAXIMO_MENSAJES) irse(caja.firstElementChild);

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
  const contenido = el("div", { clase: "ventana-cuerpo" },
    el("h3", { texto: titulo }),
    cuerpo,
    botones.length ? pie : null
  );
  dialogo.append(contenido);
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
  const primero = dialogo.querySelector("input, select, textarea, button");
  if (primero) setTimeout(() => primero.focus(), 30);
  return { dialogo, cerrar };
}

/** Pregunta sí o no. Devuelve una promesa con true o false. */
export function confirmar({ titulo, mensaje: texto, siTexto = "Sí, hacerlo", noTexto = "Cancelar", peligroso = false }) {
  return new Promise((resolver) => {
    let respuesta = false;
    ventana({
      titulo,
      cuerpo: el("p", { texto }),
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
      cuerpo.append(
        el("div", { clase: "campo" },
          el("label", { for: entrada.id, texto: c.etiqueta }),
          entrada,
          c.ayuda ? el("small", { estilo: "color:var(--tinta-suave)", texto: c.ayuda }) : null
        )
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
        cuerpo.parentElement.querySelector(".ventana-pie button:last-child").click();
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
    const encontradas = lista.filter((o) => coincide(o.texto, texto));
    const hayExacta = lista.some((o) => o.texto.toUpperCase() === texto.toUpperCase());
    const items = encontradas.slice(0, 60).map((o) => ({ tipo: "opcion", ...o }));
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

  entrada.addEventListener("input", () => { resaltado = visibles.length ? 0 : -1; pintar(); });
  entrada.addEventListener("focus", () => { resaltado = -1; pintar(); });
  entrada.addEventListener("blur", () => setTimeout(ocultar, 180));
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); resaltado = Math.min(resaltado + 1, visibles.length - 1); pintar(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); resaltado = Math.max(resaltado - 1, 0); pintar(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (resaltado >= 0) elegir(resaltado);
      else if (visibles.length === 1) elegir(0);
    } else if (e.key === "Escape") { ocultar(); entrada.blur(); }
  });

  return {
    nodo: contenedor,
    entrada,
    enfocar: () => entrada.focus(),
    limpiar: () => { entrada.value = ""; ocultar(); },
    cambiarOpciones: (nuevas) => { lista = nuevas; if (document.activeElement === entrada) pintar(); },
  };
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

export function cifra(titulo, valor, destacada = false) {
  return el("div", { clase: "cifra" + (destacada ? " destacada" : "") },
    el("dt", { texto: titulo }),
    el("dd", { texto: valor })
  );
}

export function cifraPlata(titulo, valor, destacada = false) {
  return cifra(titulo, pesos(valor), destacada);
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
