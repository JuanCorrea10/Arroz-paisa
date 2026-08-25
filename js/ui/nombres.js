// ============================================================================
//  nombres.js (pantalla)  -  "Revisar nombres"
//
//  Aquí se arregla el desorden de nombres que venía del Excel, de a poquitos y
//  sin miedo, porque antes de tocar nada se muestra exactamente qué va a pasar.
//
//  La pantalla tiene tres partes, en este orden a propósito:
//
//   1. Lo que se arregla solo (puntos y espacios de sobra). Un botón y listo.
//   2. Los grupos de nombres que se parecen. Uno por uno, ella decide.
//   3. Los tocayos entre empresas. NO son errores: se muestran solo para que
//      no se asuste de verlos repetidos, y aquí no se pueden unir.
// ============================================================================

import {
  el, vaciar, mensaje, confirmar, ventana, tabla, cinta, cifra, vacio, pedirDatos,
} from "./componentes.js";
import { estado, cambio, empresas } from "./estado.js";
import { pesos, fechaCorta, normalizar } from "../nucleo/formato.js";
import {
  gruposParaRevisar, nombresSucios, limpiarTodosLosNombres, simularUnion,
  unirPersonas, marcarDistintos, renombrarPersona, esqueleto, limpiarNombre,
} from "../nucleo/nombres.js";
import {
  leerListaDePersonal, cruzarConPersonal, aplicarDocumentos, coberturaDeDocumentos,
} from "../nucleo/personal.js";
import { hojasDesdeArchivo } from "../datos/excel.js";

/** Cuántos grupos se muestran de una. Más de esto marea y pone lenta la página. */
const DE_A_CUANTOS = 20;
let mostrando = DE_A_CUANTOS;

export function pintarNombres(raiz) {
  vaciar(raiz);

  const datos = estado.datos;
  const grupos = gruposParaRevisar(datos);
  const sucios = nombresSucios(datos);
  const tocayos = tocayosEntreEmpresas(datos);

  raiz.append(
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Revisar nombres" }),
        el("p", {
          texto:
            "Cuando el mismo empleado quedó anotado de dos formas distintas, su " +
            "consumo aparece partido en dos. Aquí se juntan.",
        })
      )
    ),
    el("dl", { clase: "cifras" },
      cifra("Nombres por revisar", String(grupos.length), grupos.length > 0),
      cifra("Con puntos o espacios", String(sucios.length), sucios.length > 0),
      cifra("Tocayos entre empresas", String(tocayos.length))
    )
  );

  // --- 0. La lista de personal: la única forma de no adivinar --------------
  raiz.append(tarjetaDePersonal(raiz));

  // --- 1. Lo que se arregla solo ------------------------------------------
  if (sucios.length) raiz.append(tarjetaDeLimpieza(raiz, sucios));

  // --- 2. Los grupos que necesitan que ella decida -------------------------
  raiz.append(el("h2", { texto: "Nombres que se parecen" }));

  if (!grupos.length) {
    raiz.append(
      vacio(
        "Todo en orden",
        el("p", {},
          "No hay nombres parecidos sin revisar. Cuando aparezca uno nuevo, " +
          "esta pantalla se lo va a mostrar aquí.")
      )
    );
  } else {
    raiz.append(
      el("p", { clase: "nota" },
        "Solo se comparan nombres de la MISMA empresa. Dos personas de empresas " +
        "distintas nunca se juntan, aunque se llamen igual.")
    );
    for (const grupo of grupos.slice(0, mostrando)) {
      raiz.append(tarjetaDeGrupo(raiz, grupo));
    }
    if (grupos.length > mostrando) {
      raiz.append(
        el("button", {
          clase: "plano",
          alHacerClic: () => { mostrando += DE_A_CUANTOS; pintarNombres(raiz); },
        }, `Ver ${Math.min(DE_A_CUANTOS, grupos.length - mostrando)} más (faltan ${grupos.length - mostrando})`)
      );
    }
  }

  // --- 3. Los tocayos: informativo, no se tocan ----------------------------
  if (tocayos.length) raiz.append(tarjetaDeTocayos(tocayos));
}

// ---------------------------------------------------------------------------
//  0. La lista de personal de la empresa
//
//  Es lo más potente de esta pantalla, porque es lo único que no adivina.
//  Con la lista de la empresa se descubren duplicados que por nombre son
//  imposibles de ver: en MGP, "MARTA SALGADO" y "ELENA QUINTERO" resultaron
//  ser la misma señora (SALGADO QUINTERO MARTA ELENA), y esos dos nombres no
//  comparten ni una letra.
// ---------------------------------------------------------------------------

function tarjetaDePersonal(raiz) {
  const cobertura = coberturaDeDocumentos(estado.datos);
  const lista = empresas();

  const filas = lista.map((e) => {
    const c = cobertura.get(normalizar(e.codigo)) || { total: 0, conDocumento: 0 };
    const porcentaje = c.total ? Math.round((c.conDocumento / c.total) * 100) : 0;
    return el("tr", {},
      el("td", {}, cinta(e.codigo)),
      el("td", { clase: "dato", texto: String(c.total) }),
      el("td", { clase: "dato", texto: String(c.conDocumento) }),
      el("td", { clase: "dato" },
        el("span", {
          clase: "sello " + (porcentaje >= 60 ? "seguro-alto" : porcentaje > 0 ? "seguro-bajo" : "seguro-medio"),
          texto: porcentaje + " %",
        })
      ),
      el("td", { clase: "dato" },
        el("button", {
          clase: "plano chico",
          alHacerClic: () => pedirArchivoDePersonal(raiz, e.codigo),
        }, "Traer lista")
      )
    );
  });

  return el("section", { clase: "tarjeta tarjeta-personal" },
    el("h2", { texto: "La lista de personal de la empresa" }),
    el("p", {},
      "Cuando una empresa le mande su lista de empleados, tráigala aquí. Es la " +
      "única forma de saber quién es quién ", el("strong", { texto: "sin adivinar" }), "."),
    el("p", { clase: "nota" },
      "De cada documento la app guarda solo los últimos 5 números, que es lo " +
      "justo para distinguir a dos personas del mismo nombre. Ese dato no sale " +
      "en las cuentas de cobro ni en lo que se le manda a las empresas."),
    tabla(
      [
        { titulo: "Empresa" },
        { titulo: "Personas", clase: "dato" },
        { titulo: "Con documento", clase: "dato" },
        { titulo: "", clase: "dato" },
        { titulo: "", clase: "dato" },
      ],
      filas
    ),
    el("p", { clase: "nota" },
      "Sirve un Excel, un archivo de LibreOffice (.ods) o un CSV. No importa " +
      "cómo estén puestas las columnas: la app busca el nombre y el número.")
  );
}

function pedirArchivoDePersonal(raiz, codigoEmpresa) {
  const entrada = el("input", {
    type: "file",
    accept: ".xlsx,.xls,.ods,.csv",
    clase: "oculto",
    alCambiar: async (ev) => {
      const archivo = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!archivo) return;
      await cruzarArchivo(raiz, codigoEmpresa, archivo);
    },
  });
  document.body.append(entrada);
  entrada.click();
  setTimeout(() => entrada.remove(), 60000);
}

async function cruzarArchivo(raiz, codigoEmpresa, archivo) {
  let plan;
  let cuantosEnLista = 0;
  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const hojas = await hojasDesdeArchivo(bytes);
    const { gente, avisos } = leerListaDePersonal(hojas);
    cuantosEnLista = gente.length;
    if (!gente.length) {
      mensaje(avisos[0] || "En ese archivo no se encontró ninguna persona.", "malo", 9);
      return;
    }
    plan = cruzarConPersonal(estado.datos, codigoEmpresa, gente);
  } catch (e) {
    mensaje("No se pudo leer ese archivo: " + e.message, "malo", 9);
    return;
  }

  const conDocumento = plan.asignaciones.length;

  const cuerpo = el("div", {},
    el("p", {},
      `La lista trae ${cuantosEnLista} personas. Esto es lo que encontré al ` +
      `cruzarla con las de ${codigoEmpresa}:`),

    el("dl", { clase: "cifras" },
      cifra("Se les pone documento", String(conDocumento), conDocumento > 0),
      cifra("Duplicados descubiertos", String(plan.fusiones.length), plan.fusiones.length > 0),
      cifra("Quedan dudosas", String(plan.dudosas.length)),
      cifra("No aparecen en la lista", String(plan.sinCruzar.length))
    ),

    plan.fusiones.length
      ? el("div", { clase: "fusiones-halladas" },
          el("h4", { texto: "Personas que en realidad son una sola" }),
          el("p", { clase: "nota" },
            "La empresa tiene una sola persona con ese documento, pero en la " +
            "app está anotada con varios nombres. Esto pasa cuando a veces se " +
            "escribe el primer apellido y a veces el segundo."),
          ...plan.fusiones.map((f) =>
            el("div", { clase: "fusion" },
              el("p", {},
                el("strong", { texto: f.nombreCompleto }),
                el("span", { clase: "nota", texto: `  ·  documento ···${f.documento}` })),
              el("ul", {},
                ...f.integrantes.map((x) =>
                  el("li", {},
                    el("strong", { texto: x.persona.nombre }),
                    el("span", { clase: "nota", texto: ` — ${x.renglones} renglones` }),
                    x.persona.nombre === f.sugerido
                      ? el("span", { clase: "etiqueta sugerida", texto: "se queda este" })
                      : null))))))
      : null,

    plan.sinCruzar.length
      ? el("details", {},
          el("summary", { texto: `${plan.sinCruzar.length} personas de la app no salen en la lista` }),
          el("p", { clase: "nota" },
            "Es normal: puede que ya no trabajen ahí, o que estén escritas de " +
            "una forma que no se parece a la de la empresa. Se quedan como están."),
          el("p", { clase: "nota", texto: plan.sinCruzar.slice(0, 40).map((p) => p.nombre).join(" · ") }))
      : null,

    el("p", { clase: "nota bien" },
      "Nada de esto cambia ni un peso. Solo cambia quién es quién.")
  );

  ventana({
    titulo: `Lista de personal de ${codigoEmpresa}`,
    cuerpo,
    botones: [
      { texto: "Cancelar" },
      {
        texto: plan.fusiones.length ? "Poner documentos y unir" : "Poner los documentos",
        clase: "principal",
        alHacerClic: () => {
          const r = aplicarDocumentos(estado.datos, plan.asignaciones);

          let unidas = 0;
          let renglonesMovidos = 0;
          for (const f of plan.fusiones) {
            const otros = f.integrantes
              .map((x) => x.persona.nombre)
              .filter((n) => n !== f.sugerido);
            if (!otros.length) continue;
            const res = unirPersonas(estado.datos, f.empresa, f.sugerido, otros);
            renglonesMovidos += res.renglones;
            unidas += otros.length;
            // A la que quedó le ponemos el documento, que es lo que lo probó.
            const persona = estado.datos.personas.find(
              (p) => normalizar(p.empresaCome) === f.empresa &&
                     limpiarNombre(p.nombre) === limpiarNombre(f.sugerido));
            if (persona && f.documento) {
              persona.documento = f.documento;
              persona.nombreCompleto = f.nombreCompleto;
            }
          }

          cambio();
          mostrando = DE_A_CUANTOS;
          pintarNombres(raiz);
          mensaje(
            `Listo: ${r.puestos} documentos puestos` +
            (unidas ? `, y ${unidas} nombres repetidos se unieron (${renglonesMovidos} renglones movidos).` : "."),
            "bien", 10
          );
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
//  1. Puntos y espacios de sobra
// ---------------------------------------------------------------------------

function tarjetaDeLimpieza(raiz, sucios) {
  const muestra = sucios.slice(0, 8);

  return el("section", { clase: "tarjeta aviso-arreglable" },
    el("h2", { texto: `${sucios.length} nombres tienen puntos o espacios de sobra` }),
    el("p", {},
      "Son errores de escritura sin ninguna duda: sobra un punto, un espacio o " +
      "un guion. Se pueden arreglar todos de una, sin riesgo: la plata no cambia."),
    tabla(
      [{ titulo: "Empresa" }, { titulo: "Como está ahora" }, { titulo: "Como va a quedar" }],
      muestra.map((s) =>
        el("tr", {},
          el("td", {}, cinta(s.empresa)),
          el("td", {}, el("code", { clase: "muestra-mal", texto: JSON.stringify(s.antes) })),
          el("td", {}, el("code", { clase: "muestra-bien", texto: JSON.stringify(s.despues) }))
        )
      )
    ),
    sucios.length > muestra.length
      ? el("p", { clase: "nota", texto: `…y ${sucios.length - muestra.length} más.` })
      : null,
    el("p", { clase: "nota" },
      'Las comillas se muestran a propósito, para que se vean los espacios ' +
      'que sobran al principio y al final.'),
    el("div", { clase: "fila" },
      el("button", {
        clase: "principal grande",
        alHacerClic: async () => {
          const seguro = await confirmar({
            titulo: "Arreglar los nombres",
            mensaje:
              `Se van a limpiar ${sucios.length} nombres. No se borra nada y ` +
              `ningún total cambia: solo se quitan puntos y espacios de sobra.`,
            siTexto: "Sí, arreglarlos",
          });
          if (!seguro) return;
          const r = limpiarTodosLosNombres(estado.datos);
          cambio();
          mensaje(
            `Listo: ${r.personasArregladas} nombres y ${r.renglonesArreglados} renglones ` +
            `arreglados${r.personasFundidas ? `, y ${r.personasFundidas} que eran el mismo quedaron en uno` : ""}.`,
            "bien", 7
          );
          pintarNombres(raiz);
        },
      }, "Arreglar los " + sucios.length + " de una vez")
    )
  );
}

// ---------------------------------------------------------------------------
//  2. Un grupo de nombres parecidos
// ---------------------------------------------------------------------------

/** Qué tan seguros estamos, dicho en palabras y no en números. */
function seguridad(fuerza) {
  // Fuerza 5 es la única que no es una opinión: es el documento.
  if (fuerza >= 5) return { texto: "Probado por el documento", clase: "seguro-probado" };
  if (fuerza >= 4) return { texto: "Casi seguro que es la misma persona", clase: "seguro-alto" };
  if (fuerza === 3) return { texto: "Muy probable que sea la misma persona", clase: "seguro-medio" };
  if (fuerza === 2) return { texto: "Puede que sea la misma persona", clase: "seguro-bajo" };
  return { texto: "Se parecen, pero revise bien", clase: "seguro-bajo" };
}

function tarjetaDeGrupo(raiz, grupo) {
  const nombreGrupo = "bueno-" + grupo.empresa + "-" + esqueleto(grupo.sugerido).replace(/ /g, "_");
  const seg = seguridad(grupo.fuerza);
  let elegido = grupo.sugerido;

  const filas = grupo.integrantes.map((p, i) => {
    const radio = el("input", {
      type: "radio",
      name: nombreGrupo,
      id: nombreGrupo + "-" + i,
      checked: p.nombre === grupo.sugerido,
      alCambiar: () => { elegido = p.nombre; },
    });
    return el("tr", {},
      el("td", {}, radio),
      el("td", {},
        el("label", { for: radio.id, clase: "nombre-opcion" },
          el("strong", { texto: p.nombre }),
          p.activa ? null : el("span", { clase: "etiqueta", texto: "inactiva" }),
          i === 0 ? el("span", { clase: "etiqueta sugerida", texto: "el más usado" }) : null
        )
      ),
      el("td", { clase: "dato" },
        p.documento
          ? el("code", { clase: "documento-corto", texto: "···" + p.documento })
          : el("span", { clase: "nota", texto: "—" })),
      el("td", { clase: "dato", texto: String(p.renglones) }),
      el("td", { clase: "dato plata", texto: pesos(p.total) }),
      el("td", { clase: "dato", texto: p.ultimaFecha ? fechaCorta(p.ultimaFecha) : "—" })
    );
  });

  return el("section", { clase: "tarjeta grupo-nombres" },
    el("div", { clase: "fila entre" },
      el("div", { clase: "fila" },
        cinta(grupo.empresa),
        el("span", { clase: "razon", texto: grupo.razon })
      ),
      el("span", { clase: "sello " + seg.clase, texto: seg.texto })
    ),

    el("p", { clase: "nota" }, "Marque cuál es el nombre bueno. Los otros se van a mover a ese."),

    tabla(
      [
        { titulo: "" },
        { titulo: "Nombre" },
        { titulo: "Documento", clase: "dato" },
        { titulo: "Renglones", clase: "dato" },
        { titulo: "Suma", clase: "dato" },
        { titulo: "Último día", clase: "dato" },
      ],
      filas
    ),

    el("div", { clase: "fila" },
      el("button", {
        clase: "principal",
        alHacerClic: () => preguntarYUnir(raiz, grupo, elegido),
      }, "Unir en el que marqué"),

      el("button", {
        clase: "plano",
        alHacerClic: async () => {
          const seguro = await confirmar({
            titulo: "Son personas diferentes",
            mensaje:
              "No se va a tocar nada y estos nombres no le van a volver a " +
              "aparecer en esta pantalla. ¿Es correcto?",
            siTexto: "Sí, son diferentes",
          });
          if (!seguro) return;
          // Marcamos todas las parejas del grupo, para que no vuelva ninguna.
          for (let i = 0; i < grupo.integrantes.length; i++) {
            for (let j = i + 1; j < grupo.integrantes.length; j++) {
              marcarDistintos(estado.datos, grupo.empresa,
                grupo.integrantes[i].nombre, grupo.integrantes[j].nombre);
            }
          }
          cambio();
          mensaje("Anotado: son personas diferentes.", "bien");
          pintarNombres(raiz);
        },
      }, "Son personas diferentes"),

      el("button", {
        clase: "plano",
        alHacerClic: () => cambiarNombre(raiz, grupo),
      }, "Corregir un nombre")
    )
  );
}

/** Muestra la vista previa exacta y solo entonces une. */
async function preguntarYUnir(raiz, grupo, elegido) {
  const otros = grupo.integrantes.map((p) => p.nombre).filter((n) => n !== elegido);
  if (!otros.length) {
    mensaje("Marque cuál es el nombre bueno.", "ojo");
    return;
  }

  const previa = simularUnion(estado.datos, grupo.empresa, elegido, otros);

  const cuerpo = el("div", {},
    el("p", {},
      "Todo lo de ",
      ...otros.map((n, i) => [i ? " y " : "", el("strong", { texto: n })]).flat(),
      " va a quedar a nombre de ",
      el("strong", { texto: elegido }),
      ", en ", el("strong", { texto: grupo.empresa }), "."
    ),
    el("dl", { clase: "cifras" },
      cifra("Renglones que se mueven", String(previa.renglones)),
      cifra("Días que tocan", String(previa.dias)),
      cifra("Plata que se mueve", pesos(previa.plata))
    ),
    el("p", { clase: "nota bien" },
      "El total del negocio NO cambia: los renglones son los mismos, solo " +
      "cambian de dueño."),

    previa.facturasQueSePierden > 0
      ? el("p", { clase: "nota malo" },
          `Ojo: ${previa.facturasQueSePierden} ` +
          (previa.facturasQueSePierden === 1 ? "día tiene" : "días tienen") +
          " los dos nombres comiendo el mismo día. Como una factura es una " +
          "persona por día, después de unir van a contar como una sola. " +
          "El número de facturas de esos días va a bajar en " +
          `${previa.facturasQueSePierden}. Revise el Cuadre después de unir.`)
      : null
  );

  ventana({
    titulo: "¿Unir estos nombres?",
    cuerpo,
    botones: [
      { texto: "Cancelar" },
      {
        texto: "Sí, unir",
        clase: "principal",
        alHacerClic: () => {
          const r = unirPersonas(estado.datos, grupo.empresa, elegido, otros);
          cambio();
          mensaje(
            `Unidos. Se movieron ${r.renglones} renglones a ${r.nombreBueno}.`,
            "bien", 6
          );
          mostrando = DE_A_CUANTOS;
          pintarNombres(raiz);
        },
      },
    ],
  });
}

/** Corregir la escritura de un nombre sin unirlo con nadie. */
async function cambiarNombre(raiz, grupo) {
  const r = await pedirDatos({
    titulo: "Corregir un nombre",
    campos: [
      {
        nombre: "viejo",
        etiqueta: "¿Cuál nombre está mal escrito?",
        tipo: "seleccion",
        opciones: grupo.integrantes.map((p) => ({ valor: p.nombre, texto: p.nombre })),
        valor: grupo.integrantes[grupo.integrantes.length - 1].nombre,
      },
      {
        nombre: "nuevo",
        etiqueta: "¿Cómo se escribe bien?",
        requerido: true,
        ayuda: "Los puntos y los espacios de sobra se quitan solos.",
      },
    ],
    textoAceptar: "Corregir",
  });
  if (!r) return;

  try {
    const res = renombrarPersona(estado.datos, grupo.empresa, r.viejo, r.nuevo);
    cambio();
    mensaje(
      `Corregido a ${limpiarNombre(r.nuevo)}` +
      (res.movidos ? ` y se movieron ${res.movidos} renglones.` : "."),
      "bien"
    );
    pintarNombres(raiz);
  } catch (e) {
    mensaje(e.message, "malo", 8);
  }
}

// ---------------------------------------------------------------------------
//  3. Los tocayos entre empresas: esto NO es un error
// ---------------------------------------------------------------------------

function tocayosEntreEmpresas(datos) {
  const porEsqueleto = new Map();
  for (const p of datos.personas) {
    const esq = esqueleto(p.nombre);
    if (!esq) continue;
    if (!porEsqueleto.has(esq)) porEsqueleto.set(esq, []);
    porEsqueleto.get(esq).push(p);
  }

  const lista = [];
  for (const personas of porEsqueleto.values()) {
    const empresas = [...new Set(personas.map((p) => normalizar(p.empresaCome)))];
    if (empresas.length < 2) continue;
    lista.push({ nombre: personas[0].nombre, empresas: empresas.sort() });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function tarjetaDeTocayos(tocayos) {
  let abierto = false;

  const caja = el("div", { clase: "oculto" });
  const boton = el("button", {
    clase: "plano",
    alHacerClic: () => {
      abierto = !abierto;
      caja.classList.toggle("oculto", !abierto);
      boton.textContent = abierto ? "Esconder la lista" : `Ver los ${tocayos.length} nombres`;
    },
  }, `Ver los ${tocayos.length} nombres`);

  caja.append(
    tabla(
      [{ titulo: "Nombre" }, { titulo: "Está en" }],
      tocayos.map((t) =>
        el("tr", {},
          el("td", { texto: t.nombre }),
          el("td", {}, el("div", { clase: "fila" }, ...t.empresas.map(cinta)))
        )
      )
    )
  );

  return el("section", { clase: "tarjeta" },
    el("h2", { texto: "Tocayos: el mismo nombre en dos empresas" }),
    el("p", {},
      `Hay ${tocayos.length} nombres que existen en más de una empresa. `,
      el("strong", { texto: "Esto no es un error y no hay que arreglarlo." })),
    el("p", { clase: "nota" },
      "AGRO y BASARILI son sedes vecinas y hay gente que se llama igual en las " +
      "dos. Son personas distintas, cada una come en su sede y cada una se le " +
      "cobra a su empresa. Por eso la app nunca las junta, ni siquiera si " +
      "usted se lo pide."),
    boton,
    caja
  );
}
