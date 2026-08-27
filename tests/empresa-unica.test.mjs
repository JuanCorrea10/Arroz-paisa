// ============================================================================
//  empresa-unica.test.mjs
//
//  Tres cosas que antes no se podían hacer y ahora sí. Las tres tocan plata,
//  así que aquí se mide la plata, no solo que "no reviente".
//
//   1. Una sola empresa por renglón. Antes cada renglón traía dos: dónde comió
//      y a quién se le cobra. En los datos de verdad nunca fueron distintas
//      (1135 renglones, 1135 veces la misma), pero la app dejaba separarlas.
//
//   2. Cambiarle la empresa a una persona. Hacía falta porque la misma persona
//      quedaba anotada dos veces, una en cada sede, y unir solo se puede
//      dentro de la misma empresa -- así que esas dos fichas no había forma
//      de juntarlas.
//
//   3. Unir dos platos del catálogo. Mismo problema del otro lado: AGUA GAS y
//      AGUA CON GAS salían como dos platos distintos en la cuenta de cobro.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { completarDatos, unificarEmpresa } from "../js/nucleo/modelo.js";
import { simularCambioDeEmpresa, cambiarDeEmpresa } from "../js/nucleo/nombres.js";
import { simularUnionDePlatos, unirPlatosDelCatalogo } from "../js/nucleo/sueltos.js";
import { clavePrecio, sumar, delMes } from "../js/nucleo/calculos.js";

/** Un mundo chiquito, con las dos sedes vecinas del caso de verdad. */
function mundo() {
  const c = (id, fecha, empresa, persona, producto, cantidad, precioUnitario) => ({
    id, fecha, empresa, persona, producto, cantidad, precioUnitario,
    facturable: true, observacion: "", revisar: [],
  });
  return {
    version: 1,
    config: { anio: 2026, mes: 8, acreedor: {} },
    empresas: [
      { codigo: "AGRO", razonSocial: "BOTAS AGROINDUSTRIAL SAS", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
      { codigo: "PUNTERAS", razonSocial: "BOTAS AGROINDUSTRIAL SAS", ultimoDiaQ1: 14, ultimoDiaQ2: 31, activa: true },
    ],
    personas: [
      { nombre: "JUAN PEREZ", empresa: "AGRO", activa: true },
      { nombre: "JUAN PEREZ", empresa: "PUNTERAS", activa: true },
      { nombre: "MARTA SALGADO", empresa: "AGRO", activa: true },
    ],
    productos: [
      { nombre: "AGUA GAS", activo: true },
      { nombre: "AGUA CON GAS", activo: true },
      { nombre: "ALMUERZO", activo: true },
    ],
    precios: {
      [clavePrecio("AGUA GAS", "AGRO")]: 3000,
      [clavePrecio("AGUA GAS", "PUNTERAS")]: 3000,
      [clavePrecio("AGUA CON GAS", "AGRO")]: 3000,
      [clavePrecio("AGUA CON GAS", "PUNTERAS")]: 3000,
      [clavePrecio("ALMUERZO", "AGRO")]: 12000,
      [clavePrecio("ALMUERZO", "PUNTERAS")]: 12000,
    },
    consumos: [
      c("1", "2026-08-03", "AGRO", "JUAN PEREZ", "ALMUERZO", 1, 12000),
      c("2", "2026-08-04", "AGRO", "JUAN PEREZ", "AGUA GAS", 1, 3000),
      c("3", "2026-08-05", "PUNTERAS", "JUAN PEREZ", "ALMUERZO", 2, 12000),
      c("4", "2026-08-06", "PUNTERAS", "JUAN PEREZ", "AGUA CON GAS", 1, 3000),
      c("5", "2026-08-07", "AGRO", "MARTA SALGADO", "AGUA CON GAS", 1, 3000),
    ],
    cuadres: {},
  };
}

const deLaEmpresa = (datos, cod) => datos.consumos.filter((x) => x.empresa === cod);

// ---------------------------------------------------------------------------
grupo("Una sola empresa: los datos viejos se traducen solos");

prueba("un renglón viejo con las dos iguales queda con esa", () => {
  const datos = { consumos: [{ empresaCome: "AGRO", empresaFactura: "AGRO" }], personas: [] };
  const r = unificarEmpresa(datos);
  igual(datos.consumos[0].empresa, "AGRO");
  igual(datos.consumos[0].empresaCome, undefined, "el campo viejo se va");
  igual(datos.consumos[0].empresaFactura, undefined);
  igual(r.renglones, 0, "no había nada raro que contar");
});

prueba("si venían distintas manda la de cobro, y se cuenta", () => {
  // Es la regla que no cambia la plata: a PUNTERAS se le pasó la cuenta, así
  // que el renglón se queda en PUNTERAS. Y se cuenta para poder avisar.
  const datos = {
    consumos: [{ empresaCome: "AGRO", empresaFactura: "PUNTERAS" }],
    personas: [{ nombre: "X", empresaCome: "AGRO", empresaFactura: "PUNTERAS" }],
  };
  const r = unificarEmpresa(datos);
  igual(datos.consumos[0].empresa, "PUNTERAS");
  igual(datos.personas[0].empresa, "PUNTERAS");
  igual(r.renglones, 1);
  igual(r.personas, 1);
});

prueba("un renglón que ya está al día no se toca", () => {
  const datos = { consumos: [{ empresa: "AGRO" }], personas: [] };
  unificarEmpresa(datos);
  igual(datos.consumos[0].empresa, "AGRO");
});

prueba("completarDatos hace la traducción al cargar", () => {
  const datos = completarDatos({
    version: 1,
    config: {},
    empresas: [], productos: [], precios: {}, cuadres: {},
    personas: [{ nombre: "X", empresaCome: "AGRO", empresaFactura: "AGRO" }],
    consumos: [{ fecha: "2026-08-01", empresaCome: "AGRO", empresaFactura: "AGRO", persona: "X", producto: "ALMUERZO", cantidad: 1, precioUnitario: 100 }],
  });
  igual(datos.consumos[0].empresa, "AGRO");
  igual(datos.personas[0].empresa, "AGRO");
});

// ---------------------------------------------------------------------------
grupo("Cambiarle la empresa a una persona");

prueba("dice cuánta plata se mueve antes de moverla", () => {
  const datos = mundo();
  const p = simularCambioDeEmpresa(datos, "AGRO", "MARTA SALGADO", "PUNTERAS");
  igual(p.renglones, 1);
  igual(p.plata, 3000);
  igual(p.seFusiona, false, "en PUNTERAS no hay ninguna MARTA");
});

prueba("mover a alguien mueve sus renglones y no crea ni pierde plata", () => {
  const datos = mundo();
  const totalAntes = sumar(datos.consumos);
  cambiarDeEmpresa(datos, "AGRO", "MARTA SALGADO", "PUNTERAS");

  igual(sumar(datos.consumos), totalAntes, "el total del negocio no cambia");
  igual(sumar(deLaEmpresa(datos, "AGRO")), 15000, "AGRO baja los 3000 de Marta");
  igual(sumar(deLaEmpresa(datos, "PUNTERAS")), 30000, "y PUNTERAS los sube");
  igual(datos.personas.filter((x) => x.nombre === "MARTA SALGADO").length, 1);
  igual(datos.personas.find((x) => x.nombre === "MARTA SALGADO").empresa, "PUNTERAS");
});

prueba("si allá ya hay alguien con ese nombre, la mudanza los une", () => {
  // Este es EL caso: la misma persona anotada dos veces, una en cada sede.
  const datos = mundo();
  const p = simularCambioDeEmpresa(datos, "AGRO", "JUAN PEREZ", "PUNTERAS");
  igual(p.seFusiona, true);
  igual(p.renglones, 2, "los dos de AGRO");
  igual(p.renglonesDeLaOtra, 2, "y los dos que ya estaban en PUNTERAS");

  const totalAntes = sumar(datos.consumos);
  const hecho = cambiarDeEmpresa(datos, "AGRO", "JUAN PEREZ", "PUNTERAS");

  igual(hecho.hecho, true);
  igual(sumar(datos.consumos), totalAntes, "el total no cambia");
  igual(datos.personas.filter((x) => x.nombre === "JUAN PEREZ").length, 1,
        "queda UNA sola ficha de Juan");
  igual(deLaEmpresa(datos, "AGRO").length, 1, "en AGRO solo queda Marta");
  igual(datos.consumos.filter((x) => x.persona === "JUAN PEREZ" && x.empresa === "PUNTERAS").length, 4);
});

prueba("mover a la misma empresa no hace nada", () => {
  const datos = mundo();
  const r = cambiarDeEmpresa(datos, "AGRO", "MARTA SALGADO", "AGRO");
  igual(r.hecho, false);
  igual(deLaEmpresa(datos, "AGRO").length, 3);
});

// ---------------------------------------------------------------------------
grupo("Unir dos platos del catálogo");

prueba("dice cuánto valían y cuánto van a valer", () => {
  const datos = mundo();
  const p = simularUnionDePlatos(datos, "AGUA GAS", ["AGUA CON GAS"]);
  igual(p.renglones, 2, "los dos renglones de AGUA CON GAS");
  igual(p.diferencia, 0, "valen lo mismo, así que no se mueve plata");
});

prueba("unir dos platos deja uno solo y mueve sus renglones", () => {
  const datos = mundo();
  const totalAntes = sumar(datos.consumos);
  const hecho = unirPlatosDelCatalogo(datos, "AGUA GAS", ["AGUA CON GAS"]);

  igual(hecho.hecho, true);
  igual(sumar(datos.consumos), totalAntes, "valían lo mismo: nada cambia");
  igual(datos.productos.map((x) => x.nombre).sort(), ["AGUA GAS", "ALMUERZO"]);
  igual(datos.consumos.filter((x) => x.producto === "AGUA CON GAS").length, 0);
  igual(datos.consumos.filter((x) => x.producto === "AGUA GAS").length, 3);
  igual(datos.precios[clavePrecio("AGUA CON GAS", "AGRO")], undefined,
        "el precio del que se fue no se queda dando vueltas");
});

prueba("si no valían lo mismo, la plata se mueve y se puede ver antes", () => {
  const datos = mundo();
  // El que se queda vale 5000; el que se absorbe valía 3000.
  datos.precios[clavePrecio("AGUA GAS", "AGRO")] = 5000;
  datos.precios[clavePrecio("AGUA GAS", "PUNTERAS")] = 5000;

  const p = simularUnionDePlatos(datos, "AGUA GAS", ["AGUA CON GAS"]);
  igual(p.antes, 6000, "dos renglones a 3000");
  igual(p.despues, 10000, "los mismos dos, ahora a 5000");
  igual(p.diferencia, 4000);

  const antesDeUnir = sumar(delMes(datos.consumos, 2026, 8));
  unirPlatosDelCatalogo(datos, "AGUA GAS", ["AGUA CON GAS"]);
  igual(sumar(delMes(datos.consumos, 2026, 8)), antesDeUnir + 4000,
        "el mes sube exactamente lo que dijo la simulación");
});

prueba("no se puede unir hacia un plato que no está en el catálogo", () => {
  const datos = mundo();
  let reventó = false;
  try {
    unirPlatosDelCatalogo(datos, "SANCOCHO", ["AGUA GAS"]);
  } catch {
    reventó = true;
  }
  cierto(reventó, "tenía que avisar");
  igual(datos.consumos.filter((x) => x.producto === "AGUA GAS").length, 1,
        "y no tocó nada");
});
