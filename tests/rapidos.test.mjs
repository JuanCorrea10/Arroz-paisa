// ============================================================================
//  Botones rápidos: los platos de hoy y los de siempre que ella escoge.
//  Si esto falla, el especial del día no sale a la mano justo el día en que
//  todos lo piden, o sale un botón a un plato que ya no existe.
// ============================================================================
import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { datosVacios, completarDatos, agregarEmpresa, agregarProducto, nuevoConsumo, borrarProducto } from "../js/nucleo/modelo.js";
import {
  rapidosDe, rapidosGuardados, ponerRapidos, ultimosDeHoy, renombrarEnRapidos, quitarDeRapidos,
  SIEMPRE, MAXIMO,
} from "../js/nucleo/rapidos.js";
import { botonesDelPedido } from "../js/nucleo/habitos.js";
import { unirPlatosDelCatalogo } from "../js/nucleo/sueltos.js";
import { diferencias, aplicar, llaveDeDoc } from "../js/datos/sincronia.js";

function cocina() {
  const d = datosVacios();
  agregarEmpresa(d, { codigo: "MGP", razonSocial: "Industrias MGP" });
  for (const [plato, precio] of [["ALMUERZO", 12000], ["SANCOCHO", 15000], ["JUGO", 3000], ["GASEOSA", 2500], ["OFERTA", 10000]]) {
    agregarProducto(d, plato, { MGP: precio });
  }
  return d;
}

grupo("Botones rápidos: guardar y leer");

prueba("los de hoy se guardan por fecha y mañana arrancan vacíos", () => {
  const d = cocina();
  ponerRapidos(d, "2026-10-19", ["sancocho"]);
  igual(rapidosDe(d, "2026-10-19").validos, ["SANCOCHO"]);
  igual(rapidosDe(d, "2026-10-20").validos, []);
});

prueba("los de siempre van aparte de los del día", () => {
  const d = cocina();
  ponerRapidos(d, SIEMPRE, ["JUGO", "GASEOSA"]);
  ponerRapidos(d, "2026-10-19", ["SANCOCHO"]);
  igual(rapidosDe(d, SIEMPRE).validos, ["JUGO", "GASEOSA"]);
  igual(rapidosDe(d, "2026-10-19").validos, ["SANCOCHO"]);
});

prueba("quita repetidos y respeta el orden en que ella los puso", () => {
  const d = cocina();
  igual(ponerRapidos(d, SIEMPRE, ["JUGO", "ALMUERZO", "jugo"]), ["JUGO", "ALMUERZO"]);
});

prueba("una lista vacía borra la llave: los días sin especiales no ocupan nada", () => {
  const d = cocina();
  ponerRapidos(d, "2026-10-19", ["SANCOCHO"]);
  ponerRapidos(d, "2026-10-19", []);
  igual("2026-10-19" in d.rapidos, false);
});

prueba("un plato que no está en el catálogo no se deja poner, y lo dice", () => {
  const d = cocina();
  let fallo = null;
  try { ponerRapidos(d, SIEMPRE, ["CHURRASCO"]); } catch (e) { fallo = e.message; }
  igual(fallo, '"CHURRASCO" no está en el catálogo.');
  igual(rapidosGuardados(d, SIEMPRE), [], "y no queda nada a medias");
});

prueba("un plato apagado tampoco, y dice cómo arreglarlo", () => {
  const d = cocina();
  d.productos.find((p) => p.nombre === "JUGO").activo = false;
  let fallo = null;
  try { ponerRapidos(d, SIEMPRE, ["JUGO"]); } catch (e) { fallo = e.message; }
  cierto(/apagado.*Préndalo/.test(fallo), fallo);
});

prueba(`no caben más de ${MAXIMO}`, () => {
  const d = cocina();
  for (let i = 1; i <= MAXIMO + 1; i++) agregarProducto(d, "PLATO " + i, { MGP: 1000 });
  const siete = Array.from({ length: MAXIMO + 1 }, (_, i) => "PLATO " + (i + 1));
  let fallo = null;
  try { ponerRapidos(d, SIEMPRE, siete); } catch (e) { fallo = e.message; }
  cierto(/Caben hasta 6/.test(fallo), fallo);
  igual(ponerRapidos(d, SIEMPRE, siete.slice(0, MAXIMO)).length, MAXIMO);
});

prueba("ni una fecha mal escrita ni otra palabra: solo un día o 'siempre'", () => {
  const d = cocina();
  let fallo = null;
  try { ponerRapidos(d, "mañana", ["JUGO"]); } catch (e) { fallo = e.message; }
  cierto(fallo && /un día o de siempre/.test(fallo), fallo);
});

prueba("si un plato se apaga después, no sale como botón pero tampoco desaparece callado", () => {
  const d = cocina();
  ponerRapidos(d, SIEMPRE, ["JUGO", "GASEOSA"]);
  d.productos.find((p) => p.nombre === "JUGO").activo = false;
  const r = rapidosDe(d, SIEMPRE);
  igual(r.validos, ["GASEOSA"]);
  igual(r.perdidos, [{ producto: "JUGO", porque: "está apagado" }]);
});

prueba("datos viejos sin botones abren igual", () => {
  const viejos = completarDatos({ empresas: [], productos: [], personas: [], consumos: [], precios: {}, config: {} });
  igual(viejos.rapidos, {});
  igual(rapidosDe(viejos, SIEMPRE).validos, []);
});

grupo("Botones rápidos: 'los mismos del lunes'");

prueba("ofrece el último día anterior que tuvo especiales", () => {
  const d = cocina();
  ponerRapidos(d, "2026-10-13", ["OFERTA"]);
  ponerRapidos(d, "2026-10-16", ["SANCOCHO"]);
  ponerRapidos(d, "2026-10-21", ["JUGO"]);             // uno del futuro no cuenta
  igual(ultimosDeHoy(d, "2026-10-19"), { fecha: "2026-10-16", platos: ["SANCOCHO"] });
  igual(ultimosDeHoy(d, "2026-10-13"), null);
});

prueba("se salta un día cuyos platos ya no existen", () => {
  const d = cocina();
  ponerRapidos(d, "2026-10-13", ["OFERTA"]);
  ponerRapidos(d, "2026-10-16", ["SANCOCHO"]);
  d.productos.find((p) => p.nombre === "SANCOCHO").activo = false;
  igual(ultimosDeHoy(d, "2026-10-19"), { fecha: "2026-10-13", platos: ["OFERTA"] });
});

grupo("Botones rápidos: cuando el plato cambia de nombre o se va");

prueba("renombrar un plato muda sus botones, sin repetirlo", () => {
  const d = cocina();
  ponerRapidos(d, SIEMPRE, ["JUGO", "GASEOSA"]);
  ponerRapidos(d, "2026-10-19", ["JUGO"]);
  igual(renombrarEnRapidos(d, "JUGO", "GASEOSA"), 2);
  igual(d.rapidos[SIEMPRE], ["GASEOSA"]);
  igual(d.rapidos["2026-10-19"], ["GASEOSA"]);
});

prueba("unir dos platos en el catálogo deja el botón en el que se queda", () => {
  const d = cocina();
  agregarProducto(d, "JUGO NATURAL", { MGP: 3000 });
  ponerRapidos(d, SIEMPRE, ["JUGO NATURAL"]);
  d.consumos.push(nuevoConsumo({ fecha: "2026-10-01", empresa: "MGP", persona: "ANA", producto: "JUGO NATURAL", cantidad: 1, precioUnitario: 3000 }));
  unirPlatosDelCatalogo(d, "JUGO", ["JUGO NATURAL"]);
  igual(rapidosDe(d, SIEMPRE).validos, ["JUGO"]);
});

prueba("borrar un plato lo saca de todos los botones", () => {
  const d = cocina();
  ponerRapidos(d, SIEMPRE, ["JUGO", "GASEOSA"]);
  ponerRapidos(d, "2026-10-19", ["JUGO"]);
  borrarProducto(d, "JUGO");
  igual(d.rapidos[SIEMPRE], ["GASEOSA"]);
  igual("2026-10-19" in d.rapidos, false, "y el día que quedó vacío se va");
  igual(quitarDeRapidos(d, "NO EXISTE"), 0);
});

grupo("Los botones de cada pedido");

function conHistoria() {
  const d = cocina();
  const anotar = (plato, veces) => {
    for (let i = 0; i < veces; i++) {
      d.consumos.push(nuevoConsumo({ fecha: "2026-10-1" + (i % 5), empresa: "MGP", persona: "P" + i, producto: plato, cantidad: 1, precioUnitario: 1000 }));
    }
  };
  anotar("ALMUERZO", 9);
  anotar("OFERTA", 5);
  anotar("GASEOSA", 3);
  return d;
}

prueba("sin escoger nada, salen los más pedidos como antes", () => {
  const b = botonesDelPedido(conHistoria(), "MGP", "2026-10-19");
  igual(b.map((x) => x.producto), ["ALMUERZO", "OFERTA", "GASEOSA"]);
  cierto(b.every((x) => x.origen === "frecuente"));
});

prueba("el de hoy va primero, después los de siempre, después los más pedidos sin repetir", () => {
  const d = conHistoria();
  ponerRapidos(d, "2026-10-19", ["SANCOCHO"]);
  ponerRapidos(d, SIEMPRE, ["JUGO", "ALMUERZO"]);
  const b = botonesDelPedido(d, "MGP", "2026-10-19");
  igual(b.map((x) => `${x.origen}:${x.producto}`), [
    "hoy:SANCOCHO", "siempre:JUGO", "siempre:ALMUERZO", "frecuente:OFERTA", "frecuente:GASEOSA",
  ]);
  igual(b[0].precio, 15000, "con el precio de esta empresa");
});

prueba("el especial de otro día no sale hoy", () => {
  const d = conHistoria();
  ponerRapidos(d, "2026-10-18", ["SANCOCHO"]);
  cierto(!botonesDelPedido(d, "MGP", "2026-10-19").some((x) => x.producto === "SANCOCHO"));
});

prueba("los más pedidos solo llenan el hueco que quede", () => {
  const d = conHistoria();
  ponerRapidos(d, SIEMPRE, ["JUGO", "SANCOCHO"]);
  const b = botonesDelPedido(d, "MGP", "2026-10-19", { relleno: 3 });
  igual(b.map((x) => x.producto), ["JUGO", "SANCOCHO", "ALMUERZO"]);
});

prueba("uno escogido sin precio en esta empresa SÍ sale, con precio null para marcarlo", () => {
  const d = conHistoria();
  agregarEmpresa(d, { codigo: "AGRO", razonSocial: "Agro" });
  delete d.precios["SANCOCHO|AGRO"];   // una empresa nueva hereda los precios: se le quita este
  ponerRapidos(d, "2026-10-19", ["SANCOCHO"]);
  const b = botonesDelPedido(d, "AGRO", "2026-10-19");
  igual(b[0], { producto: "SANCOCHO", origen: "hoy", precio: null });
});

grupo("Botones rápidos en la nube");

prueba("viajan como una colección más, y llegan iguales al otro computador", () => {
  const aqui = cocina();
  const { instantanea: foto } = diferencias(null, aqui);
  ponerRapidos(aqui, "2026-10-19", ["SANCOCHO"]);
  ponerRapidos(aqui, SIEMPRE, ["JUGO"]);
  const { cambios } = diferencias(foto, aqui);
  igual(cambios.map((c) => `${c.coleccion}:${llaveDeDoc(c.id)}`).sort(), ["rapidos:2026-10-19", "rapidos:siempre"]);

  const alla = cocina();
  aplicar(alla, cambios);
  igual(rapidosDe(alla, "2026-10-19").validos, ["SANCOCHO"]);
  igual(rapidosDe(alla, SIEMPRE).validos, ["JUGO"]);
});
