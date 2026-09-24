// ============================================================================
//  precio-congelado.test.mjs
//
//  LA REGLA: el precio se congela dentro de cada pedido.
//
//  Cuando ella le sube el precio al almuerzo, los pedidos de ayer tienen que
//  quedarse valiendo lo de ayer. Solo los que se anoten de ahí en adelante
//  valen lo nuevo.
//
//  Por qué importa tanto: una cuenta de cobro entregada el 15 no se puede
//  mover el 20. Si al subir el almuerzo de 12.000 a 13.000 se movieran los
//  pedidos viejos, la quincena que ya se entregó pasaría a decir otro número
//  -- y la fábrica tendría en la mano un papel que ya no coincide con la app.
//  Nadie se daría cuenta hasta que alguien reclame.
//
//  Estas pruebas existen para que ese daño sea imposible de introducir sin
//  que algo se ponga rojo. No prueban una función: prueban la regla, por cada
//  camino que puede escribir un precio.
// ============================================================================

import { grupo, prueba, igual } from "./probar.mjs";
import {
  datosVacios, agregarEmpresa, agregarProducto, nuevoConsumo,
  ponerPrecioEnTodas, ponerlePrecio, heredarPrecios,
} from "../js/nucleo/modelo.js";
import { precioDe, sumar } from "../js/nucleo/calculos.js";

function negocio() {
  const datos = datosVacios();
  agregarEmpresa(datos, { codigo: "MGP", razonSocial: "Industrias MGP" });
  agregarEmpresa(datos, { codigo: "AGRO", razonSocial: "Botas Agro" });
  agregarProducto(datos, "ALMUERZO", { MGP: 12000, AGRO: 12000 });
  return datos;
}

/** Un pedido anotado con el precio que tenga el catálogo en ese momento. */
function anotar(datos, fecha, empresa = "MGP", producto = "ALMUERZO") {
  const c = nuevoConsumo({
    fecha, empresa, persona: "ANA", producto,
    cantidad: 1, precioUnitario: precioDe(datos, producto, empresa),
  });
  datos.consumos.push(c);
  return c;
}

grupo("El precio se congela dentro del pedido");

prueba("subirle el precio a un plato NO mueve los pedidos de antes", () => {
  const datos = negocio();
  const deAyer = anotar(datos, "2026-08-10");
  igual(deAyer.precioUnitario, 12000);

  ponerPrecioEnTodas(datos, "ALMUERZO", ["MGP", "AGRO"], 13000);

  igual(deAyer.precioUnitario, 12000, "el de ayer sigue valiendo lo de ayer");
});

prueba("los que se anoten después sí valen lo nuevo", () => {
  const datos = negocio();
  const deAyer = anotar(datos, "2026-08-10");
  ponerPrecioEnTodas(datos, "ALMUERZO", ["MGP", "AGRO"], 13000);
  const deHoy = anotar(datos, "2026-08-11");

  igual(deAyer.precioUnitario, 12000);
  igual(deHoy.precioUnitario, 13000);
  igual(sumar(datos.consumos), 25000, "la suma respeta los dos precios");
});

prueba("bajarle el precio tampoco mueve los de antes", () => {
  // Bajarlo es más peligroso que subirlo: la cuenta ya entregada quedaría
  // cobrando de MÁS y el reclamo viene de la fábrica.
  const datos = negocio();
  const viejo = anotar(datos, "2026-08-10");
  ponerPrecioEnTodas(datos, "ALMUERZO", ["MGP", "AGRO"], 9000);
  igual(viejo.precioUnitario, 12000);
});

prueba("dejar un plato sin precio no borra el de los pedidos hechos", () => {
  // Un precio en blanco borra el del catálogo. Si además vaciara los pedidos,
  // una quincena entera pasaría a valer $ 0 de un solo toque.
  const datos = negocio();
  const viejo = anotar(datos, "2026-08-10");
  ponerPrecioEnTodas(datos, "ALMUERZO", ["MGP", "AGRO"], null);

  igual(precioDe(datos, "ALMUERZO", "MGP"), null, "el catálogo sí queda sin precio");
  igual(viejo.precioUnitario, 12000, "el pedido no");
});

prueba("cambiarle el precio a una empresa no toca los de la otra", () => {
  const datos = negocio();
  const deMGP = anotar(datos, "2026-08-10", "MGP");
  const deAGRO = anotar(datos, "2026-08-10", "AGRO");

  ponerPrecioEnTodas(datos, "ALMUERZO", ["MGP"], 20000);

  igual(deMGP.precioUnitario, 12000);
  igual(deAGRO.precioUnitario, 12000);
  igual(precioDe(datos, "ALMUERZO", "MGP"), 20000);
  igual(precioDe(datos, "ALMUERZO", "AGRO"), 12000);
});

prueba("volver a guardar el plato en el catálogo no mueve nada", () => {
  // agregarProducto se llama también para actualizar precios. No puede
  // aprovechar y tocar lo ya anotado.
  const datos = negocio();
  const viejo = anotar(datos, "2026-08-10");
  agregarProducto(datos, "ALMUERZO", { MGP: 18000, AGRO: 18000 });
  igual(viejo.precioUnitario, 12000);
});

prueba("heredarle los precios a una empresa nueva no mueve los pedidos", () => {
  const datos = negocio();
  const viejo = anotar(datos, "2026-08-10");
  agregarEmpresa(datos, { codigo: "CASA", razonSocial: "Arroz Paisa" });
  heredarPrecios(datos, "CASA");
  igual(viejo.precioUnitario, 12000);
});

grupo("Arreglar un pedido en $ 0 sí lo toca, y solo a ese");

prueba("ponerlePrecio arregla los renglones que se le dan y ninguno más", () => {
  // Es la única puerta que puede mover el precio de un pedido ya hecho, y se
  // abre a mano: ella escoge los renglones. Por eso recibe la lista exacta y
  // no sale a buscar por catálogo.
  const datos = negocio();
  const enCero = anotar(datos, "2026-08-10");
  enCero.precioUnitario = 0;
  const bueno = anotar(datos, "2026-08-10");

  const r = ponerlePrecio(datos, [enCero], 12000, false);

  igual(enCero.precioUnitario, 12000, "el que se le pasó, arreglado");
  igual(bueno.precioUnitario, 12000, "el otro, intacto");
  igual(r.arreglados, 1);
  igual(r.sube, 12000, "y dice cuánto le sube la cuenta a la empresa");
});

prueba("arreglar un pedido no le cambia el precio a los demás del mismo plato", () => {
  const datos = negocio();
  const viejo = anotar(datos, "2026-08-01");
  const enCero = anotar(datos, "2026-08-10");
  enCero.precioUnitario = 0;

  ponerlePrecio(datos, [enCero], 15000, true);

  igual(viejo.precioUnitario, 12000, "el de antes no se mueve");
  igual(enCero.precioUnitario, 15000);
  igual(precioDe(datos, "ALMUERZO", "MGP"), 15000, "el catálogo sí queda con el nuevo");
});
