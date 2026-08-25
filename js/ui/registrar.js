// ============================================================================
//  registrar.js  -  "Registrar el día". La pantalla que se usa todos los días.
//
//  Está armada alrededor de UN PEDIDO = UNA PERSONA, no alrededor de renglones
//  sueltos. Por eso:
//    - la fecha se elige UNA vez, en un calendario, nunca escribiéndola;
//    - la empresa se elige UNA vez;
//    - después se va agregando persona por persona, y a cada persona sus platos.
//
//  Con eso se caen tres de los bugs del Excel de una sola vez: la fecha que
//  entraba como texto, el renglón que se quedaba sin empresa, y el segundo
//  plato de la misma persona que no sumaba en ninguna parte.
// ============================================================================

import { el, vaciar, buscador, mensaje, pedirDatos, confirmar, ventana, tabla, cifra, cifraPlata, cinta, colorDeEmpresa, vacio, poner } from "./componentes.js";
import { estado, cambio, empresas, asegurarEmpresa, empresaPorCodigo } from "./estado.js";
import { pesos, fechaLarga, normalizar, hoyISO } from "../nucleo/formato.js";
import {
  delDia, subtotal, contarFacturas, personasDe, precioDe, clavePersona,
} from "../nucleo/calculos.js";
import { nuevoConsumo, agregarPersona, agregarProducto } from "../nucleo/modelo.js";
import {
  limpiarNombre, parecidasEnEmpresa, tocayosEnOtrasEmpresas,
} from "../nucleo/nombres.js";
import {
  pedidoHabitual, tieneCostumbre, platosFrecuentes, loDelDiaAnterior,
  yaAnotadasHoy, cuantoValdria,
} from "../nucleo/habitos.js";

/** La persona cuya comanda se está llenando ahora mismo. */
let personaActiva = null;

export function pintarRegistrar(raiz) {
  vaciar(raiz);
  asegurarEmpresa();

  if (!empresas().length) {
    poner(raiz, 
      el("div", { clase: "encabezado-pantalla" }, el("div", {}, el("h1", { texto: "Registrar el día" }))),
      vacio(
        "Todavía no hay empresas",
        el("p", {}, "Antes de registrar pedidos hay que crear al menos una empresa. ",
          el("a", { href: "#empresas", texto: "Ir a Empresas" }), ".")
      )
    );
    return;
  }

  poner(raiz, 
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Registrar el día" }),
        el("p", { texto: "Elija el día y la empresa, y vaya agregando persona por persona." })
      )
    ),
    barraDeMando(raiz),
    tarjetaDeAyer(raiz),
    cajaDeCaptura(raiz),
    resumenEnVivo(),
    listaDeComandas(raiz)
  );
}

// ---------------------------------------------------------------------------
//  Arriba: el día y la empresa. Se eligen una vez y mandan sobre todo.
// ---------------------------------------------------------------------------

function barraDeMando(raiz) {
  const fecha = el("input", {
    type: "date",
    id: "campo-fecha",
    value: estado.fecha,
    max: "2100-12-31",
    alCambiar: (e) => {
      // Si borra la fecha, el navegador manda "". No dejamos que la app
      // se quede sin día: se vuelve al de hoy y se avisa.
      if (!e.target.value) {
        estado.fecha = hoyISO();
        mensaje("Toda anotación necesita un día. Volví a poner el de hoy.", "ojo");
      } else {
        estado.fecha = e.target.value;
      }
      personaActiva = null;
      pintarRegistrar(raiz);
    },
  });

  const empresa = el("select", {
    id: "campo-empresa",
    alCambiar: (e) => {
      estado.empresa = e.target.value;
      personaActiva = null;
      pintarRegistrar(raiz);
    },
  }, ...empresas().map((emp) => el("option", { value: emp.codigo, selected: emp.codigo === estado.empresa }, emp.codigo)));

  return el("div", { clase: "mando" },
    el("div", { clase: "campo" },
      el("label", { for: "campo-fecha", texto: "Día" }),
      fecha,
      el("small", { estilo: "color:var(--tinta-suave)", texto: fechaLarga(estado.fecha) || "Elija un día" })
    ),
    el("div", { clase: "campo" },
      el("label", { for: "campo-empresa", texto: "Empresa" }),
      empresa,
      el("small", { estilo: "color:var(--tinta-suave)", texto: (empresaPorCodigo(estado.empresa) || {}).razonSocial || "" })
    )
  );
}

// ---------------------------------------------------------------------------
//  El corazón: elegir persona y agregarle platos
// ---------------------------------------------------------------------------

function cajaDeCaptura(raiz) {
  // La clase "caja-captura" no es decorativa: le da a esta tarjeta una capa
  // propia por encima de las siguientes. Sin eso, la lista de nombres que se
  // despliega queda POR DEBAJO de las cifras y las comandas, y no se puede ni
  // leer ni tocar. (Lo provocaron las animaciones: animar transform crea una
  // capa nueva, y una capa nueva encierra a sus hijos.)
  const caja = el("div", { clase: "tarjeta caja-captura" });
  const gente = personasDe(estado.datos, estado.empresa);

  const buscaPersona = buscador({
    etiqueta: "¿Quién comió?",
    placeholder: `Escriba el nombre (hay ${gente.length} personas en ${estado.empresa})`,
    opciones: gente.map((p) => ({
      texto: p.nombre,
      valor: p.nombre,
      apunte: p.empresaFactura !== p.empresaCome ? "se le cobra a " + p.empresaFactura : "",
    })),
    alElegir: (nombre) => { personaActiva = nombre; pintarRegistrar(raiz); },
    alCrear: (nombre) => crearPersona(nombre, raiz),
    textoCrear: (t) => `Crear a "${t}" en ${estado.empresa}`,
  });

  poner(caja, 
    el("h3", { texto: "Agregar pedido" }),
    buscaPersona.nodo
  );

  if (personaActiva) {
    poner(caja, comandaEnCurso(raiz));
  } else {
    poner(caja, 
      el("p", {
        estilo: "margin:var(--e3) 0 0;color:var(--tinta-suave);font-size:var(--t-sm)",
        texto: "Elija una persona de la lista para empezar a anotarle los platos.",
      })
    );
    setTimeout(() => buscaPersona.enfocar(), 40);
  }
  return caja;
}

/** La comanda de la persona activa, con su buscador de platos. */
function comandaEnCurso(raiz) {
  const persona = estado.datos.personas.find(
    (p) => clavePersona(p.empresaCome, p.nombre) === clavePersona(estado.empresa, personaActiva)
  );
  const facturaA = persona ? persona.empresaFactura : estado.empresa;

  const buscaPlato = buscador({
    etiqueta: `Platos de ${personaActiva}`,
    placeholder: "Escriba el plato y pulse Enter",
    opciones: estado.datos.productos
      .filter((p) => p.activo !== false)
      .map((p) => {
        const v = precioDe(estado.datos, p.nombre, facturaA);
        return { texto: p.nombre, valor: p.nombre, apunte: v === null ? "sin precio" : pesos(v) };
      })
      .sort((a, b) => a.texto.localeCompare(b.texto, "es")),
    alElegir: (plato) => { agregarPlato(plato, raiz); },
    alCrear: (plato) => crearPlato(plato, facturaA, raiz),
    textoCrear: (t) => `Crear el plato "${t}"`,
  });

  const mios = renglonesDe(personaActiva);
  const caja = el("div", {
    estilo: `margin-top:var(--e4);padding-top:var(--e4);border-top:2px dashed var(--borde)`,
  });

  poner(caja, 
    el("div", { clase: "entre" },
      el("h4", {},
        personaActiva,
        facturaA !== estado.empresa
          ? el("span", { estilo: "font-weight:400;color:var(--tinta-suave);font-size:var(--t-sm)", texto: `  ·  se le cobra a ${facturaA}` })
          : null
      ),
      el("button", {
        clase: "chico",
        alHacerClic: () => { personaActiva = null; pintarRegistrar(raiz); },
      }, "Terminar con esta persona")
    ),
    atajosDePedido(raiz, facturaA, mios.length),
    buscaPlato.nodo,
    mios.length ? tablaDePlatos(mios, raiz) : el("p", {
      estilo: "margin:var(--e3) 0 0;color:var(--tinta-suave);font-size:var(--t-sm)",
      texto: "Todavía no le ha anotado nada.",
    })
  );
  setTimeout(() => buscaPlato.enfocar(), 40);
  return caja;
}

/** Los platos de la persona activa, con sus botones de cantidad y borrar. */
function tablaDePlatos(renglones, raiz) {
  const cuerpo = renglones.map((c) => {
    const problema = c.facturable !== false && !(c.precioUnitario > 0);
    return el("tr", {},
      el("td", {},
        c.producto,
        problema
          ? el("div", { estilo: "color:var(--rojo);font-size:var(--t-xs)" }, "Sin precio. ",
              el("button", {
                clase: "plano chico",
                estilo: "color:var(--rojo);text-decoration:underline",
                alHacerClic: () => ponerPrecio(c, raiz),
              }, "Póngale precio"))
          : null,
        c.facturable === false
          ? el("div", { estilo: "color:var(--tinta-suave);font-size:var(--t-xs)", texto: "No se le cobra" })
          : null
      ),
      el("td", { clase: "n", estilo: "white-space:nowrap" },
        el("button", { clase: "chico", "aria-label": "Quitar uno", alHacerClic: () => cambiarCantidad(c, -1, raiz) }, "−"),
        el("span", { clase: "num", estilo: "display:inline-block;min-width:2ch;text-align:center;margin:0 .3rem", texto: String(c.cantidad) }),
        el("button", { clase: "chico", "aria-label": "Agregar uno", alHacerClic: () => cambiarCantidad(c, +1, raiz) }, "+")
      ),
      el("td", { clase: "n", texto: pesos(c.precioUnitario) }),
      el("td", { clase: "n", texto: pesos(subtotal(c)) }),
      el("td", { clase: "n", estilo: "white-space:nowrap" },
        el("button", {
          clase: "chico",
          title: c.facturable === false ? "Volver a cobrarlo" : "Marcar que no se le cobra",
          alHacerClic: () => { c.facturable = c.facturable === false; recalcularRevisar(c); cambio(); pintarRegistrar(raiz); },
        }, c.facturable === false ? "Cobrar" : "No cobrar"),
        el("button", {
          clase: "chico peligro",
          estilo: "margin-left:.3rem",
          "aria-label": `Borrar ${c.producto}`,
          alHacerClic: () => borrarRenglon(c, raiz),
        }, "Borrar")
      )
    );
  });

  const total = renglones.reduce((a, c) => a + subtotal(c), 0);
  return el("div", { clase: "marco-tabla", estilo: "margin-top:var(--e3)" },
    el("table", {},
      el("thead", {}, el("tr", {},
        el("th", { texto: "Plato" }),
        el("th", { clase: "n", texto: "Cantidad" }),
        el("th", { clase: "n", texto: "Precio" }),
        el("th", { clase: "n", texto: "Suma" }),
        el("th", { clase: "n", texto: "" })
      )),
      el("tbody", {}, ...cuerpo),
      el("tfoot", {}, el("tr", {},
        el("td", { colspan: "3", texto: "Total de esta persona" }),
        el("td", { clase: "n", texto: pesos(total) }),
        el("td", {})
      ))
    )
  );
}

// ---------------------------------------------------------------------------
//  Los números del día, en vivo
// ---------------------------------------------------------------------------

function resumenEnVivo() {
  const delDiaTodas = delDia(estado.datos.consumos, estado.fecha);
  const deLaEmpresa = delDiaTodas.filter((c) => c.empresaCome === estado.empresa);
  const total = deLaEmpresa.reduce((a, c) => a + subtotal(c), 0);
  const totalTodas = delDiaTodas.reduce((a, c) => a + subtotal(c), 0);

  return el("dl", { clase: "cifras", estilo: "margin:0 0 var(--e5)" },
    cifra(`Comandas de ${estado.empresa}`, String(contarFacturas(deLaEmpresa)), true),
    cifraPlata(`Suma de ${estado.empresa}`, total, true),
    cifra("Comandas del día (todas)", String(contarFacturas(delDiaTodas))),
    cifraPlata("Suma del día (todas)", totalTodas)
  );
}

// ---------------------------------------------------------------------------
//  Las comandas ya anotadas
// ---------------------------------------------------------------------------

function listaDeComandas(raiz) {
  const renglones = delDia(estado.datos.consumos, estado.fecha).filter((c) => c.empresaCome === estado.empresa);

  if (!renglones.length) {
    return el("div", {},
      el("h3", { estilo: "margin-bottom:var(--e3)", texto: "Comandas de hoy" }),
      vacio(`Todavía no hay nada anotado para ${estado.empresa}`, "Busque la primera persona arriba y agréguele sus platos.")
    );
  }

  // Agrupamos por persona: cada persona es UNA comanda, con todos sus platos.
  const porPersona = new Map();
  for (const c of renglones) {
    if (!porPersona.has(c.persona)) porPersona.set(c.persona, []);
    porPersona.get(c.persona).push(c);
  }
  const orden = [...porPersona.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));

  const tarjetas = orden.map(([nombre, platos], i) => {
    const total = platos.reduce((a, c) => a + subtotal(c), 0);
    const hayProblema = platos.some((c) => c.revisar && c.revisar.length);
    const facturaA = platos[0].empresaFactura;

    return el("article", {
      clase: "comanda",
      datos: { revisar: hayProblema ? "si" : "no" },
      estilo: `--cinta:${colorDeEmpresa(facturaA)}`,
    },
      el("header", { clase: "comanda-cabeza" },
        el("span", { clase: "comanda-numero", texto: String(i + 1).padStart(2, "0") }),
        el("h4", { clase: "comanda-nombre" },
          nombre,
          facturaA !== estado.empresa
            ? el("span", { clase: "comanda-nota", texto: `se le cobra a ${facturaA}` })
            : null
        )
      ),
      el("ul", { clase: "comanda-platos" },
        ...platos.map((c) =>
          el("li", { clase: c.facturable === false ? "gratis" : "" },
            el("span", { clase: "comanda-cant", texto: c.cantidad + "×" }),
            el("span", { clase: "comanda-plato", texto: c.producto }),
            el("span", { clase: "comanda-valor", texto: c.facturable === false ? "no cobra" : pesos(subtotal(c)) }),
            el("button", {
              clase: "plano chico",
              "aria-label": `Borrar ${c.producto} de ${nombre}`,
              title: "Borrar este plato",
              alHacerClic: () => borrarRenglon(c, raiz),
            }, "×")
          )
        )
      ),
      hayProblema
        ? el("p", { estilo: "margin:0;padding:0 var(--e3) var(--e2);color:var(--rojo);font-size:var(--t-xs)", texto: "Hay un plato sin precio. Ábrala para arreglarlo." })
        : null,
      el("footer", { clase: "comanda-pie" },
        el("button", {
          clase: "chico",
          alHacerClic: () => { personaActiva = nombre; pintarRegistrar(raiz); window.scrollTo({ top: 0, behavior: "smooth" }); },
        }, "Abrir"),
        el("span", { clase: "comanda-total", texto: pesos(total) })
      )
    );
  });

  const totalDia = renglones.reduce((a, c) => a + subtotal(c), 0);
  return el("div", {},
    el("div", { clase: "entre", estilo: "margin-bottom:var(--e3)" },
      el("h3", {}, "Comandas de hoy ", cinta(estado.empresa)),
      el("span", { clase: "plata", estilo: "font-size:var(--t-lg);font-weight:600" },
        `${orden.length} comandas · ${pesos(totalDia)}`)
    ),
    el("div", { clase: "comandas" }, ...tarjetas)
  );
}

// ---------------------------------------------------------------------------
//  Las acciones
// ---------------------------------------------------------------------------

function renglonesDe(nombre) {
  return estado.datos.consumos.filter(
    (c) => c.fecha === estado.fecha && c.empresaCome === estado.empresa && c.persona === nombre
  );
}

// ---------------------------------------------------------------------------
//  "Los mismos de ayer"
//
//  En una fábrica come casi siempre la misma gente. Buscar a las 18 personas
//  una por una, todos los días, es el grueso del trabajo. Aquí se trae la
//  lista del último día registrado y ella solo desmarca a los que faltaron.
//
//  Solo aparece cuando el día está en blanco: si ya empezó a anotar, meterle
//  la lista de ayer encima sería duplicarle el trabajo, no ahorrárselo.
// ---------------------------------------------------------------------------

function tarjetaDeAyer(raiz) {
  const hoyEnEstaEmpresa = delDia(estado.datos.consumos, estado.fecha)
    .filter((c) => normalizar(c.empresaCome) === normalizar(estado.empresa));
  if (hoyEnEstaEmpresa.length) return null;

  const ayer = loDelDiaAnterior(estado.datos, estado.empresa, estado.fecha);
  if (!ayer || !ayer.gente.length) return null;

  return el("section", { clase: "tarjeta tarjeta-ayer" },
    el("div", { clase: "fila entre" },
      el("div", {},
        el("h3", { texto: `El ${fechaLarga(ayer.fecha)} comieron ${ayer.gente.length} en ${estado.empresa}` }),
        el("p", { clase: "nota", texto: "Si hoy es parecido, tráigalos y quite a los que faltaron." })
      ),
      el("button", {
        clase: "principal",
        alHacerClic: () => ventanaDeAyer(raiz, ayer),
      }, "Traer la lista de ese día")
    )
  );
}

function ventanaDeAyer(raiz, ayer) {
  const yaEstan = yaAnotadasHoy(estado.datos, estado.empresa, estado.fecha);
  const marcados = new Map(ayer.gente.map((g) => [g.persona, !yaEstan.has(g.persona)]));

  const filas = ayer.gente.map((g) => {
    const resumen = g.platos
      .map((p) => (p.cantidad > 1 ? `${p.cantidad} ${p.producto}` : p.producto))
      .join(" + ");
    const casilla = el("input", {
      type: "checkbox",
      checked: marcados.get(g.persona),
      alCambiar: (ev) => marcados.set(g.persona, ev.target.checked),
    });
    return el("tr", { clase: yaEstan.has(g.persona) ? "apagada" : "" },
      el("td", {}, casilla),
      el("td", {}, el("strong", { texto: g.persona })),
      el("td", { texto: resumen }),
      el("td", { clase: "dato", texto: yaEstan.has(g.persona) ? "ya está hoy" : "" })
    );
  });

  const cuerpo = el("div", {},
    el("p", {},
      "Se les va a anotar hoy lo mismo que pidieron el ",
      el("strong", { texto: fechaLarga(ayer.fecha) }), "."),
    el("p", { clase: "nota" },
      "Los precios que se guardan son los de HOY, no los de ese día. Después " +
      "puede cambiarle el pedido a cualquiera."),
    el("div", { clase: "fila" },
      el("button", {
        clase: "plano chico",
        alHacerClic: (ev) => {
          const cuadros = ev.target.closest(".ventana-cuerpo").querySelectorAll('input[type="checkbox"]');
          const prender = [...cuadros].some((c) => !c.checked);
          cuadros.forEach((c, i) => {
            c.checked = prender;
            marcados.set(ayer.gente[i].persona, prender);
          });
        },
      }, "Marcar o desmarcar todos")
    ),
    tabla([{ titulo: "" }, { titulo: "Persona" }, { titulo: "Pidió" }, { titulo: "", clase: "dato" }], filas)
  );

  ventana({
    titulo: "Los mismos de ese día",
    cuerpo,
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Anotarlos",
        clase: "principal",
        alHacerClic: () => {
          const elegidos = ayer.gente.filter((g) => marcados.get(g.persona));
          if (!elegidos.length) { mensaje("No marcó a nadie.", "ojo"); return; }

          let personas = 0;
          let renglones = 0;
          for (const g of elegidos) {
            const persona = estado.datos.personas.find(
              (p) => clavePersona(p.empresaCome, p.nombre) === clavePersona(estado.empresa, g.persona)
            );
            if (!persona) continue; // ya no está en la empresa: se salta
            const facturaA = persona.empresaFactura || estado.empresa;
            for (const plato of g.platos) {
              // El precio se congela con el catálogo de HOY, no con el de ese
              // día: si subió el almuerzo, lo de hoy se cobra a lo de hoy.
              const precio = precioDe(estado.datos, plato.producto, facturaA);
              estado.datos.consumos.push(nuevoConsumo({
                fecha: estado.fecha,
                empresaCome: estado.empresa,
                persona: persona.nombre,
                empresaFactura: facturaA,
                producto: plato.producto,
                cantidad: plato.cantidad,
                precioUnitario: precio === null ? 0 : precio,
                facturable: plato.facturable,
              }));
              renglones++;
            }
            personas++;
          }
          cambio();
          pintarRegistrar(raiz);
          mensaje(`Anotadas ${personas} personas, ${renglones} renglones.`, "bien", 6);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
//  Atajos: lo que hace que no haya que escribir nada
//
//  De los 896 pedidos de agosto, el 61 % es exactamente lo que esa misma
//  persona pide todos los días, y un solo plato (ALMUERZO) es el 37 % de todo.
//  Así que la mayoría de las veces no hay nada que buscar: ya sabemos qué va
//  a pedir. Estos botones convierten "buscar, escribir, elegir" en un toque.
//
//  Ojo: son ATAJOS, no automatismos. Nada se anota sin que ella lo toque.
// ---------------------------------------------------------------------------

function atajosDePedido(raiz, facturaA, yaTieneAlgo) {
  const caja = el("div", { clase: "atajos" });

  // 1) Lo de siempre. Solo si todavía no le ha anotado nada hoy: si ya empezó,
  //    ofrecerle "repetir" sería confuso y podría duplicarle el pedido.
  if (!yaTieneAlgo) {
    const habito = pedidoHabitual(estado.datos, estado.empresa, personaActiva, estado.fecha);
    if (tieneCostumbre(habito)) {
      const { total, faltaPrecio } = cuantoValdria(estado.datos, habito.platos, facturaA);
      const resumen = habito.platos
        .map((p) => (p.cantidad > 1 ? `${p.cantidad} ${p.producto}` : p.producto))
        .join(" + ");

      poner(caja, 
        el("button", {
          clase: "principal lo-de-siempre",
          alHacerClic: () => {
            for (const p of habito.platos) {
              for (let i = 0; i < p.cantidad; i++) agregarPlato(p.producto, raiz);
            }
          },
        },
          el("strong", { texto: "Lo de siempre" }),
          el("small", { texto: resumen + (faltaPrecio ? "  ·  ojo, falta un precio" : `  ·  ${pesos(total)}`) })
        ),
        el("span", { clase: "nota atajo-porque" },
          habito.veces === habito.dias
            ? `es lo que ha pedido las ${habito.dias} veces`
            : `${habito.veces} de sus ${habito.dias} días`)
      );
    }
  }

  // 2) Los platos que más se piden en esta empresa, a un toque.
  const frecuentes = platosFrecuentes(estado.datos, estado.empresa, {
    limite: 5,
    empresaFactura: facturaA,
  });
  if (frecuentes.length) {
    poner(caja, 
      el("div", { clase: "fila fichas-platos" },
        ...frecuentes.map((f) =>
          el("button", {
            clase: "ficha-plato",
            title: `${f.producto} — ${pesos(f.precio)}`,
            alHacerClic: () => agregarPlato(f.producto, raiz),
          },
            el("span", { texto: f.producto }),
            el("small", { texto: pesos(f.precio) })
          )
        )
      )
    );
  }

  return caja.children.length ? caja : null;
}

function agregarPlato(plato, raiz) {
  const persona = estado.datos.personas.find(
    (p) => clavePersona(p.empresaCome, p.nombre) === clavePersona(estado.empresa, personaActiva)
  );
  if (!persona) {
    mensaje(`${personaActiva} ya no está en ${estado.empresa}. Vuelva a elegir la persona.`, "malo", 7);
    personaActiva = null;
    pintarRegistrar(raiz);
    return;
  }
  const facturaA = persona.empresaFactura || estado.empresa;

  // Si ya le habían anotado ese mismo plato hoy, se le suma uno en vez de
  // abrir un renglón nuevo. Así la comanda no se llena de renglones repetidos.
  const yaEsta = renglonesDe(personaActiva).find(
    (c) => c.producto === normalizar(plato) && c.facturable !== false
  );
  if (yaEsta) {
    yaEsta.cantidad += 1;
    recalcularRevisar(yaEsta);
    cambio();
    pintarRegistrar(raiz);
    mensaje(`${plato}: van ${yaEsta.cantidad}.`, "bien", 2);
    return;
  }

  const precio = precioDe(estado.datos, plato, facturaA);
  const renglon = nuevoConsumo({
    fecha: estado.fecha,
    empresaCome: estado.empresa,
    persona: personaActiva,
    empresaFactura: facturaA,
    producto: plato,
    cantidad: 1,
    precioUnitario: precio === null ? 0 : precio,
  });
  estado.datos.consumos.push(renglon);
  cambio();
  pintarRegistrar(raiz);
  if (precio === null) {
    mensaje(`"${plato}" no tiene precio para ${facturaA}. Quedó en $ 0 y marcado en rojo.`, "ojo", 7);
  }
}

function cambiarCantidad(renglon, delta, raiz) {
  const nueva = renglon.cantidad + delta;
  if (nueva <= 0) { borrarRenglon(renglon, raiz); return; }
  renglon.cantidad = nueva;
  recalcularRevisar(renglon);
  cambio();
  pintarRegistrar(raiz);
}

async function borrarRenglon(renglon, raiz) {
  const seguro = await confirmar({
    titulo: "Borrar este plato",
    mensaje: `Se va a borrar ${renglon.cantidad} × ${renglon.producto} de ${renglon.persona}. Esto no se puede deshacer.`,
    siTexto: "Sí, borrarlo",
    peligroso: true,
  });
  if (!seguro) return;
  const i = estado.datos.consumos.indexOf(renglon);
  if (i >= 0) estado.datos.consumos.splice(i, 1);
  cambio();
  pintarRegistrar(raiz);
  mensaje("Plato borrado.", "bien", 2);
}

async function ponerPrecio(renglon, raiz) {
  const datos = await pedirDatos({
    titulo: `Precio de ${renglon.producto}`,
    campos: [
      {
        nombre: "precio",
        etiqueta: `¿Cuánto vale para ${renglon.empresaFactura}?`,
        tipo: "number",
        valor: "",
        requerido: true,
        min: 0,
      },
      {
        nombre: "guardarEnCatalogo",
        etiqueta: "Guardarlo también en el catálogo, para las próximas veces",
        tipo: "casilla",
        valor: true,
      },
    ],
    textoAceptar: "Poner el precio",
  });
  if (!datos) return;
  const valor = Number(datos.precio) || 0;
  renglon.precioUnitario = valor;
  recalcularRevisar(renglon);
  if (datos.guardarEnCatalogo) {
    // El catálogo guarda el nombre ya limpio, así que este renglón tiene que
    // quedar con ese mismo nombre limpio. Si no, el precio quedaría guardado
    // bajo "ARROZ" y el renglón seguiría diciendo "ARROZ." y nunca se
    // encontrarían: es exactamente el error que estamos matando.
    renglon.producto = limpiarNombre(renglon.producto);
    agregarProducto(estado.datos, renglon.producto, { [renglon.empresaFactura]: valor });
  }
  cambio();
  pintarRegistrar(raiz);
  mensaje(`${renglon.producto} quedó en ${pesos(valor)}.`, "bien");
}

/** Vuelve a mirar si el renglón tiene algún problema. Se llama en cada cambio. */
function recalcularRevisar(c) {
  const revisar = [];
  if (c.facturable !== false && !(c.precioUnitario > 0)) revisar.push("SIN_PRECIO");
  if (!(c.cantidad > 0)) revisar.push("SIN_CANTIDAD");
  c.revisar = revisar;
}

/**
 * La defensa contra los nombres repetidos, en el momento exacto en que se
 * podrían crear. Un duplicado que nunca nace no hay que arreglarlo después.
 *
 * Devuelve el nombre de la persona que hay que usar, o "ES OTRA" si de verdad
 * es alguien nuevo, o null si prefirió cancelar.
 */
function preguntarSiEsLaMisma(nombre, parecidas) {
  return new Promise((resolver) => {
    let respuesta = null;

    const cuerpo = el("div", {},
      el("p", {},
        "Antes de crear a ", el("strong", { texto: nombre }),
        `, mire: en ${estado.empresa} ya hay `,
        parecidas.length === 1 ? "alguien con un nombre casi igual." : "gente con nombres casi iguales."),
      el("p", { clase: "nota" },
        "Si es la misma persona, tóquela y seguimos con ella. Así no queda el " +
        "consumo partido en dos.")
    );

    const opciones = el("div", { clase: "opciones-parecidas" });
    for (const p of parecidas.slice(0, 6)) {
      opciones.append(
        el("button", {
          clase: "opcion-parecida",
          alHacerClic: () => { respuesta = p.persona.nombre; cerrar(); },
        },
          el("strong", { texto: p.persona.nombre }),
          el("small", { texto: p.razon })
        )
      );
    }
    opciones.append(
      el("button", {
        clase: "opcion-parecida es-otra",
        alHacerClic: () => { respuesta = "ES OTRA"; cerrar(); },
      },
        el("strong", { texto: `No, ${nombre} es otra persona` }),
        el("small", { texto: "Se crea nueva, aparte de las de arriba" })
      )
    );
    cuerpo.append(opciones);

    const { cerrar } = ventana({
      titulo: "¿Es la misma persona?",
      cuerpo,
      botones: [{ texto: "Cancelar", alHacerClic: () => { respuesta = null; } }],
      alCerrar: () => resolver(respuesta),
    });
  });
}

async function crearPersona(nombreEscrito, raiz) {
  // Lo primero: quitarle los puntos y los espacios de sobra a lo que escribió.
  const nombre = limpiarNombre(nombreEscrito);
  if (!nombre) { mensaje("Escriba un nombre.", "ojo"); return; }

  // Lo segundo: ¿ya hay alguien casi igual en ESTA empresa?
  // Solo miramos esta empresa: los tocayos de otras sedes son personas
  // distintas y no tienen nada que ver.
  const parecidas = parecidasEnEmpresa(estado.datos, nombre, estado.empresa)
    .filter((p) => p.fuerza >= 2);

  if (parecidas.length) {
    const elegida = await preguntarSiEsLaMisma(nombre, parecidas);
    if (elegida === null) return;            // canceló
    if (elegida !== "ES OTRA") {             // era una que ya existía
      personaActiva = elegida;
      pintarRegistrar(raiz);
      mensaje(`Seguimos con ${elegida}, que ya estaba.`, "bien");
      return;
    }
  }

  const lista = empresas();
  const datos = await pedirDatos({
    titulo: `Crear a ${nombre}`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "text", valor: nombre, requerido: true },
      {
        nombre: "empresaFactura",
        etiqueta: "¿A qué empresa se le cobra?",
        tipo: "seleccion",
        valor: estado.empresa,
        opciones: lista.map((e) => ({ valor: e.codigo, texto: e.codigo + " — " + e.razonSocial })),
        ayuda: "Casi siempre es la misma donde come. Cámbielo solo si se le cobra a otra.",
      },
    ],
    textoAceptar: "Crear y usar",
  });
  if (!datos) return;
  try {
    agregarPersona(estado.datos, {
      nombre: datos.nombre,
      empresaCome: estado.empresa,
      empresaFactura: datos.empresaFactura,
    });
  } catch (e) {
    mensaje(e.message, "malo", 6);
    return;
  }
  personaActiva = limpiarNombre(datos.nombre);
  cambio();
  pintarRegistrar(raiz);

  // Si el mismo nombre existe en otra empresa, se lo decimos. No es un error
  // (son personas distintas), pero si no se avisa, después ve el nombre
  // repetido en las listas y cree que se dañó algo.
  const tocayos = tocayosEnOtrasEmpresas(estado.datos, personaActiva, estado.empresa);
  if (tocayos.length) {
    const donde = [...new Set(tocayos.map((t) => t.empresaCome))].join(" y ");
    mensaje(
      `${personaActiva} quedó en ${estado.empresa}. Ojo: hay otra persona con ` +
      `ese mismo nombre en ${donde}, y son distintas.`,
      "ojo", 8
    );
  } else {
    mensaje(`${personaActiva} quedó en ${estado.empresa}.`, "bien");
  }
}

async function crearPlato(plato, facturaA, raiz) {
  const lista = empresas();
  const datos = await pedirDatos({
    titulo: `Crear el plato "${plato}"`,
    campos: [
      { nombre: "nombre", etiqueta: "Nombre del plato", tipo: "text", valor: plato, requerido: true },
      { nombre: "precio", etiqueta: `Precio para ${facturaA}`, tipo: "number", valor: "", requerido: true, min: 0 },
      {
        nombre: "todas",
        etiqueta: "Vale lo mismo en todas las empresas",
        tipo: "casilla",
        valor: true,
        ayuda: "Si en alguna vale distinto, después se cambia en la pantalla Catálogo.",
      },
    ],
    textoAceptar: "Crear y anotar",
  });
  if (!datos) return;
  const valor = Number(datos.precio) || 0;
  const precios = {};
  if (datos.todas) for (const e of lista) precios[e.codigo] = valor;
  else precios[facturaA] = valor;
  agregarProducto(estado.datos, datos.nombre, precios);
  cambio();
  agregarPlato(limpiarNombre(datos.nombre), raiz);
  mensaje(`"${limpiarNombre(datos.nombre)}" quedó en el catálogo a ${pesos(valor)}.`, "bien");
}
