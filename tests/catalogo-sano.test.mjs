// ============================================================================
//  catalogo-sano.test.mjs  -  Un plato sin nombre no puede tumbar la app
//
//  Esto es de un bug de verdad, y de los caros: un plato guardado sin nombre
//  dejaba la pantalla de Registrar viéndose perfecta -- salían los nombres de
//  la gente y todo -- pero al elegir a la persona no pasaba NADA. La lista de
//  platos se arma solo en ese momento, y ordenarla con un nombre vacío
//  reventaba el repintado, callado. La señora se quedó una mañana sin poder
//  anotar los almuerzos.
//
//  El plato sin nombre entró por el importador del Excel, que arma la lista él
//  mismo y no pasa por agregarProducto (que sí exige nombre). Por eso la
//  limpieza va en completarDatos: es el único sitio por donde pasan todos los
//  datos, vengan de donde vengan.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { completarDatos, datosVacios, agregarProducto } from "../js/nucleo/modelo.js";

grupo("El catálogo no puede traer basura sin nombre");

function conProductos(...productos) {
  return completarDatos({ ...datosVacios(), productos });
}

prueba("un plato sin nombre se bota al cargar", () => {
  const d = conProductos({ nombre: "ALMUERZO", activo: true }, { nombre: null, activo: true });
  igual(d.productos.map((p) => p.nombre), ["ALMUERZO"]);
});

prueba("y se dice cuántos se botaron: callarlo sería cambiarle el catálogo", () => {
  const d = conProductos({ nombre: "ALMUERZO" }, { nombre: null }, { nombre: "   " }, { nombre: "" });
  igual(d.sinNombre.productos, 3);
});

prueba("los platos buenos no se tocan", () => {
  const d = conProductos({ nombre: "ALMUERZO" }, { nombre: "GASEOSA" });
  igual(d.productos.length, 2);
  igual(d.sinNombre.productos, 0);
});

prueba("una persona sin nombre también se bota", () => {
  const d = completarDatos({
    ...datosVacios(),
    personas: [{ nombre: "JUAN", empresa: "MGP" }, { nombre: undefined, empresa: "MGP" }],
  });
  igual(d.personas.map((p) => p.nombre), ["JUAN"]);
  igual(d.sinNombre.personas, 1);
});

prueba("botar el plato NO borra ningún pedido", () => {
  // Los renglones guardan el nombre del plato adentro, no un enlace al
  // catálogo. Un plato sin nombre no lo puede estar usando nadie.
  const d = completarDatos({
    ...datosVacios(),
    productos: [{ nombre: null }],
    consumos: [{ fecha: "2026-08-03", empresa: "MGP", persona: "JUAN",
                 producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 }],
  });
  igual(d.consumos.length, 1);
  igual(d.consumos[0].producto, "ALMUERZO");
});

prueba("la lista de platos se puede ordenar sin que reviente", () => {
  // Es la operación exacta que tumbaba Registrar.
  const d = conProductos({ nombre: "GASEOSA" }, { nombre: null }, { nombre: "ALMUERZO" });
  const ordenada = d.productos
    .map((p) => ({ texto: p.nombre }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  igual(ordenada.map((x) => x.texto), ["ALMUERZO", "GASEOSA"]);
});

prueba("crear un plato a mano sigue exigiendo el nombre", () => {
  const d = datosVacios();
  let reclamo = null;
  try { agregarProducto(d, "   "); } catch (e) { reclamo = e.message; }
  cierto(reclamo, "tiene que reclamar, no guardar un plato mudo");
  igual(d.productos.length, 0);
});
