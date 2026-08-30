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
  poner,
} from "./componentes.js";
import { estado, cambio, empresas } from "./estado.js";
import { pesos, normalizar, coincide, aEntero, nombreMes } from "../nucleo/formato.js";
import { clavePrecio, precioDe, indicePorCodigo, clavePersona, precioDelPlato, precioSeVeRaro,
  rangoQuincena } from "../nucleo/calculos.js";
import { simularUnionDePlatos, unirPlatosDelCatalogo } from "../nucleo/sueltos.js";
import {
  agregarEmpresa, agregarProducto, agregarPersona, revisarQuincenas,
  puedeBorrarPersona, borrarPersona, puedeBorrarProducto, borrarProducto,
  ponerPrecioEnTodas,
} from "../nucleo/modelo.js";
import {
  limpiarNombre, parecidasEnEmpresa, renombrarPersona, tocayosEnOtrasEmpresas,
  simularUnion, unirPersonas, simularCambioDeEmpresa, cambiarDeEmpresa,
} from "../nucleo/nombres.js";

// ===========================================================================
//  EMPRESAS
// ===========================================================================

export function pintarEmpresas(raiz) {
  vaciar(raiz);
  const lista = estado.datos.empresas;

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Empresas" }),
        el("p", { texto: "A quiénes se les vende y qué días cubre cada quincena." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevaEmpresa(raiz) }, "Agregar empresa")
    ),
    tarjetaAcreedor(raiz)
  );

  if (!lista.length) {
    poner(raiz, vacio("Todavía no hay empresas",
      el("p", { texto: 'Toque "Agregar empresa" para crear la primera.' })));
    return;
  }

  poner(raiz,
    el("p", { clase: "nota" },
      `Cada empresa cubre los días que se le pongan, y el corte entre una ` +
      `quincena y otra es el último día de la 1. Aquí se ven puestos sobre ` +
      `${nombreMes(estado.mes)} de ${estado.anio}, que es el mes que está mirando.`),
    tabla(
      [
        { titulo: "Código" }, { titulo: "Razón social" }, { titulo: "NIT" },
        { titulo: "Quincena 1", clase: "dato" },
        { titulo: "Quincena 2", clase: "dato" },
        { titulo: "" },
      ],
      lista.map((e) =>
        el("tr", { clase: e.activa === false ? "apagada" : "" },
          el("td", {}, cinta(e.codigo)),
          el("td", { texto: e.razonSocial || "—" }),
          el("td", { clase: "dato", texto: e.nit || "—" }),
          el("td", { clase: "dato", texto: diceElRango(e, 1) }),
          el("td", { clase: "dato", texto: diceElRango(e, 2) }),
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

/** "del 1 al 14", con los días de esta empresa puestos sobre el mes que se ve. */
export function diceElRango(empresa, quincena) {
  const r = rangoQuincena(estado.anio, estado.mes, quincena, empresa);
  return `del ${r.desde} al ${r.hasta}`;
}

/** Los cuatro días del periodo, que se editan aquí y desde la cuenta de cobro. */
export const CAMPOS_QUINCENA = (e = {}) => [
  {
    nombre: "primerDiaQ1", etiqueta: "La quincena 1 empieza el día", tipo: "number",
    valor: e.primerDiaQ1 ?? 1, min: 1,
    ayuda: "Casi siempre 1. Póngale otro si el mes no se cobra completo.",
  },
  {
    nombre: "ultimoDiaQ1", etiqueta: "y acaba el día", tipo: "number",
    valor: e.ultimoDiaQ1 ?? 15, min: 1,
    ayuda: "Este es el CORTE: lo de aquí para atrás es la quincena 1. MGP corta el 13; las demás, el 14.",
  },
  {
    nombre: "primerDiaQ2", etiqueta: "La quincena 2 empieza el día", tipo: "number",
    valor: e.primerDiaQ2 ?? (Number(e.ultimoDiaQ1) || 15) + 1, min: 1,
    ayuda: "Normalmente, al otro día del corte.",
  },
  {
    nombre: "ultimoDiaQ2", etiqueta: "y acaba el día", tipo: "number",
    valor: e.ultimoDiaQ2 ?? 31, min: 1,
    ayuda: "Casi siempre 31. Si el mes es más corto, se recorta solo.",
  },
];

const CAMPOS_EMPRESA = (e = {}) => [
  {
    nombre: "codigo", etiqueta: "Código corto", valor: e.codigo || "", requerido: true,
    ayuda: "Como MGP o AGRO. Es el que se ve en las listas.",
  },
  { nombre: "razonSocial", etiqueta: "Razón social", valor: e.razonSocial || "", requerido: true },
  { nombre: "nit", etiqueta: "NIT", valor: e.nit || "" },
  ...CAMPOS_QUINCENA(e),
];

async function nuevaEmpresa(raiz) {
  const r = await pedirDatos({ titulo: "Agregar empresa", campos: CAMPOS_EMPRESA(), textoAceptar: "Crear" });
  if (!r) return;
  const dias = revisarQuincenas(r);
  if (dias.malo) { mensaje(dias.malo, "malo", 9); return; }
  try {
    agregarEmpresa(estado.datos, { ...r, ...dias });
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
  const dias = revisarQuincenas(r);
  if (dias.malo) { mensaje(dias.malo, "malo", 9); return; }

  empresa.razonSocial = r.razonSocial;
  empresa.nit = r.nit;
  Object.assign(empresa, dias);
  cambio();
  pintarEmpresas(raiz);
  mensaje("Guardado.", "bien");
}

// ===========================================================================
//  CATÁLOGO
// ===========================================================================

let buscaPlato = "";

/** Los platos marcados para unir. Se guardan por nombre ya normalizado. */
const platosMarcados = new Set();

export function pintarCatalogo(raiz) {
  vaciar(raiz);
  const lista = empresas();
  const productos = [...estado.datos.productos].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"));
  const visibles = productos.filter((p) => coincide(p.nombre, buscaPlato));

  const codigos = lista.map((e) => e.codigo);
  const precioDeCada = new Map(
    productos.map((p) => [p.nombre, precioDelPlato(estado.datos, p.nombre, codigos)]));

  // Un plato sin precio es un renglón que va a entrar en $ 0.
  const sinPrecio = productos.filter((p) => precioDeCada.get(p.nombre).falta > 0);

  // Y uno donde las empresas no coinciden. En los datos de verdad esto NUNCA
  // pasa a propósito: los 77 platos cuestan lo mismo en las cuatro fábricas.
  // Así que un plato "con precios distintos" es, casi seguro, un dedo mal
  // puesto -- el cero de más que convierte $ 10.000 en $ 1.000.000.
  const disparejos = productos.filter((p) => {
    const info = precioDeCada.get(p.nombre);
    return !info.igual && info.falta < codigos.length;
  });

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Catálogo" }),
        el("p", { texto: "Los platos y cuánto vale cada uno." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevoPlato(raiz) }, "Agregar plato")
    ),
    el("dl", { clase: "cifras" },
      cifra("Platos", String(productos.length)),
      cifra("Sin precio", String(sinPrecio.length), sinPrecio.length > 0),
      cifra("Con precios distintos", String(disparejos.length), disparejos.length > 0)
    ),
    el("p", { clase: "nota" },
      "¿El mismo plato quedó dos veces con nombres parecidos ",
      el("em", { texto: "(AGUA GAS y AGUA CON GAS)" }), "? ",
      el("strong", { texto: "Márquelos con la casilla y únalos" }),
      ": los renglones ya registrados se pasan al nombre que se quede. " +
      "Borrarlos no se puede -- están en renglones viejos -- y apagarlos solo " +
      "los esconde al anotar: seguirían saliendo separados en la cuenta.")
  );

  if (sinPrecio.length) {
    poner(raiz,
      el("p", { clase: "nota malo" },
        `${sinPrecio.length} ` + (sinPrecio.length === 1 ? "plato no tiene" : "platos no tienen") +
        " precio. Si se anota uno de esos, el renglón entra en $ 0 y la cuenta " +
        "de cobro sale por menos. Están marcados en rojo abajo.")
    );
  }

  if (disparejos.length) {
    poner(raiz,
      el("div", { clase: "caja-aviso ojo" },
        el("p", {},
          el("strong", { texto: "Revise estos precios." }), " ",
          `${disparejos.length} ` +
          (disparejos.length === 1 ? "plato cuesta" : "platos cuestan") +
          " distinto según la empresa:"),
        el("ul", { clase: "lista-disparejos" },
          ...disparejos.slice(0, 8).map((p) => {
            const info = precioDeCada.get(p.nombre);
            return el("li", {},
              el("button", {
                clase: "plano",
                alHacerClic: () => { buscaPlato = p.nombre; pintarCatalogo(raiz); },
              }, p.nombre),
              " — ",
              codigos.map((c) => `${c} ${pesos(info.porEmpresa[normalizar(c)] || 0)}`).join(" · ")
            );
          }),
          disparejos.length > 8
            ? el("li", { clase: "nota", texto: `…y ${disparejos.length - 8} más` })
            : null
        ),
        el("p", { clase: "nota" },
          "Puede ser a propósito, pero casi nunca lo es: normalmente todas las " +
          "empresas pagan igual, y esto es un cero de más al escribir. Toque el " +
          "plato para buscarlo y arreglarlo.")
      )
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
  poner(raiz, el("div", { clase: "campo" }, busca));

  if (!productos.length) {
    poner(raiz, vacio("El catálogo está vacío",
      el("p", { texto: 'Toque "Agregar plato", o importe el Excel desde la pantalla Datos.' })));
    return;
  }

  poner(raiz, barraDeUnirPlatos(raiz, productos));

  const suTabla = tabla(
    [
      { titulo: "" },
      { titulo: "Plato" },
      { titulo: "Precio", clase: "dato" },
      { titulo: "", clase: "dato" },
    ],
    visibles.map((p) => filaDePlato(raiz, p, lista))
  );
  const laTabla = suTabla.querySelector("table") || suTabla;
  laTabla.classList.add("tabla-catalogo");
  poner(raiz, suTabla);
}

function filaDePlato(raiz, producto, lista) {
  const codigos = lista.map((e) => e.codigo);
  const info = precioDelPlato(estado.datos, producto.nombre, codigos);

  const llave = normalizar(producto.nombre);

  return el("tr", { clase: producto.activo === false ? "apagada" : "" },
    el("td", {},
      el("input", {
        type: "checkbox",
        checked: platosMarcados.has(llave),
        "aria-label": `Marcar ${producto.nombre} para unir`,
        alCambiar: (ev) => {
          if (ev.target.checked) platosMarcados.add(llave);
          else platosMarcados.delete(llave);
          pintarCatalogo(raiz);
        },
      })
    ),
    el("td", {},
      el("strong", { texto: producto.nombre }),
      producto.activo === false ? el("span", { clase: "etiqueta", texto: "apagado" }) : null,
      // Solo cuando de verdad hay algo raro se muestra el detalle por empresa.
      // El otro 100 % del tiempo esa fila sobraba y llenaba la pantalla.
      info.igual ? null : detalleDisparejo(raiz, producto, info, codigos)
    ),

    el("td", { clase: "dato" },
      el("div", { clase: "campo-precio" },
        el("span", { clase: "signo", texto: "$" }),
        campoDePrecio(raiz, producto, info, codigos)
      )
    ),

    el("td", { clase: "dato" },
      el("div", { clase: "acciones-fila" },
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
        }, producto.activo === false ? "Prender" : "Apagar"),
        el("button", {
          clase: "plano chico peligro-suave",
          alHacerClic: () => quitarPlato(raiz, producto),
        }, "Borrar")
      )
    )
  );
}

/**
 * El campo del precio. UNO solo, que se escribe en las cuatro empresas.
 *
 * Antes había una casilla por empresa. En los datos de verdad los 77 platos
 * cuestan lo mismo en las cuatro, así que eso era escribir cuatro veces lo
 * mismo -- con cuatro oportunidades de poner un cero de más.
 */
function campoDePrecio(raiz, producto, info, codigos) {
  const entrada = el("input", {
    type: "number",
    min: 0,
    step: 50,
    inputmode: "numeric",
    value: info.igual && info.valor !== null ? String(info.valor) : "",
    placeholder: info.igual ? "sin precio" : "distinto",
    "aria-label": `Precio de ${producto.nombre}`,
    clase: "precio" + (info.falta > 0 ? " falta" : "") + (info.igual ? "" : " disparejo"),
    alCambiar: async (ev) => {
      const txt = ev.target.value.trim();
      const nuevoValor = txt === "" ? null : aEntero(txt, 0);

      // La guardia del cero de más. Un almuerzo que sube de 12 a 13 mil pasa
      // sin preguntar; uno que pasa de 10.000 a 1.000.000, no.
      if (nuevoValor !== null && info.valor !== null &&
          precioSeVeRaro(info.valor, nuevoValor)) {
        const seguro = await preguntarPorElPrecio(producto, info.valor, nuevoValor);
        if (!seguro) { pintarCatalogo(raiz); return; }
      }

      ponerPrecioEnTodas(estado.datos, producto.nombre, codigos, nuevoValor);
      cambio();
      pintarCatalogo(raiz);
      mensaje(
        nuevoValor === null
          ? `${producto.nombre}: sin precio.`
          : `${producto.nombre}: ${pesos(nuevoValor)} en las ${codigos.length} empresas.`,
        "bien", 3
      );
    },
  });

  return entrada;
}

/**
 * La guardia del cero de más.
 *
 * Se usa ventana y no confirmar() porque confirmar solo sabe mostrar una
 * línea de texto, y aquí lo que convence es ver los dos números juntos:
 * "pasaría de $ 10.000 a $ 1.000.000" se entiende de un vistazo.
 */
function preguntarPorElPrecio(producto, viejo, nuevo) {
  return new Promise((resolver) => {
    let respuesta = false;
    ventana({
      titulo: "¿Ese precio está bien?",
      cuerpo: el("div", {},
        el("p", {},
          el("strong", { texto: producto.nombre }), " pasaría de ",
          el("strong", { texto: pesos(viejo) }), " a ",
          el("strong", { texto: pesos(nuevo) }), "."),
        el("p", { clase: "nota ojo" },
          "Es un cambio muy grande. Si se pasó un cero, esto saldría en la " +
          "próxima cuenta de cobro y nadie lo notaría hasta que la empresa " +
          "reclame."),
        el("p", { clase: "nota bien" },
          "Los pedidos que ya están anotados NO cambian: cada uno se guardó con " +
          "el precio del día en que se registró.")
      ),
      botones: [
        { texto: "No, me equivoqué", alHacerClic: () => { respuesta = false; } },
        { texto: "Sí, ese es el precio", clase: "principal", alHacerClic: () => { respuesta = true; } },
      ],
      alCerrar: () => resolver(respuesta),
    });
  });
}

/**
 * El detalle por empresa. Solo sale cuando las empresas NO coinciden.
 *
 * Casi siempre que aparece es porque alguien escribió mal, no porque una
 * fábrica cobre distinto. Por eso lo primero que ofrece es emparejarlas.
 */
function detalleDisparejo(raiz, producto, info, codigos) {
  return el("div", { clase: "precios-disparejos" },
    el("span", { clase: "etiqueta ojo", texto: "precios distintos" }),
    ...codigos.map((c) => {
      const valor = info.porEmpresa[normalizar(c)];
      return el("span", { clase: "precio-empresa" },
        el("em", { texto: c }), " ",
        valor === null ? "sin precio" : pesos(valor));
    }),
    el("div", { clase: "fila" },
      ...codigos
        .filter((c) => info.porEmpresa[normalizar(c)] !== null)
        .map((c) =>
          el("button", {
            clase: "plano chico",
            alHacerClic: () => {
              const valor = info.porEmpresa[normalizar(c)];
              ponerPrecioEnTodas(estado.datos, producto.nombre, codigos, valor);
              cambio();
              pintarCatalogo(raiz);
              mensaje(`${producto.nombre}: ${pesos(valor)} en todas.`, "bien", 4);
            },
          }, `Dejar ${pesos(info.porEmpresa[normalizar(c)])} en todas`)
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
        ayuda: "El mismo precio para todas las empresas. Se puede cambiar después.",
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

// ---------------------------------------------------------------------------
//  Unir platos que son el mismo plato
// ---------------------------------------------------------------------------

function barraDeUnirPlatos(raiz, productos) {
  const elegidos = productos.filter((p) => platosMarcados.has(normalizar(p.nombre)));
  if (!elegidos.length) return null;

  return el("section", { clase: "tarjeta barra-unir" },
    el("div", { clase: "fila entre" },
      el("div", {},
        el("strong", { texto:
          elegidos.length === 1 ? "1 plato marcado" : `${elegidos.length} platos marcados` }),
        el("p", { clase: "nota-suelta", texto: elegidos.map((p) => p.nombre).join("  ·  ") })
      ),
      el("div", { clase: "fila" },
        el("button", {
          clase: "plano chico",
          alHacerClic: () => { platosMarcados.clear(); pintarCatalogo(raiz); },
        }, "Desmarcar"),
        el("button", {
          clase: "principal",
          disabled: elegidos.length < 2,
          alHacerClic: () => unirLosPlatosMarcados(raiz, elegidos),
        }, "Unir los marcados")
      )
    ),
    elegidos.length < 2
      ? el("p", { clase: "nota", texto: "Marque otro para poder unirlos." })
      : null
  );
}

async function unirLosPlatosMarcados(raiz, elegidos) {
  // El que más renglones tenga va primero: casi siempre es el nombre bueno.
  const conPeso = elegidos.map((p) => ({
    producto: p,
    renglones: estado.datos.consumos.filter(
      (c) => normalizar(c.producto) === normalizar(p.nombre)).length,
  })).sort((a, b) => b.renglones - a.renglones);

  const r = await pedirDatos({
    titulo: "¿Cuál nombre se queda?",
    campos: [
      {
        nombre: "bueno",
        etiqueta: "El nombre bueno",
        tipo: "seleccion",
        valor: conPeso[0].producto.nombre,
        opciones: conPeso.map((x) => ({
          valor: x.producto.nombre,
          texto: `${x.producto.nombre}  (${x.renglones} renglones)`,
        })),
        ayuda: "Los otros desaparecen del catálogo y sus renglones pasan a este.",
      },
    ],
    textoAceptar: "Ver qué va a pasar",
  });
  if (!r) return;

  const otros = elegidos.map((p) => p.nombre).filter((n) => n !== r.bueno);
  const previa = simularUnionDePlatos(estado.datos, r.bueno, otros);

  ventana({
    titulo: "¿Unir estos platos?",
    cuerpo: el("div", {},
      el("p", {},
        "Todo lo de ",
        ...otros.map((n, i) => [i ? " y " : "", el("strong", { texto: n })]).flat(),
        " va a quedar como ", el("strong", { texto: r.bueno }), "."),
      el("dl", { clase: "cifras" },
        cifra("Renglones que se mueven", String(previa.renglones)),
        cifra("Valían", pesos(previa.antes)),
        cifra("Van a valer", pesos(previa.despues), previa.diferencia !== 0)
      ),
      // La plata SÍ puede cambiar aquí, al revés que al unir personas: los
      // renglones se quedan con el precio del plato que se queda. Si los dos
      // valían lo mismo la diferencia es cero y no se dice nada; si no, hay
      // que decirlo con todas las letras y por empresa, porque eso mueve la
      // cuenta de cobro de este mes.
      previa.diferencia === 0
        ? el("p", { clase: "nota bien" },
            "Valían lo mismo, así que ningún total cambia.")
        : el("div", {},
            el("p", { clase: "nota ojo" },
              "Ojo: no valían lo mismo. El total ",
              el("strong", { texto: previa.diferencia > 0 ? "sube " : "baja " }),
              el("strong", { texto: pesos(Math.abs(previa.diferencia)) }),
              ", porque los renglones se quedan con el precio de ",
              el("strong", { texto: r.bueno }), "."),
            el("ul", { clase: "lista-disparejos" },
              ...previa.porEmpresa.map((e) => el("li", {},
                el("strong", { texto: e.empresa }), " — de ", pesos(e.antes),
                " a ", pesos(e.despues),
                el("span", { clase: "nota-suelta",
                  texto: ` (${e.diferencia > 0 ? "+" : ""}${pesos(e.diferencia)})` })))
            )
          )
    ),
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Sí, unir",
        clase: "principal",
        alHacerClic: () => {
          try {
            const hecho = unirPlatosDelCatalogo(estado.datos, r.bueno, otros);
            platosMarcados.clear();
            cambio();
            pintarCatalogo(raiz);
            mensaje(
              `Unidos. ${hecho.renglones} renglones quedaron como ${hecho.bueno}.`,
              "bien", 7
            );
          } catch (e) {
            mensaje(e.message, "malo", 8);
          }
        },
      },
    ],
  });
}

// ===========================================================================
//  PERSONAS
// ===========================================================================

let buscaPersona = "";
/** Cómo se ordena la lista: "nombre" o "empresa". */
let ordenPersonas = "empresa";
let empresaFiltro = "";

/**
 * Las personas marcadas para unir, por su llave (empresa + nombre).
 *
 * Esto hacia falta de verdad. La pantalla Revisar solo muestra los nombres
 * que se PARECEN. Si la misma persona quedo como "JOSE RAMIREZ" y como
 * "PEPE R. GOMEZ", no se parecen en nada y no aparece nunca: a ella le tocaba
 * renombrar las dos para que coincidieran y solo entonces se podian unir.
 * Aqui se marcan las dos y ya.
 */
const marcadas = new Set();

export function pintarPersonas(raiz) {
  vaciar(raiz);
  const lista = empresas();
  // Ordenar por empresa NO es agrupar por empresa y ya: dentro de cada una la
  // gente sigue yendo por nombre. Si no, buscar a alguien dentro de MGP sería
  // recorrer 124 renglones sin orden.
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  const todas = [...estado.datos.personas].sort(
    ordenPersonas === "nombre"
      ? porNombre
      : (a, b) => a.empresa.localeCompare(b.empresa, "es") || porNombre(a, b));

  const visibles = todas.filter((p) =>
    (!empresaFiltro || normalizar(p.empresa) === empresaFiltro) &&
    coincide(p.nombre, buscaPersona));

  // Cuántas están apagadas. Antes aquí se contaba "a cuántas se les factura a
  // otra empresa", pero ya no hay dos empresas que puedan no coincidir.
  const apagadas = todas.filter((p) => p.activa === false);
  const conDocumento = todas.filter((p) => p.documento);

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Personas" }),
        el("p", { texto: "Quién come en cada empresa." })
      ),
      el("button", { clase: "principal", alHacerClic: () => nuevaPersona(raiz) }, "Agregar persona")
    ),
    el("dl", { clase: "cifras" },
      cifra("Personas", String(todas.length)),
      cifra("Con cédula", `${conDocumento.length} de ${todas.length}`),
      cifra("Apagadas", String(apagadas.length)),
      cifra("Mostrando", String(visibles.length))
    ),
    el("p", { clase: "nota" },
      "Una persona se identifica por su nombre ", el("strong", { texto: "y" }),
      " la empresa donde come. Por eso puede haber dos con el mismo nombre en " +
      "empresas distintas: son personas diferentes.")
    ,
    el("p", { clase: "nota" },
      "¿La misma persona quedó anotada dos veces con nombres muy distintos? ",
      el("strong", { texto: "Márquelas con la casilla de la izquierda y únalas" }),
      ". La pantalla ", el("a", { href: "#nombres", texto: "Revisar nombres" }),
      " solo encuentra las que se parecen; si de una quedó el apodo y de la " +
      "otra el nombre completo, no se parecen en nada y allá no salen nunca."),
    el("p", { clase: "nota" },
      "¿Y si quedaron en ", el("strong", { texto: "empresas distintas" }), "? ",
      'Ábrala con "Editar" y cámbiele la empresa: cuando las dos estén en la ' +
      "misma, se pueden unir.")
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
      // "todas" ya viene ordenada como toque, así que filtrar respeta el orden.
      const nuevas = todas.filter((p) =>
        (!empresaFiltro || normalizar(p.empresa) === empresaFiltro) &&
        coincide(p.nombre, buscaPersona));
      for (const p of nuevas.slice(0, 300)) cuerpo.append(filaDePersona(raiz, p, lista));
    },
  });

  const orden = el("select", {
    id: "orden-personas",
    alCambiar: (ev) => { ordenPersonas = ev.target.value; pintarPersonas(raiz); },
  },
    el("option", { value: "empresa", selected: ordenPersonas === "empresa" }, "Empresa, y luego nombre"),
    el("option", { value: "nombre", selected: ordenPersonas === "nombre" }, "Nombre")
  );

  poner(raiz,
    el("div", { clase: "mando" },
      el("div", { clase: "campo crece" }, el("label", { texto: "Buscar" }), busca),
      el("div", { clase: "campo" }, el("label", { texto: "Empresa" }), filtro),
      el("div", { clase: "campo" },
        el("label", { for: "orden-personas", texto: "Ordenar por" }), orden)
    )
  );

  if (!todas.length) {
    poner(raiz, vacio("Todavía no hay personas",
      el("p", { texto: 'Agréguelas aquí, o impórtelas del Excel desde la pantalla Datos.' })));
    return;
  }

  poner(raiz, barraDeUnir(raiz, todas));

  poner(raiz,
    tabla(
      [
        { titulo: "" }, { titulo: "Nombre" }, { titulo: "Empresa" },
        { titulo: "Cédula", clase: "dato" },
        { titulo: "", clase: "dato" },
      ],
      visibles.slice(0, 300).map((p) => filaDePersona(raiz, p, lista))
    )
  );

  if (visibles.length > 300) {
    poner(raiz, el("p", { clase: "nota" },
      `Se muestran las primeras 300 de ${visibles.length}. Escriba en el buscador para encontrar a alguien.`));
  }
}

function filaDePersona(raiz, persona, lista) {
  const llave = clavePersona(persona.empresa, persona.nombre);

  return el("tr", { clase: persona.activa === false ? "apagada" : "" },
    el("td", {},
      el("input", {
        type: "checkbox",
        checked: marcadas.has(llave),
        "aria-label": `Marcar a ${persona.nombre} para unir`,
        alCambiar: (ev) => {
          if (ev.target.checked) marcadas.add(llave);
          else marcadas.delete(llave);
          pintarPersonas(raiz);
        },
      })
    ),
    el("td", {},
      el("strong", { texto: persona.nombre }),
      persona.activa === false ? el("span", { clase: "etiqueta", texto: "apagada" }) : null
    ),
    el("td", {}, cinta(persona.empresa)),
    el("td", { clase: "dato" },
      persona.documento
        ? el("code", { clase: "documento-corto", texto: "···" + persona.documento })
        : el("span", { clase: "nota-suelta", texto: "—" })
    ),
    el("td", { clase: "dato" },
      el("div", { clase: "fila" },
        el("button", { clase: "plano chico", alHacerClic: () => editarPersona(raiz, persona, lista) }, "Editar"),
        el("button", {
          clase: "plano chico",
          alHacerClic: () => { persona.activa = persona.activa === false; cambio(); pintarPersonas(raiz); },
        }, persona.activa === false ? "Prender" : "Apagar"),
        el("button", {
          clase: "plano chico peligro-suave",
          alHacerClic: () => quitarPersona(raiz, persona),
        }, "Borrar")
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
        nombre: "empresa", etiqueta: "¿En qué empresa come?", tipo: "seleccion",
        valor: empresaFiltro || lista[0].codigo,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
        ayuda: "Es la misma a la que se le cobra.",
      },
      {
        nombre: "documento", etiqueta: "Cédula (opcional)", tipo: "text",
        ayuda: "Sirve para no confundirla con otra del mismo nombre. La app " +
               "guarda solo los últimos 5 números, nada más.",
      },
    ],
    textoAceptar: "Crear",
  });
  if (!r) return;

  const nombre = limpiarNombre(r.nombre);

  // La misma defensa que en la pantalla de registrar: no dejamos nacer el duplicado.
  const parecidas = parecidasEnEmpresa(estado.datos, nombre, r.empresa)
    .filter((p) => p.fuerza >= 2);
  if (parecidas.length) {
    const sigo = await confirmar({
      titulo: "Ojo: hay alguien parecido",
      mensaje:
        `En ${r.empresa} ya está "${parecidas[0].persona.nombre}" (${parecidas[0].razon}). ` +
        `¿De verdad quiere crear a "${nombre}" aparte?`,
      siTexto: "Sí, es otra persona",
      noTexto: "No, cancelar",
    });
    if (!sigo) return;
  }

  try {
    agregarPersona(estado.datos, {
      nombre,
      empresa: r.empresa,
      documento: r.documento,
    });
  } catch (e) {
    mensaje(e.message, "malo", 6);
    return;
  }
  cambio();
  pintarPersonas(raiz);

  const tocayos = tocayosEnOtrasEmpresas(estado.datos, nombre, r.empresa);
  mensaje(
    `${nombre} quedó en ${r.empresa}.` +
    (tocayos.length ? ` Hay otra persona con ese nombre en ${[...new Set(tocayos.map((t) => t.empresa))].join(" y ")}, y son distintas.` : ""),
    tocayos.length ? "ojo" : "bien", tocayos.length ? 8 : 4
  );
}

async function editarPersona(raiz, persona, lista) {
  const r = await pedirDatos({
    titulo: `Editar a ${persona.nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre completo", valor: persona.nombre, requerido: true },
      {
        nombre: "empresa", etiqueta: "Empresa", tipo: "seleccion",
        valor: persona.empresa,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
        ayuda: "Si se cambió de sede, cámbiela aquí: se lleva sus renglones.",
      },
      {
        nombre: "documento", etiqueta: "Cédula (opcional)", tipo: "text",
        valor: persona.documento || "",
        ayuda: persona.documento
          ? "Ya tiene guardados los últimos 5: " + persona.documento
          : "Sirve para no confundirla con otra del mismo nombre. Se guardan solo los últimos 5 números.",
      },
    ],
    textoAceptar: "Guardar",
  });
  if (!r) return;

  const nuevo = limpiarNombre(r.nombre);
  const otraEmpresa = normalizar(r.empresa);
  const cambiaEmpresa = otraEmpresa !== normalizar(persona.empresa);

  // Cambiar el nombre arrastra todos los renglones ya registrados.
  if (nuevo !== persona.nombre) {
    const cuantos = estado.datos.consumos.filter(
      (c) => normalizar(c.empresa) === normalizar(persona.empresa) &&
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
      renombrarPersona(estado.datos, persona.empresa, persona.nombre, nuevo);
    } catch (e) {
      mensaje(e.message, "malo", 9);
      return;
    }
  }

  // La cedula se guarda siempre que la hayan escrito.
  const doc = String(r.documento || "").replace(/[^0-9]/g, "").slice(-5);
  if (doc !== (persona.documento || "")) persona.documento = doc;

  // --- Cambiarla de empresa ------------------------------------------------
  //
  //  Esto NO es un cambio cosmético: los renglones se van con ella, así que el
  //  mes de una empresa baja y el de la otra sube. Por eso se le dice antes,
  //  con la cifra exacta, y ella decide. Si en la otra empresa ya hay alguien
  //  con ese mismo nombre, la mudanza es además una unión: se avisa aparte,
  //  porque después ya no hay dos fichas que separar.
  if (cambiaEmpresa) {
    const previa = simularCambioDeEmpresa(estado.datos, persona.empresa, nuevo, otraEmpresa);
    const desde = persona.empresa;

    const seguro = await confirmar({
      titulo: previa.seFusiona
        ? `Pasarla a ${otraEmpresa} y unirla con la que ya está allá`
        : `Pasar a ${nuevo} a ${otraEmpresa}`,
      mensaje:
        `Se llevan ${previa.renglones} renglones (${pesos(previa.plata)}, ` +
        `${previa.dias} ${previa.dias === 1 ? "día" : "días"}) de ${desde} a ${otraEmpresa}. ` +
        `El mes de ${desde} baja eso mismo y el de ${otraEmpresa} sube.` +
        (previa.seFusiona
          ? ` Y ojo: en ${otraEmpresa} ya hay un "${nuevo}" con ` +
            `${previa.renglonesDeLaOtra} renglones. Van a quedar como una sola ` +
            "persona, y eso no se puede deshacer."
          : ""),
      siTexto: previa.seFusiona ? "Sí, pasarla y unirla" : "Sí, pasarla",
      noTexto: "No",
    });
    if (!seguro) { cambio(); pintarPersonas(raiz); return; }

    const hecho = cambiarDeEmpresa(estado.datos, desde, nuevo, otraEmpresa);
    cambio();
    pintarPersonas(raiz);
    mensaje(
      hecho.seFusiona
        ? `${nuevo} quedó en ${otraEmpresa}, unida con la que ya estaba allá ` +
          `(${hecho.renglones + hecho.renglonesDeLaOtra} renglones en total).`
        : `${nuevo} pasó a ${otraEmpresa} con sus ${hecho.renglones} renglones.`,
      "bien", 8
    );
    return;
  }

  cambio();
  pintarPersonas(raiz);
  mensaje("Guardado.", "bien");
}

// ===========================================================================
//  BORRAR
//
//  Lo que tiene historia no se borra, se apaga. Aquí solo se explica eso en
//  cristiano y se le ofrece el apagado, que es lo que ella quería de verdad:
//  que deje de estorbar al buscar, sin perder lo que ya pasó.
// ===========================================================================

async function quitarPersona(raiz, persona) {
  const { puede, renglones } = puedeBorrarPersona(estado.datos, persona.empresa, persona.nombre);

  if (!puede) {
    const apagar = await confirmar({
      titulo: `${persona.nombre} no se puede borrar`,
      mensaje:
        `Tiene ${renglones} renglones registrados. Si la borrara, ese consumo ` +
        `quedaría sin dueño. ¿La apago? Sale de las listas al anotar y lo ya ` +
        `cobrado se queda igual.`,
      siTexto: "Sí, apagarla",
      noTexto: "Dejarla como está",
    });
    if (!apagar) return;
    persona.activa = false;
    cambio();
    pintarPersonas(raiz);
    mensaje(`${persona.nombre} quedó apagada. Ya no sale al anotar.`, "bien", 6);
    return;
  }

  const seguro = await confirmar({
    titulo: `Borrar a ${persona.nombre}`,
    mensaje:
      `No tiene ningún renglón registrado, así que se puede borrar sin dañar ` +
      `nada. ¿Seguro?`,
    siTexto: "Sí, borrarla",
    peligroso: true,
  });
  if (!seguro) return;

  try {
    borrarPersona(estado.datos, persona.empresa, persona.nombre);
    cambio();
    pintarPersonas(raiz);
    mensaje(`${persona.nombre} se borró de ${persona.empresa}.`, "bien");
  } catch (e) {
    mensaje(e.message, "malo", 9);
  }
}

async function quitarPlato(raiz, producto) {
  const { puede, renglones } = puedeBorrarProducto(estado.datos, producto.nombre);

  if (!puede) {
    const apagar = await confirmar({
      titulo: `"${producto.nombre}" no se puede borrar`,
      mensaje:
        `Está en ${renglones} renglones ya registrados. Si lo borrara, esos ` +
        `renglones quedarían con un plato que no existe. ¿Lo apago? Deja de ` +
        `salir al anotar y lo ya cobrado no cambia.`,
      siTexto: "Sí, apagarlo",
      noTexto: "Dejarlo como está",
    });
    if (!apagar) return;
    producto.activo = false;
    cambio();
    pintarCatalogo(raiz);
    mensaje(`"${producto.nombre}" quedó apagado.`, "bien", 6);
    return;
  }

  const seguro = await confirmar({
    titulo: `Borrar "${producto.nombre}"`,
    mensaje: "Nunca se ha pedido, así que se puede borrar sin dañar nada. ¿Seguro?",
    siTexto: "Sí, borrarlo",
    peligroso: true,
  });
  if (!seguro) return;

  try {
    const r = borrarProducto(estado.datos, producto.nombre);
    cambio();
    pintarCatalogo(raiz);
    mensaje(`"${producto.nombre}" se borró, con sus ${r.precios} precios.`, "bien");
  } catch (e) {
    mensaje(e.message, "malo", 9);
  }
}


// ===========================================================================
//  UNIR DOS PERSONAS A MANO
//
//  La pantalla Revisar solo muestra los nombres que SE PARECEN. Si la misma
//  persona quedo como "JOSE RAMIREZ" y como "PEPE R. GOMEZ", no se parecen en
//  nada, no aparece nunca, y a ella le tocaba renombrar las dos para que
//  coincidieran y solo entonces unirlas. Un rodeo absurdo.
//
//  Aqui se marcan las dos en la lista y se unen. Por dentro usa unirPersonas,
//  que es la misma funcion probada de siempre: mueve los renglones, borra la
//  ficha que sobra y no pierde ni un peso.
// ===========================================================================

function barraDeUnir(raiz, todas) {
  const elegidas = todas.filter((p) => marcadas.has(clavePersona(p.empresa, p.nombre)));
  if (!elegidas.length) return null;

  const empresasDistintas = [...new Set(elegidas.map((p) => normalizar(p.empresa)))];
  const sePuede = elegidas.length >= 2 && empresasDistintas.length === 1;

  return el("section", { clase: "tarjeta barra-unir" },
    el("div", { clase: "fila entre" },
      el("div", {},
        el("strong", { texto:
          elegidas.length === 1
            ? "1 persona marcada"
            : `${elegidas.length} personas marcadas` }),
        el("p", { clase: "nota-suelta", texto: elegidas.map((p) => p.nombre).join("  ·  ") })
      ),
      el("div", { clase: "fila" },
        el("button", {
          clase: "plano chico",
          alHacerClic: () => { marcadas.clear(); pintarPersonas(raiz); },
        }, "Desmarcar"),
        el("button", {
          clase: "principal",
          disabled: !sePuede,
          alHacerClic: () => unirLasMarcadas(raiz, elegidas),
        }, "Unir las marcadas")
      )
    ),

    elegidas.length < 2
      ? el("p", { clase: "nota", texto: "Marque otra para poder unirlas." })
      : empresasDistintas.length > 1
        ? el("p", { clase: "nota ojo" },
            "Están en empresas distintas (", empresasDistintas.join(" y "), "), ",
            "así que desde aquí no se unen: dos personas de empresas distintas ",
            "son, casi siempre, dos personas que se llaman igual. ",
            el("strong", { texto: "Si de verdad es la misma" }),
            ' —se cambió de sede, o se anotó con la empresa equivocada— ábrala ' +
            'con "Editar", cámbiele la empresa, y al llegar a la otra se une ' +
            "sola con la que ya está allá.")
        : null
  );
}

async function unirLasMarcadas(raiz, elegidas) {
  // La que tenga mas renglones va primera: casi siempre es el nombre bueno.
  const conPeso = elegidas.map((p) => ({
    persona: p,
    renglones: estado.datos.consumos.filter(
      (c) => clavePersona(c.empresa, c.persona) === clavePersona(p.empresa, p.nombre)
    ).length,
  })).sort((a, b) => b.renglones - a.renglones);

  const r = await pedirDatos({
    titulo: "¿Cuál nombre se queda?",
    campos: [
      {
        nombre: "bueno",
        etiqueta: "El nombre bueno",
        tipo: "seleccion",
        valor: conPeso[0].persona.nombre,
        opciones: conPeso.map((x) => ({
          valor: x.persona.nombre,
          texto: `${x.persona.nombre}  (${x.renglones} renglones)`,
        })),
        ayuda: "Los otros nombres desaparecen y sus renglones pasan a este.",
      },
    ],
    textoAceptar: "Ver qué va a pasar",
  });
  if (!r) return;

  const empresa = elegidas[0].empresa;
  const otros = elegidas.map((p) => p.nombre).filter((n) => n !== r.bueno);
  const previa = simularUnion(estado.datos, empresa, r.bueno, otros);

  ventana({
    titulo: "¿Unir estas personas?",
    cuerpo: el("div", {},
      el("p", {},
        "Todo lo de ",
        ...otros.map((n, i) => [i ? " y " : "", el("strong", { texto: n })]).flat(),
        " va a quedar a nombre de ", el("strong", { texto: r.bueno }),
        ", en ", el("strong", { texto: empresa }), "."),
      el("dl", { clase: "cifras" },
        cifra("Renglones que se mueven", String(previa.renglones)),
        cifra("Días que tocan", String(previa.dias)),
        cifra("Plata que se mueve", pesos(previa.plata))
      ),
      el("p", { clase: "nota bien" },
        "El total del negocio NO cambia: los renglones son los mismos, solo " +
        "cambian de dueño."),
      previa.facturasQueSePierden > 0
        ? el("p", { clase: "nota ojo" },
            `Ojo: ${previa.facturasQueSePierden} ` +
            (previa.facturasQueSePierden === 1 ? "día tiene" : "días tienen") +
            " los dos nombres comiendo el mismo día. Después de unir van a " +
            "contar como una sola factura, así que ese número va a bajar. " +
            "Revise el Cuadre después.")
        : null
    ),
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Sí, unir",
        clase: "principal",
        alHacerClic: () => {
          const hecho = unirPersonas(estado.datos, empresa, r.bueno, otros);
          marcadas.clear();
          cambio();
          pintarPersonas(raiz);
          mensaje(
            `Unidas. Se movieron ${hecho.renglones} renglones a ${hecho.nombreBueno}.`,
            "bien", 7
          );
        },
      },
    ],
  });
}
