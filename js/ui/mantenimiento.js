// ============================================================================
//  mantenimiento.js  -  Las pantallas de "arreglar cosas":
//  Empresas, Catálogo (los platos y sus precios) y Personas.
//
//  Son las que menos se usan, pero cuando se usan es porque algo está mal.
//  Por eso todas siguen la misma forma: buscador arriba, tabla en el medio,
//  y un solo botón grande para agregar.
// ============================================================================

import {
  el, vaciar, mensaje, confirmar, pedirDatos, tabla, cinta, cifra, vacio, ventana,
} from "./componentes.js";
import { estado, cambio, empresas } from "./estado.js";
import { pesos, normalizar, coincide, aEntero } from "../nucleo/formato.js";
import { clavePrecio, precioDe, indicePorCodigo } from "../nucleo/calculos.js";
import { agregarEmpresa, agregarProducto, agregarPersona } from "../nucleo/modelo.js";
import {
  limpiarNombre, parecidasEnEmpresa, renombrarPersona, tocayosEnOtrasEmpresas,
} from "../nucleo/nombres.js";

// ===========================================================================
//  EMPRESAS
// ===========================================================================

export function pintarEmpresas(raiz) {
  vaciar(raiz);
  const lista = estado.datos.empresas;

  raiz.append(
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Empresas" }),
        el("p", { texto: "A quiénes se les vende y hasta qué día va cada quincena." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevaEmpresa(raiz) }, "Agregar empresa")
    ),
    tarjetaAcreedor(raiz)
  );

  if (!lista.length) {
    raiz.append(vacio("Todavía no hay empresas",
      el("p", { texto: 'Toque "Agregar empresa" para crear la primera.' })));
    return;
  }

  raiz.append(
    el("p", { clase: "nota" },
      "La quincena 1 va del día 1 hasta el día de corte, y la quincena 2 del " +
      "siguiente hasta fin de mes. Cada empresa puede cortar en un día distinto."),
    tabla(
      [
        { titulo: "Código" }, { titulo: "Razón social" }, { titulo: "NIT" },
        { titulo: "Corta la Q1 el día", clase: "dato" },
        { titulo: "Corta la Q2 el día", clase: "dato" },
        { titulo: "" },
      ],
      lista.map((e) =>
        el("tr", { clase: e.activa === false ? "apagada" : "" },
          el("td", {}, cinta(e.codigo)),
          el("td", { texto: e.razonSocial || "—" }),
          el("td", { clase: "dato", texto: e.nit || "—" }),
          el("td", { clase: "dato", texto: String(e.ultimoDiaQ1) }),
          el("td", { clase: "dato", texto: String(e.ultimoDiaQ2) }),
          el("td", { clase: "dato" },
            el("div", { clase: "fila" },
              el("button", { clase: "plano chico", alHacerClic: () => editarEmpresa(raiz, e) }, "Editar"),
              el("button", {
                clase: "plano chico",
                alHacerClic: () => { e.activa = e.activa === false; cambio(); pintarEmpresas(raiz); },
              }, e.activa === false ? "Activar" : "Apagar")
            )
          )
        )
      )
    )
  );
}

/** Los datos de quien cobra. Salen impresos en todas las cuentas de cobro. */
function tarjetaAcreedor(raiz) {
  const a = estado.datos.config.acreedor || {};
  return el("section", { clase: "tarjeta" },
    el("div", { clase: "fila entre" },
      el("h2", { texto: "Quien cobra" }),
      el("button", {
        clase: "plano chico",
        alHacerClic: async () => {
          const r = await pedirDatos({
            titulo: "Datos de quien cobra",
            campos: [
              { nombre: "nombre", etiqueta: "Nombre completo", valor: a.nombre || "", requerido: true },
              { nombre: "nit", etiqueta: "NIT o cédula", valor: a.nit || "" },
              { nombre: "ciudad", etiqueta: "Ciudad", valor: a.ciudad || "" },
            ],
          });
          if (!r) return;
          estado.datos.config.acreedor = { nombre: r.nombre, nit: r.nit, ciudad: r.ciudad };
          cambio();
          pintarEmpresas(raiz);
          mensaje("Guardado.", "bien");
        },
      }, "Cambiar")
    ),
    el("p", { clase: "nota", texto: "Esto es lo que sale arriba en cada cuenta de cobro." }),
    el("dl", { clase: "cifras" },
      cifra("Nombre", a.nombre || "sin poner"),
      cifra("NIT", a.nit || "sin poner"),
      cifra("Ciudad", a.ciudad || "sin poner")
    )
  );
}

const CAMPOS_EMPRESA = (e = {}) => [
  {
    nombre: "codigo", etiqueta: "Código corto", valor: e.codigo || "", requerido: true,
    ayuda: "Como MGP o AGRO. Es el que se ve en las listas.",
  },
  { nombre: "razonSocial", etiqueta: "Razón social", valor: e.razonSocial || "", requerido: true },
  { nombre: "nit", etiqueta: "NIT", valor: e.nit || "" },
  {
    nombre: "ultimoDiaQ1", etiqueta: "Último día de la quincena 1", tipo: "number",
    valor: e.ultimoDiaQ1 ?? 15, min: 1, ayuda: "MGP corta el 13; las demás, el 14.",
  },
  {
    nombre: "ultimoDiaQ2", etiqueta: "Último día de la quincena 2", tipo: "number",
    valor: e.ultimoDiaQ2 ?? 31, min: 1, ayuda: "Casi siempre 31 (fin de mes).",
  },
];

async function nuevaEmpresa(raiz) {
  const r = await pedirDatos({ titulo: "Agregar empresa", campos: CAMPOS_EMPRESA(), textoAceptar: "Crear" });
  if (!r) return;
  try {
    agregarEmpresa(estado.datos, r);
    cambio();
    pintarEmpresas(raiz);
    mensaje(`${normalizar(r.codigo)} quedó creada.`, "bien");
  } catch (e) {
    mensaje(e.message, "malo", 6);
  }
}

async function editarEmpresa(raiz, empresa) {
  const r = await pedirDatos({ titulo: `Editar ${empresa.codigo}`, campos: CAMPOS_EMPRESA(empresa) });
  if (!r) return;

  const codigoNuevo = normalizar(r.codigo);
  if (codigoNuevo !== empresa.codigo) {
    mensaje(
      "El código corto no se puede cambiar, porque todos los renglones ya " +
      "registrados lo tienen escrito adentro. Cree otra empresa si necesita otra.",
      "malo", 9
    );
    return;
  }
  empresa.razonSocial = r.razonSocial;
  empresa.nit = r.nit;
  empresa.ultimoDiaQ1 = aEntero(r.ultimoDiaQ1, 15);
  empresa.ultimoDiaQ2 = aEntero(r.ultimoDiaQ2, 31);
  cambio();
  pintarEmpresas(raiz);
  mensaje("Guardado.", "bien");
}

// ===========================================================================
//  CATÁLOGO
// ===========================================================================

let buscaPlato = "";

export function pintarCatalogo(raiz) {
  vaciar(raiz);
  const lista = empresas();
  const productos = [...estado.datos.productos].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"));
  const visibles = productos.filter((p) => coincide(p.nombre, buscaPlato));

  // Un plato sin precio en alguna empresa es un renglón que va a entrar en $0.
  const sinPrecio = productos.filter((p) =>
    lista.some((e) => precioDe(estado.datos, p.nombre, e.codigo) === null));

  raiz.append(
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Catálogo" }),
        el("p", { texto: "Los platos y cuánto vale cada uno en cada empresa." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevoPlato(raiz) }, "Agregar plato")
    ),
    el("dl", { clase: "cifras" },
      cifra("Platos", String(productos.length)),
      cifra("Sin precio en alguna empresa", String(sinPrecio.length), sinPrecio.length > 0)
    )
  );

  if (sinPrecio.length) {
    raiz.append(
      el("p", { clase: "nota malo" },
        `${sinPrecio.length} platos no tienen precio en alguna empresa. Si se ` +
        "anota uno de esos, el renglón entra en $ 0 y la cuenta de cobro sale " +
        "por menos. Están marcados en rojo abajo.")
    );
  }

  const busca = el("input", {
    type: "search",
    placeholder: "Buscar un plato...",
    value: buscaPlato,
    alEscribir: (ev) => {
      buscaPlato = ev.target.value;
      // Repintamos solo el cuerpo de la tabla para no perder el cursor.
      const cuerpo = raiz.querySelector("tbody");
      if (cuerpo) {
        vaciar(cuerpo);
        for (const p of productos.filter((x) => coincide(x.nombre, buscaPlato))) {
          cuerpo.append(filaDePlato(raiz, p, lista));
        }
      }
    },
  });
  raiz.append(el("div", { clase: "campo" }, busca));

  if (!productos.length) {
    raiz.append(vacio("El catálogo está vacío",
      el("p", { texto: 'Toque "Agregar plato", o importe el Excel desde la pantalla Datos.' })));
    return;
  }

  raiz.append(
    tabla(
      [
        { titulo: "Plato" },
        ...lista.map((e) => ({ titulo: e.codigo, clase: "dato" })),
        { titulo: "", clase: "dato" },
      ],
      visibles.map((p) => filaDePlato(raiz, p, lista))
    )
  );
}

function filaDePlato(raiz, producto, lista) {
  const celdas = lista.map((e) => {
    const valor = precioDe(estado.datos, producto.nombre, e.codigo);
    const entrada = el("input", {
      type: "number",
      min: 0,
      step: 50,
      value: valor === null ? "" : String(valor),
      placeholder: "sin precio",
      clase: "precio" + (valor === null ? " falta" : ""),
      alCambiar: (ev) => {
        const txt = ev.target.value.trim();
        if (txt === "") {
          delete estado.datos.precios[clavePrecio(producto.nombre, e.codigo)];
        } else {
          estado.datos.precios[clavePrecio(producto.nombre, e.codigo)] = aEntero(txt, 0);
        }
        cambio();
        ev.target.classList.toggle("falta", txt === "");
        mensaje(`${producto.nombre} en ${e.codigo}: ${txt === "" ? "sin precio" : pesos(aEntero(txt, 0))}`, "bien", 2);
      },
    });
    return el("td", { clase: "dato" }, entrada);
  });

  return el("tr", { clase: producto.activo === false ? "apagada" : "" },
    el("td", {},
      el("strong", { texto: producto.nombre }),
      producto.activo === false ? el("span", { clase: "etiqueta", texto: "apagado" }) : null
    ),
    ...celdas,
    el("td", { clase: "dato" },
      el("div", { clase: "fila" },
        el("button", {
          clase: "plano chico",
          alHacerClic: () => renombrarPlato(raiz, producto),
        }, "Renombrar"),
        el("button", {
          clase: "plano chico",
          alHacerClic: () => {
            producto.activo = producto.activo === false;
            cambio();
            pintarCatalogo(raiz);
          },
        }, producto.activo === false ? "Prender" : "Apagar")
      )
    )
  );
}

async function nuevoPlato(raiz) {
  const lista = empresas();
  const r = await pedirDatos({
    titulo: "Agregar plato",
    campos: [
      { nombre: "nombre", etiqueta: "Nombre del plato", requerido: true },
      {
        nombre: "precio", etiqueta: "Precio", tipo: "number", min: 0, requerido: true,
        ayuda: "Después se puede cambiar empresa por empresa en esta misma tabla.",
      },
    ],
    textoAceptar: "Crear",
  });
  if (!r) return;

  const nombre = limpiarNombre(r.nombre);
  if (estado.datos.productos.some((p) => normalizar(p.nombre) === nombre)) {
    mensaje(`"${nombre}" ya está en el catálogo.`, "ojo", 6);
    return;
  }
  const precios = {};
  for (const e of lista) precios[e.codigo] = aEntero(r.precio, 0);
  agregarProducto(estado.datos, nombre, precios);
  cambio();
  pintarCatalogo(raiz);
  mensaje(`"${nombre}" quedó en el catálogo a ${pesos(aEntero(r.precio, 0))}.`, "bien");
}

/**
 * Renombrar un plato toca tres sitios: el catálogo, los precios y todos los
 * renglones ya registrados. Si se olvidara uno, quedarían renglones apuntando
 * a un plato que ya no existe.
 */
async function renombrarPlato(raiz, producto) {
  const r = await pedirDatos({
    titulo: `Renombrar "${producto.nombre}"`,
    campos: [
      { nombre: "nombre", etiqueta: "Nuevo nombre", valor: producto.nombre, requerido: true },
    ],
    textoAceptar: "Renombrar",
  });
  if (!r) return;

  const nuevo = limpiarNombre(r.nombre);
  const viejo = producto.nombre;
  if (!nuevo || nuevo === viejo) return;

  if (estado.datos.productos.some((p) => normalizar(p.nombre) === nuevo)) {
    mensaje(`Ya hay un plato que se llama "${nuevo}".`, "malo", 6);
    return;
  }

  const cuantos = estado.datos.consumos.filter(
    (c) => normalizar(c.producto) === normalizar(viejo)).length;

  const seguro = await confirmar({
    titulo: "Renombrar el plato",
    mensaje:
      `"${viejo}" va a pasar a llamarse "${nuevo}" en el catálogo, en los ` +
      `precios y en ${cuantos} renglones ya registrados. Ningún total cambia.`,
    siTexto: "Sí, renombrar",
  });
  if (!seguro) return;

  // 1) Los precios: se mudan a la llave nueva.
  for (const e of estado.datos.empresas) {
    const llaveVieja = clavePrecio(viejo, e.codigo);
    if (llaveVieja in estado.datos.precios) {
      estado.datos.precios[clavePrecio(nuevo, e.codigo)] = estado.datos.precios[llaveVieja];
      delete estado.datos.precios[llaveVieja];
    }
  }
  // 2) Los renglones ya registrados.
  for (const c of estado.datos.consumos) {
    if (normalizar(c.producto) === normalizar(viejo)) c.producto = nuevo;
  }
  // 3) El catálogo.
  producto.nombre = nuevo;

  cambio();
  pintarCatalogo(raiz);
  mensaje(`Renombrado. Se cambiaron ${cuantos} renglones.`, "bien", 6);
}

// ===========================================================================
//  PERSONAS
// ===========================================================================

let buscaPersona = "";
let empresaFiltro = "";

export function pintarPersonas(raiz) {
  vaciar(raiz);
  const lista = empresas();
  const todas = [...estado.datos.personas].sort(
    (a, b) => a.empresaCome.localeCompare(b.empresaCome, "es") ||
              a.nombre.localeCompare(b.nombre, "es"));

  const visibles = todas.filter((p) =>
    (!empresaFiltro || normalizar(p.empresaCome) === empresaFiltro) &&
    coincide(p.nombre, buscaPersona));

  // Cuánta gente se le factura a otra empresa distinta de donde come.
  const cruzadas = todas.filter(
    (p) => normalizar(p.empresaFactura) !== normalizar(p.empresaCome));

  raiz.append(
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Personas" }),
        el("p", { texto: "Quién come en cada empresa y a quién se le cobra." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevaPersona(raiz) }, "Agregar persona")
    ),
    el("dl", { clase: "cifras" },
      cifra("Personas", String(todas.length)),
      cifra("Se le cobra a otra empresa", String(cruzadas.length)),
      cifra("Mostrando", String(visibles.length))
    ),
    el("p", { clase: "nota" },
      "Una persona se identifica por su nombre ", el("strong", { texto: "y" }),
      " la empresa donde come. Por eso puede haber dos con el mismo nombre en " +
      "empresas distintas: son personas diferentes. Si cree que un nombre está " +
      "repetido por error, use la pantalla ",
      el("a", { href: "#nombres", texto: "Revisar nombres" }), ".")
  );

  const filtro = el("select", {
    alCambiar: (ev) => { empresaFiltro = ev.target.value; pintarPersonas(raiz); },
  },
    el("option", { value: "", selected: empresaFiltro === "" }, "Todas las empresas"),
    ...lista.map((e) => el("option", { value: e.codigo, selected: e.codigo === empresaFiltro }, e.codigo))
  );

  const busca = el("input", {
    type: "search",
    placeholder: "Buscar por nombre...",
    value: buscaPersona,
    alEscribir: (ev) => {
      buscaPersona = ev.target.value;
      const cuerpo = raiz.querySelector("tbody");
      if (!cuerpo) return;
      vaciar(cuerpo);
      const nuevas = todas.filter((p) =>
        (!empresaFiltro || normalizar(p.empresaCome) === empresaFiltro) &&
        coincide(p.nombre, buscaPersona));
      for (const p of nuevas.slice(0, 300)) cuerpo.append(filaDePersona(raiz, p, lista));
    },
  });

  raiz.append(
    el("div", { clase: "mando" },
      el("div", { clase: "campo crece" }, el("label", { texto: "Buscar" }), busca),
      el("div", { clase: "campo" }, el("label", { texto: "Empresa" }), filtro)
    )
  );

  if (!todas.length) {
    raiz.append(vacio("Todavía no hay personas",
      el("p", { texto: 'Agréguelas aquí, o impórtelas del Excel desde la pantalla Datos.' })));
    return;
  }

  raiz.append(
    tabla(
      [
        { titulo: "Nombre" }, { titulo: "Come en" }, { titulo: "Se le cobra a" }, { titulo: "", clase: "dato" },
      ],
      visibles.slice(0, 300).map((p) => filaDePersona(raiz, p, lista))
    )
  );

  if (visibles.length > 300) {
    raiz.append(el("p", { clase: "nota" },
      `Se muestran las primeras 300 de ${visibles.length}. Escriba en el buscador para encontrar a alguien.`));
  }
}

function filaDePersona(raiz, persona, lista) {
  const distinto = normalizar(persona.empresaFactura) !== normalizar(persona.empresaCome);

  return el("tr", { clase: persona.activa === false ? "apagada" : "" },
    el("td", {},
      el("strong", { texto: persona.nombre }),
      persona.activa === false ? el("span", { clase: "etiqueta", texto: "apagada" }) : null
    ),
    el("td", {}, cinta(persona.empresaCome)),
    el("td", {},
      cinta(persona.empresaFactura),
      distinto ? el("span", { clase: "etiqueta", texto: "distinta" }) : null
    ),
    el("td", { clase: "dato" },
      el("div", { clase: "fila" },
        el("button", { clase: "plano chico", alHacerClic: () => editarPersona(raiz, persona, lista) }, "Editar"),
        el("button", {
          clase: "plano chico",
          alHacerClic: () => { persona.activa = persona.activa === false; cambio(); pintarPersonas(raiz); },
        }, persona.activa === false ? "Prender" : "Apagar")
      )
    )
  );
}

async function nuevaPersona(raiz) {
  const lista = empresas();
  if (!lista.length) { mensaje("Primero cree una empresa.", "ojo"); return; }

  const r = await pedirDatos({
    titulo: "Agregar persona",
    campos: [
      { nombre: "nombre", etiqueta: "Nombre completo", requerido: true,
        ayuda: "Los puntos y los espacios de sobra se quitan solos." },
      {
        nombre: "empresaCome", etiqueta: "¿En qué empresa come?", tipo: "seleccion",
        valor: empresaFiltro || lista[0].codigo,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
      },
      {
        nombre: "empresaFactura", etiqueta: "¿A qué empresa se le cobra?", tipo: "seleccion",
        valor: empresaFiltro || lista[0].codigo,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
        ayuda: "Casi siempre es la misma de arriba.",
      },
    ],
    textoAceptar: "Crear",
  });
  if (!r) return;

  const nombre = limpiarNombre(r.nombre);

  // La misma defensa que en la pantalla de registrar: no dejamos nacer el duplicado.
  const parecidas = parecidasEnEmpresa(estado.datos, nombre, r.empresaCome)
    .filter((p) => p.fuerza >= 2);
  if (parecidas.length) {
    const sigo = await confirmar({
      titulo: "Ojo: hay alguien parecido",
      mensaje:
        `En ${r.empresaCome} ya está "${parecidas[0].persona.nombre}" (${parecidas[0].razon}). ` +
        `¿De verdad quiere crear a "${nombre}" aparte?`,
      siTexto: "Sí, es otra persona",
      noTexto: "No, cancelar",
    });
    if (!sigo) return;
  }

  try {
    agregarPersona(estado.datos, {
      nombre,
      empresaCome: r.empresaCome,
      empresaFactura: r.empresaFactura,
    });
  } catch (e) {
    mensaje(e.message, "malo", 6);
    return;
  }
  cambio();
  pintarPersonas(raiz);

  const tocayos = tocayosEnOtrasEmpresas(estado.datos, nombre, r.empresaCome);
  mensaje(
    `${nombre} quedó en ${r.empresaCome}.` +
    (tocayos.length ? ` Hay otra persona con ese nombre en ${[...new Set(tocayos.map((t) => t.empresaCome))].join(" y ")}, y son distintas.` : ""),
    tocayos.length ? "ojo" : "bien", tocayos.length ? 8 : 4
  );
}

async function editarPersona(raiz, persona, lista) {
  const r = await pedirDatos({
    titulo: `Editar a ${persona.nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre completo", valor: persona.nombre, requerido: true },
      {
        nombre: "empresaFactura", etiqueta: "¿A qué empresa se le cobra?", tipo: "seleccion",
        valor: persona.empresaFactura,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
      },
    ],
    textoAceptar: "Guardar",
  });
  if (!r) return;

  const nuevo = limpiarNombre(r.nombre);
  const cambiaFactura = normalizar(r.empresaFactura) !== normalizar(persona.empresaFactura);

  // Cambiar el nombre arrastra todos los renglones ya registrados.
  if (nuevo !== persona.nombre) {
    const cuantos = estado.datos.consumos.filter(
      (c) => normalizar(c.empresaCome) === normalizar(persona.empresaCome) &&
             normalizar(c.persona) === normalizar(persona.nombre)).length;
    const seguro = await confirmar({
      titulo: "Cambiar el nombre",
      mensaje:
        `"${persona.nombre}" va a pasar a llamarse "${nuevo}", y se van a mover ` +
        `${cuantos} renglones ya registrados. Ningún total cambia.`,
      siTexto: "Sí, cambiarlo",
    });
    if (!seguro) return;
    try {
      renombrarPersona(estado.datos, persona.empresaCome, persona.nombre, nuevo);
    } catch (e) {
      mensaje(e.message, "malo", 9);
      return;
    }
  }

  if (cambiaFactura) {
    // OJO: solo cambia de aquí en adelante. Lo ya cobrado NO se toca, porque
    // esas cuentas de cobro ya se entregaron.
    persona.empresaFactura = normalizar(r.empresaFactura);
    mensaje(
      `De ahora en adelante a ${nuevo} se le cobra a ${persona.empresaFactura}. ` +
      "Los renglones ya registrados se quedan como estaban.",
      "ojo", 8
    );
  }

  cambio();
  pintarPersonas(raiz);
  if (!cambiaFactura) mensaje("Guardado.", "bien");
}
