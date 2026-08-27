// ============================================================================
//  datos.js (pantalla)  -  "Datos y respaldos"
//
//  Aquí está lo que da miedo tocar, y por eso todo pregunta dos veces y todo
//  dice antes qué va a pasar:
//
//   - Traer el Excel viejo (una sola vez, al empezar).
//   - La carpeta del computador donde queda la copia buena.
//   - Bajar y devolver un respaldo.
//   - Los renglones que quedaron con algún problema.
//   - Borrar todo (bien escondido y con doble pregunta).
// ============================================================================

import {
  el, vaciar, mensaje, confirmar, ventana, tabla, cinta, cifra, vacio, acciones,
  poner,
} from "./componentes.js";
import { estado, cambio, sincronizarPeriodo, asegurarEmpresa } from "./estado.js";
import { pesos, fechaCorta, nombreMes, normalizar } from "../nucleo/formato.js";
import { revisarTodo } from "../nucleo/calculos.js";
import { hojasDesdeArchivo } from "../datos/excel.js";
import { importar } from "../nucleo/importador.js";
import { exportarTodoAExcel } from "../exportar/excel-export.js";
import * as almacen from "../datos/almacen.js";

export function pintarDatos(raiz) {
  vaciar(raiz);
  const datos = estado.datos;

  poner(raiz,
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Datos y respaldos" }),
        el("p", { texto: "Dónde se guarda todo y cómo no perderlo nunca." })
      )
    ),
    el("dl", { clase: "cifras" },
      cifra("Renglones guardados", String(datos.consumos.length)),
      cifra("Personas", String(datos.personas.length)),
      cifra("Platos", String(datos.productos.length)),
      cifra("Empresas", String(datos.empresas.length))
    ),
    tarjetaCarpeta(raiz),
    tarjetaRespaldos(raiz),
    tarjetaProblemas(raiz),
    tarjetaImportar(raiz),
    tarjetaPeligro(raiz)
  );
}

// ---------------------------------------------------------------------------
//  La carpeta del computador: la copia que sobrevive a todo
// ---------------------------------------------------------------------------

function tarjetaCarpeta(raiz) {
  const puede = almacen.soportaCarpeta();
  const conectada = almacen.hayCarpeta();

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "La carpeta donde queda la copia buena" }),

    !puede
      ? el("div", {},
          el("p", { clase: "nota malo" },
            "Este navegador no deja guardar en una carpeta del computador. " +
            "Pasa siempre en el celular y en Firefox."),
          el("p", {},
            "No es grave, pero entonces la única copia vive dentro del navegador, " +
            "y si alguien le da a “limpiar el caché” se borra. ",
            el("strong", { texto: "Baje el respaldo seguido" }),
            " con el botón de abajo. En el computador, con Chrome o Edge, sí funciona."))
      : conectada
        ? el("div", {},
            el("p", { clase: "nota bien" },
              `Conectada a la carpeta “${almacen.nombreCarpeta()}”.`),
            el("p", {},
              "Cada vez que usted cambia algo, ahí queda el archivo ",
              el("code", { texto: "datos.json" }),
              " al día, y una copia con la fecha en la subcarpeta ",
              el("code", { texto: "respaldos" }), "."),
            el("p", { clase: "nota" },
              "Si esa carpeta está dentro de OneDrive o de Drive, los datos " +
              "quedan además guardados en internet sin que usted haga nada."))
        : el("div", {},
            el("p", { clase: "nota ojo" }, "Todavía no hay carpeta conectada."),
            el("p", {},
              "Ahora mismo los datos solo viven dentro del navegador. Conecte una " +
              "carpeta y quedan también en un archivo de verdad, que se puede " +
              "copiar a una USB."),
            el("button", {
              clase: "principal grande",
              alHacerClic: async () => {
                try {
                  await almacen.elegirCarpeta();
                  await almacen.guardarYa();
                  mensaje("Carpeta conectada. Ahí queda todo al día.", "bien", 6);
                  pintarDatos(raiz);
                } catch (e) {
                  mensaje("No se pudo conectar la carpeta: " + e.message, "malo", 7);
                }
              },
            }, "Elegir la carpeta"))
  );
}

// ---------------------------------------------------------------------------
//  Respaldo a mano
// ---------------------------------------------------------------------------

function tarjetaRespaldos(raiz) {
  const entrada = el("input", {
    type: "file",
    accept: ".json,application/json",
    clase: "oculto",
    alCambiar: async (ev) => {
      const archivo = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!archivo) return;
      await devolverRespaldo(raiz, archivo);
    },
  });

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "Respaldo: el paracaídas" }),
    el("p", {},
      "Un archivo con TODO adentro. Guárdelo en el correo o en una USB. " +
      "Si un día se daña el computador, con ese archivo vuelve todo."),
    acciones(
      el("button", {
        clase: "principal",
        alHacerClic: () => {
          almacen.descargarRespaldo(estado.datos);
          mensaje("Respaldo bajado. Búsquelo en Descargas.", "bien", 6);
        },
      }, "Bajar un respaldo ahora"),
      el("button", { clase: "plano", alHacerClic: () => entrada.click() }, "Devolver un respaldo"),
      el("button", {
        clase: "plano",
        alHacerClic: async () => {
          try {
            await exportarTodoAExcel(estado.datos);
            mensaje("Excel bajado.", "bien");
          } catch (e) {
            mensaje("No se pudo hacer el Excel: " + e.message, "malo", 6);
          }
        },
      }, "Bajar todo en Excel")
    ),
    entrada
  );
}

async function devolverRespaldo(raiz, archivo) {
  let nuevos;
  try {
    nuevos = await almacen.leerRespaldo(archivo);
  } catch (e) {
    mensaje(e.message, "malo", 9);
    return;
  }

  const seguro = await confirmar({
    titulo: "Devolver el respaldo",
    mensaje:
      `Ese archivo trae ${nuevos.consumos.length} renglones y ` +
      `${nuevos.personas.length} personas. Va a REEMPLAZAR lo que hay ahora ` +
      `(${estado.datos.consumos.length} renglones). Lo de ahora se pierde.`,
    siTexto: "Sí, reemplazar",
    peligroso: true,
  });
  if (!seguro) return;

  estado.datos = nuevos;
  sincronizarPeriodo();
  asegurarEmpresa();
  cambio();
  pintarDatos(raiz);
  mensaje(`Listo: ${nuevos.consumos.length} renglones devueltos.`, "bien", 7);
}

// ---------------------------------------------------------------------------
//  Los renglones con problemas
//
//  El Excel fallaba en SILENCIO y por eso nadie se daba cuenta hasta fin de
//  mes. Aquí todo lo que no cuadre se ve, en español y en rojo.
// ---------------------------------------------------------------------------

function tarjetaProblemas(raiz) {
  const problemas = revisarTodo(estado.datos);

  if (!problemas.length) {
    return el("section", { clase: "tarjeta" },
      el("h2", { texto: "Renglones con problemas" }),
      el("p", { clase: "nota bien", texto: "Ninguno. Todos los renglones están completos." })
    );
  }

  // Agrupamos por tipo de problema: es mucho más fácil arreglar 36 platos sin
  // precio de una, que ir renglón por renglón.
  const porTipo = new Map();
  for (const p of problemas) {
    for (const a of p.avisos) {
      if (!porTipo.has(a.codigo)) porTipo.set(a.codigo, { aviso: a, cuantos: 0, ejemplos: [] });
      const g = porTipo.get(a.codigo);
      g.cuantos++;
      if (g.ejemplos.length < 5) g.ejemplos.push(p.consumo);
    }
  }

  return el("section", { clase: "tarjeta con-problemas" },
    el("h2", { texto: `${problemas.length} renglones necesitan que los mire` }),
    el("p", { clase: "nota" },
      "No se perdió nada: están todos guardados. Solo les falta algo para que " +
      "sumen bien en la cuenta de cobro."),

    ...[...porTipo.values()].map((g) =>
      el("div", { clase: "problema" },
        el("h3", { texto: `${g.cuantos} — ${g.aviso.mensaje.replace(/^"[^"]*"/, "Un plato")}` }),
        el("p", { clase: "nota", texto: "Cómo se arregla: " + g.aviso.comoArreglar }),
        tabla(
          [
            { titulo: "Día" }, { titulo: "Empresa" }, { titulo: "Persona" },
            { titulo: "Plato" }, { titulo: "Cant.", clase: "dato" },
          ],
          g.ejemplos.map((c) =>
            el("tr", {},
              el("td", { texto: c.fecha ? fechaCorta(c.fecha) : "sin día" }),
              el("td", {}, cinta(c.empresa)),
              el("td", { texto: c.persona }),
              el("td", { texto: c.producto }),
              el("td", { clase: "dato", texto: String(c.cantidad) })
            )
          )
        ),
        g.cuantos > g.ejemplos.length
          ? el("p", { clase: "nota", texto: `…y ${g.cuantos - g.ejemplos.length} más iguales.` })
          : null
      )
    ),

    el("p", { clase: "nota" },
      "Los platos sin precio se arreglan de una en la pantalla ",
      el("a", { href: "#catalogo", texto: "Catálogo" }),
      ", y los nombres repetidos en ",
      el("a", { href: "#nombres", texto: "Revisar nombres" }), ".")
  );
}

// ---------------------------------------------------------------------------
//  Traer el Excel viejo
// ---------------------------------------------------------------------------

function tarjetaImportar(raiz) {
  const entrada = el("input", {
    type: "file",
    accept: ".xlsx,.xls",
    clase: "oculto",
    alCambiar: async (ev) => {
      const archivo = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!archivo) return;
      await traerElExcel(raiz, archivo);
    },
  });

  const hayDatos = estado.datos.consumos.length > 0;

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "Traer el Excel viejo" }),
    el("p", {},
      "Lee el archivo ", el("code", { texto: "ARROZ_PAISA_CONTROL.xlsx" }),
      " y se trae las empresas, los platos con sus precios, las personas y " +
      "todos los renglones registrados."),
    el("p", { clase: "nota" },
      "Esto se hace UNA sola vez, al empezar. Después ya no hace falta, porque " +
      "todo se registra aquí."),
    hayDatos
      ? el("p", { clase: "nota ojo" },
          `Ojo: ya hay ${estado.datos.consumos.length} renglones guardados. ` +
          "Importar los reemplaza. Antes de importar, baje un respaldo.")
      : null,
    acciones(
      el("button", {
        clase: hayDatos ? "plano" : "principal grande",
        alHacerClic: () => entrada.click(),
      }, "Elegir el archivo de Excel")
    ),
    entrada
  );
}

async function traerElExcel(raiz, archivo) {
  let resultado;
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const hojas = await hojasDesdeArchivo(bytes);
    resultado = importar(hojas);
  } catch (e) {
    mensaje("No se pudo leer ese archivo de Excel: " + e.message, "malo", 9);
    return;
  }

  const { datos: nuevos, resumen, avisos } = resultado;

  const cuerpo = el("div", {},
    el("p", { texto: "Esto es lo que trae el archivo. Revise que le cuadre:" }),
    el("dl", { clase: "cifras" },
      cifra("Renglones", String(resumen.renglones)),
      cifra("Suma", pesos(resumen.total), true),
      cifra("Desde", resumen.desde ? fechaCorta(resumen.desde) : "—"),
      cifra("Hasta", resumen.hasta ? fechaCorta(resumen.hasta) : "—"),
      cifra("Personas", String(resumen.personas)),
      cifra("Nombres distintos", String(resumen.nombresUnicos)),
      cifra("Nombres en varias empresas", String(resumen.nombresEnVariasEmpresas)),
      cifra("Platos", String(resumen.productos))
    ),

    resumen.paraRevisar
      ? el("p", { clase: "nota ojo" },
          `${resumen.paraRevisar} renglones entran marcados para revisar ` +
          `(${resumen.sinPrecio} sin precio` +
          (resumen.sinPersona ? `, ${resumen.sinPersona} sin persona` : "") +
          (resumen.sinFecha ? `, ${resumen.sinFecha} sin fecha` : "") +
          "). No se pierde ninguno: entran igual y quedan marcados para que " +
          "usted los arregle cuando pueda.")
      : null,

    avisos.length
      ? el("details", {},
          el("summary", { texto: `Ver los ${avisos.length} avisos del archivo` }),
          el("ul", { clase: "avisos" },
            ...avisos.slice(0, 60).map((a) =>
              el("li", { texto: `${a.hoja}${a.fila ? " fila " + a.fila : ""}: ${a.mensaje}` })),
            avisos.length > 60 ? el("li", { texto: `…y ${avisos.length - 60} más.` }) : null))
      : null,

    estado.datos.consumos.length
      ? el("p", { clase: "nota malo" },
          `Al aceptar, los ${estado.datos.consumos.length} renglones que hay ahora ` +
          "se reemplazan por estos.")
      : null
  );

  ventana({
    titulo: "Esto trae el Excel",
    cuerpo,
    botones: [
      { texto: "No, cancelar" },
      {
        texto: "Sí, traerlo",
        clase: "principal",
        alHacerClic: () => {
          // Antes de reemplazar, guardamos un respaldo de lo que había. Nunca
          // se pisa el trabajo de alguien sin dejarle una salida.
          if (estado.datos.consumos.length) almacen.descargarRespaldo(estado.datos);

          estado.datos = nuevos;
          sincronizarPeriodo();
          asegurarEmpresa();
          cambio();
          pintarDatos(raiz);
          mensaje(
            `Traídos ${resumen.renglones} renglones de ` +
            `${nombreMes(estado.mes)} de ${estado.anio}.`, "bien", 8);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
//  Borrar todo. Escondido y con doble pregunta a propósito.
// ---------------------------------------------------------------------------

function tarjetaPeligro(raiz) {
  let abierto = false;
  const caja = el("div", { clase: "oculto" },
    el("p", { clase: "nota malo" },
      "Borra TODOS los renglones, personas, platos y empresas de este navegador. " +
      "No se puede deshacer."),
    el("button", {
      clase: "peligro",
      alHacerClic: async () => {
        const uno = await confirmar({
          titulo: "Borrar todo",
          mensaje: `Se van a borrar ${estado.datos.consumos.length} renglones. ¿Seguro?`,
          siTexto: "Sí, seguir", peligroso: true,
        });
        if (!uno) return;

        almacen.descargarRespaldo(estado.datos);
        const dos = await confirmar({
          titulo: "Última pregunta",
          mensaje:
            "Le acabo de bajar un respaldo por si acaso. ¿De verdad borro todo?",
          siTexto: "Sí, borrar todo", peligroso: true,
        });
        if (!dos) return;

        await almacen.borrarTodoDelNavegador();
        location.reload();
      },
    }, "Borrar todo")
  );

  const boton = el("button", {
    clase: "plano chico",
    alHacerClic: () => {
      abierto = !abierto;
      caja.classList.toggle("oculto", !abierto);
      boton.textContent = abierto ? "Mejor no" : "Mostrar la opción de borrar todo";
    },
  }, "Mostrar la opción de borrar todo");

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "Empezar de ceros" }),
    boton,
    caja
  );
}
