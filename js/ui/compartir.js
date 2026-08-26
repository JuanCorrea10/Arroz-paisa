// ============================================================================
//  compartir.js  -  "Compartir con las empresas"
//
//  El problema: los supervisores y las personas que controlan los pagos en
//  cada fábrica quieren ver la información. Pero NINGUNA empresa puede ver la
//  de las otras.
//
//  Se estudiaron tres caminos:
//
//   1. Una página en internet con una clave por empresa.
//      Costo: hay que pagar un servidor, hay que manejar claves, y si alguien
//      pasa el enlace lo ve cualquiera. Además hay que estar pendiente de que
//      el servidor no se caiga. Para una persona sola, es mucho.
//
//   2. Seguir mandando el PDF de la cuenta de cobro.
//      Costo: cero, y ya funciona. Pero el PDF es un resumen: el supervisor no
//      puede mirar "¿y el martes qué pasó?" ni buscar a un empleado, que es
//      justo lo que quieren mirar.
//
//   3. (El elegido) Un archivo de página web, uno por empresa.
//      Se genera aquí, lleva ADENTRO solo los datos de esa empresa, y se manda
//      por WhatsApp o por correo. Se abre con doble clic o desde el celular, se
//      ve como una página de verdad, se puede buscar e imprimir, y no se puede
//      editar.
//      Por qué es seguro: no es que la app le esconda las otras empresas, es
//      que los datos de las otras NO ESTÁN dentro del archivo. Aunque el
//      supervisor sea el mejor del mundo con los computadores, no puede sacar
//      algo que no está.
//      Costo: cero pesos, cero servidores, cero claves. Lo único que no hace
//      es actualizarse solo: cada quincena hay que mandar el nuevo.
// ============================================================================

import {
  el, vaciar, mensaje, tabla, cinta, cifra, vacio, acciones, ventana,
  poner,
} from "./componentes.js";
import { estado, empresas, empresaPorCodigo } from "./estado.js";
import { pesos, nombreMes, fechaCorta } from "../nucleo/formato.js";
import {
  delMes, quincenaDe, sumar, contarFacturas, cuentaDeCobro, rangoQuincena,
  fechaDeCobro,
} from "../nucleo/calculos.js";
import { generarReporteEmpresa, descargarReporteEmpresa } from "../exportar/reporte-empresa.js";
import { exportarEmpresaAExcel } from "../exportar/excel-export.js";
import { pdfCuentaDeCobro } from "../exportar/pdf.js";

export function pintarCompartir(raiz) {
  vaciar(raiz);
  const lista = empresas();

  poner(raiz, 
    el("div", { clase: "encabezado-pantalla" },
      el("div", {},
        el("h1", { texto: "Compartir con las empresas" }),
        el("p", {
          texto:
            `Lo de ${nombreMes(estado.mes)} de ${estado.anio}, listo para mandar ` +
            "por WhatsApp o por correo.",
        })
      )
    )
  );

  if (!lista.length) {
    poner(raiz, vacio("Todavía no hay empresas",
      el("p", { texto: "Cree las empresas primero." })));
    return;
  }

  poner(raiz, garantiaDePrivacidad());

  for (const empresa of lista) {
    poner(raiz, tarjetaDeEmpresa(empresa));
  }
}

/** La explicación de por qué esto es seguro, en cristiano. */
function garantiaDePrivacidad() {
  return el("section", { clase: "tarjeta garantia" },
    el("h2", { texto: "Cada empresa ve lo suyo y nada más" }),
    el("p", {},
      "Cuando usted baja el archivo de una empresa, ese archivo lleva adentro ",
      el("strong", { texto: "únicamente" }),
      " los datos de esa empresa. Los de las otras no van ahí."),
    el("p", { clase: "nota" },
      "No es que el archivo se los esconda: es que no los tiene. Así que no hay " +
      "forma de que un supervisor vea lo de otra fábrica, ni por error ni a propósito."),
    el("p", { clase: "nota" },
      "El archivo tampoco se puede editar: si el supervisor le cambia un número, " +
      "solo se lo cambia en su copia. Los datos de verdad siguen aquí.")
  );
}

function tarjetaDeEmpresa(empresa) {
  const datos = estado.datos;
  const anio = estado.anio;
  const mes = estado.mes;

  const delMesEmpresa = delMes(datos.consumos, anio, mes)
    .filter((c) => c.empresaFactura === empresa.codigo);
  const cobrables = delMesEmpresa.filter((c) => c.facturable !== false);
  const q1 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 1);
  const q2 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 2);
  const r1 = rangoQuincena(anio, mes, 1, empresa);
  const r2 = rangoQuincena(anio, mes, 2, empresa);

  const hayAlgo = delMesEmpresa.length > 0;

  return el("section", { clase: "tarjeta empresa-compartir" },
    el("div", { clase: "fila entre" },
      el("div", { clase: "fila" },
        cinta(empresa.codigo),
        el("h2", { texto: empresa.razonSocial || empresa.codigo })
      ),
      el("span", { clase: "nota", texto: empresa.nit ? "NIT " + empresa.nit : "" })
    ),

    el("dl", { clase: "cifras" },
      cifra(`Quincena 1 (${fechaCorta(r1.desde)} al ${fechaCorta(r1.hasta)})`, pesos(sumar(q1))),
      cifra(`Quincena 2 (${fechaCorta(r2.desde)} al ${fechaCorta(r2.hasta)})`, pesos(sumar(q2))),
      cifra("Facturas del mes", String(contarFacturas(cobrables))),
      cifra("Total del mes", pesos(sumar(cobrables)), true)
    ),

    !hayAlgo
      ? el("p", { clase: "nota", texto: "No hay nada registrado de esta empresa en este mes." })
      : el("div", {},
          el("h3", { texto: "Para el supervisor: todo el mes, día por día" }),
          el("p", { clase: "nota" },
            "Un archivo que se abre como una página. Trae el día a día, el " +
            "consumo de cada persona y los totales de las dos quincenas. Es lo " +
            "que sirve para que revisen y comparen."),
          acciones(
            el("button", {
              clase: "principal grande",
              alHacerClic: () => {
                try {
                  descargarReporteEmpresa(estado.datos, empresa.codigo, anio, mes);
                  mensaje(
                    `Bajado el archivo de ${empresa.codigo}. Búsquelo en Descargas y ` +
                    "mándelo por WhatsApp.", "bien", 8);
                } catch (e) {
                  mensaje(e.message, "malo", 6);
                }
              },
            }, "Bajar el archivo para mandar"),
            el("button", {
              clase: "plano",
              alHacerClic: () => verAntesDeMandar(empresa, anio, mes),
            }, "Ver primero qué lleva")
          ),

          el("h3", { texto: "Para cobrar: la cuenta de cobro en PDF" }),
          el("p", { clase: "nota" },
            "El documento formal de la quincena, con el NIT y el total. Es lo " +
            "que se entrega para que paguen."),
          acciones(
            botonCuenta(empresa, anio, mes, 1, q1.length),
            botonCuenta(empresa, anio, mes, 2, q2.length)
          ),

          el("h3", { texto: "Por si lo piden en Excel" }),
          acciones(
            el("button", {
              clase: "plano",
              alHacerClic: async () => {
                try {
                  await exportarEmpresaAExcel(estado.datos, empresa.codigo, anio, mes);
                  mensaje(`Bajado el Excel de ${empresa.codigo}.`, "bien");
                } catch (e) {
                  mensaje("No se pudo hacer el Excel: " + e.message, "malo", 6);
                }
              },
            }, "Bajar en Excel")
          )
        )
  );
}

function botonCuenta(empresa, anio, mes, quincena, cuantos) {
  return el("button", {
    clase: "plano",
    disabled: cuantos === 0,
    alHacerClic: () => {
      const cuenta = cuentaDeCobro(
        estado.datos.consumos, anio, mes, quincena, empresa,
        fechaDeCobro(estado.datos, empresa.codigo, anio, mes, quincena));
      if (!cuenta.filas.length) {
        mensaje(`No hay nada que cobrar en la quincena ${quincena}.`, "ojo");
        return;
      }
      try {
        pdfCuentaDeCobro(cuenta, estado.datos.config.acreedor || {});
        mensaje(`Cuenta de cobro de ${empresa.codigo}, quincena ${quincena}: bajada.`, "bien");
      } catch (e) {
        mensaje("No se pudo hacer el PDF: " + e.message, "malo", 6);
      }
    },
  }, cuantos === 0 ? `Quincena ${quincena} — sin nada` : `Cuenta de cobro — quincena ${quincena}`);
}

/**
 * Le muestra el archivo tal cual lo va a ver el supervisor, ANTES de mandarlo.
 * Esto no es un lujo: es lo que le da confianza para mandarlo sin miedo a que
 * se le haya ido información de otra empresa.
 */
function verAntesDeMandar(empresa, anio, mes) {
  let resultado;
  try {
    resultado = generarReporteEmpresa(estado.datos, empresa.codigo, anio, mes);
  } catch (e) {
    mensaje(e.message, "malo", 6);
    return;
  }

  const otras = empresas().filter((e) => e.codigo !== empresa.codigo).map((e) => e.codigo);
  // Comprobamos de verdad que los códigos de las otras empresas no aparezcan.
  const coladas = otras.filter((cod) => resultado.html.includes(">" + cod + "<"));

  const marco = el("iframe", {
    clase: "vista-previa",
    title: `Vista previa del archivo de ${empresa.codigo}`,
    srcdoc: resultado.html,
  });

  ventana({
    titulo: `Así lo va a ver ${empresa.codigo}`,
    cuerpo: el("div", {},
      el("p", { clase: coladas.length ? "nota malo" : "nota bien" },
        coladas.length
          ? `Ojo: aparecen las empresas ${coladas.join(", ")}. Avísele a quien hizo la app.`
          : `Revisado: en este archivo solo aparece ${empresa.codigo}. ` +
            `Lleva ${resultado.renglones} renglones y suma ${pesos(resultado.total)}.`),
      marco
    ),
    botones: [
      { texto: "Cerrar" },
      {
        texto: "Bajarlo para mandar",
        clase: "principal",
        alHacerClic: () => {
          descargarReporteEmpresa(estado.datos, empresa.codigo, anio, mes);
          mensaje("Bajado. Búsquelo en Descargas.", "bien", 7);
        },
      },
    ],
  });
}
