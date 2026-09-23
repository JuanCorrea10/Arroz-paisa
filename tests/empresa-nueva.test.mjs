// ============================================================================
//  empresa-nueva.test.mjs
//
//  Una empresa recién creada tiene que poder recibir pedidos DE UNA.
//
//  El precio se guarda por plato Y POR EMPRESA. Eso hacía que una empresa
//  nueva naciera con los 77 platos "sin precio": ella la creaba, iba a anotar
//  el primer pedido y todo le decía "sin precio". Pasó de verdad, con la
//  empresa del propio restaurante.
//
//  Lo peligroso de heredar precios es heredarlos mal, así que aquí se vigila
//  lo contrario: que NO invente un precio donde no lo hay, que no pise el que
//  ya está, y que diga en voz alta lo que no pudo llenar. Un plato que queda
//  sin precio avisa; uno que queda en cero cobra $ 0 calladito.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import {
  datosVacios, agregarEmpresa, agregarProducto,
  preciosQueLeFaltan, heredarPrecios,
} from "../js/nucleo/modelo.js";
import { precioDe } from "../js/nucleo/calculos.js";

/** Un negocio con dos empresas y unos platos con precio en las dos. */
function negocio(precios = { ALMUERZO: 12000, GASEOSA: 7000 }) {
  const datos = datosVacios();
  agregarEmpresa(datos, { codigo: "MGP", razonSocial: "Industrias MGP" });
  agregarEmpresa(datos, { codigo: "AGRO", razonSocial: "Botas Agro" });
  for (const [plato, valor] of Object.entries(precios)) {
    agregarProducto(datos, plato, { MGP: valor, AGRO: valor });
  }
  return datos;
}

grupo("Una empresa nueva nace con precios");

prueba("la empresa nueva puede cobrar desde el primer día", () => {
  // El bug: se creaba la empresa del restaurante y los 77 platos salían
  // "sin precio". No se podía anotar un solo pedido.
  const datos = negocio();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });

  igual(precioDe(datos, "ALMUERZO", "CASA"), 12000);
  igual(precioDe(datos, "GASEOSA", "CASA"), 7000);
});

prueba("no le cambia el precio a las que ya estaban", () => {
  const datos = negocio();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  igual(precioDe(datos, "ALMUERZO", "MGP"), 12000);
  igual(precioDe(datos, "ALMUERZO", "AGRO"), 12000);
});

prueba("la primera empresa de todas no hereda nada, y no revienta", () => {
  const datos = datosVacios();
  agregarProducto(datos, "ALMUERZO");
  agregarEmpresa(datos, { codigo: "MGP", razonSocial: "Industrias MGP" });
  igual(precioDe(datos, "ALMUERZO", "MGP"), null, "sin precio, que es visible");
});

grupo("Heredar precios sin inventar ninguno");

prueba("si las otras dicen precios distintos, NO escoge una", () => {
  // Escoger una sería inventar. Sin precio la app avisa y ella lo arregla;
  // con un precio inventado la cuenta de cobro sale mal y nadie se entera.
  const datos = negocio();
  agregarProducto(datos, "SOPA", { MGP: 5000, AGRO: 6000 });

  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  igual(precioDe(datos, "SOPA", "CASA"), null);
  igual(precioDe(datos, "ALMUERZO", "CASA"), 12000, "los que sí coinciden entran igual");
});

prueba("un plato que ninguna tiene queda sin precio", () => {
  const datos = negocio();
  agregarProducto(datos, "POSTRE");     // sin precio en ninguna

  const faltan = preciosQueLeFaltan(datos, "CASA");
  const postre = faltan.noSePueden.find((x) => x.plato === "POSTRE");
  cierto(postre, "sale en la lista de los que no se pueden");
  igual(postre.porque, "ninguna otra empresa lo tiene");
});

prueba("dice cuáles no pudo llenar, no los calla", () => {
  // Llenar 2 y callar el tercero dejaría un plato cobrando $ 0 sin que nadie
  // lo note. El que no se pudo tiene que salir dicho.
  const datos = negocio();
  agregarProducto(datos, "SOPA", { MGP: 5000, AGRO: 6000 });
  agregarProducto(datos, "POSTRE");

  const r = heredarPrecios(datos, "CASA");
  igual(r.copiados, 2, "almuerzo y gaseosa");
  igual(r.quedanSinPrecio.map((x) => x.plato).sort(), ["POSTRE", "SOPA"]);
});

prueba("no pisa un precio que la empresa ya tenía", () => {
  // Si alguien le puso a esa empresa un precio distinto a propósito, heredar
  // no puede borrárselo.
  const datos = negocio();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  datos.precios["ALMUERZO|CASA"] = 9000;

  heredarPrecios(datos, "CASA");
  igual(precioDe(datos, "ALMUERZO", "CASA"), 9000);
});

prueba("un plato apagado no se cuenta: no se puede pedir", () => {
  const datos = negocio();
  agregarProducto(datos, "TAMAL", { MGP: 8000, AGRO: 8000 });
  datos.productos.find((p) => p.nombre === "TAMAL").activo = false;

  const faltan = preciosQueLeFaltan(datos, "CASA");
  igual(faltan.sePueden.map((x) => x.plato).includes("TAMAL"), false);
});

prueba("la casa no sirve de fuente para los precios", () => {
  // La casa es el restaurante comiéndose lo suyo. Si algún día le ponen los
  // platos en cero, heredar de ahí metería ceros -- y un cero cobra $ 0
  // calladito, que es lo único que no se puede permitir.
  const datos = datosVacios();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa", esCasa: true });
  agregarProducto(datos, "ALMUERZO", { CASA: 0 });

  agregarEmpresa(datos, { codigo: "NUEVA", razonSocial: "Otra" });
  igual(precioDe(datos, "ALMUERZO", "NUEVA"), null, "sin precio, no cero");
});

prueba("la casa SÍ hereda de las empresas de verdad", () => {
  // Al revés sí: el plato que se come la gente de la casa vale lo que vale,
  // aunque no se le cobre a nadie.
  const datos = negocio();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa", esCasa: true });
  igual(precioDe(datos, "ALMUERZO", "CASA"), 12000);
});

prueba("volver a heredar sobre una empresa ya llena no hace nada", () => {
  const datos = negocio();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  const otra = heredarPrecios(datos, "CASA");
  igual(otra.copiados, 0);
  igual(otra.quedanSinPrecio, []);
});

prueba("heredar no guarda campos raros dentro de los datos", () => {
  // Un campo de paso dentro de datos se escribe en el archivo y después nadie
  // sabe qué es.
  const datos = negocio();
  const antes = Object.keys(datos).sort();
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  igual(Object.keys(datos).sort(), antes);
});
