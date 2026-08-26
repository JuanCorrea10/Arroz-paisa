// ============================================================================
//  precios.test.mjs
//
//  El catálogo guardaba un precio por plato Y POR EMPRESA. En los datos de
//  verdad, los 77 platos cuestan lo mismo en las cuatro fábricas: ni uno solo
//  cobra distinto. Lo único que lograba esa columna de más era que cambiar un
//  precio costara cuatro ediciones -- con cuatro oportunidades de escribir mal.
//
//  Y pasó: OFERTA quedó en $ 1.000.000 en una empresa y $ 10.000 en las otras
//  tres. La app no dijo nada, porque solo revisaba que el precio no faltara.
// ============================================================================

import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { precioDelPlato, precioSeVeRaro, precioDe, clavePrecio } from "../js/nucleo/calculos.js";
import { ponerPrecioEnTodas } from "../js/nucleo/modelo.js";

const CODIGOS = ["MGP", "AGRO", "PUNTERAS", "BASARILI"];

function catalogo(precios = {}) {
  return {
    empresas: CODIGOS.map((c) => ({ codigo: c, ultimoDiaQ1: 15 })),
    productos: [{ nombre: "OFERTA" }, { nombre: "ALMUERZO" }],
    personas: [],
    consumos: [],
    precios,
    config: {},
  };
}

function todasA(plato, valor) {
  const p = {};
  for (const c of CODIGOS) p[clavePrecio(plato, c)] = valor;
  return p;
}

// ---------------------------------------------------------------------------
grupo("Precios: un plato tiene UN precio");

prueba("si todas cobran igual, dice cuál es", () => {
  const datos = catalogo(todasA("OFERTA", 10000));
  const info = precioDelPlato(datos, "OFERTA", CODIGOS);
  cierto(info.igual, "debería ver que todas cobran igual");
  igual(info.valor, 10000);
  igual(info.falta, 0);
});

prueba("un plato sin precio en ninguna parte no se inventa uno", () => {
  const info = precioDelPlato(catalogo(), "OFERTA", CODIGOS);
  cierto(info.igual, "no cobrar en ninguna parte sigue siendo 'igual'");
  igual(info.valor, null);
  igual(info.falta, 4);
});

prueba("si falta en una sola, lo dice", () => {
  const precios = todasA("OFERTA", 10000);
  delete precios[clavePrecio("OFERTA", "AGRO")];
  const info = precioDelPlato(catalogo(precios), "OFERTA", CODIGOS);
  igual(info.falta, 1);
  cierto(info.igual, "las que sí tienen precio coinciden");
  igual(info.valor, 10000);
});

prueba("EL CASO REAL: un cero de más en una empresa se detecta", () => {
  // Esto es exactamente lo que estaba pasando en el catálogo de verdad.
  const precios = todasA("OFERTA", 10000);
  precios[clavePrecio("OFERTA", "PUNTERAS")] = 1000000;

  const info = precioDelPlato(catalogo(precios), "OFERTA", CODIGOS);
  cierto(!info.igual, "tiene que ver que PUNTERAS no coincide");
  igual(info.valor, null, "no puede escoger uno de los dos por su cuenta");
  igual(info.porEmpresa.PUNTERAS, 1000000);
  igual(info.porEmpresa.MGP, 10000);
});

// ---------------------------------------------------------------------------
grupo("Precios: escribir uno los escribe todos");

prueba("poner el precio lo pone en las cuatro empresas", () => {
  const datos = catalogo();
  ponerPrecioEnTodas(datos, "OFERTA", CODIGOS, 12000);
  for (const c of CODIGOS) igual(precioDe(datos, "OFERTA", c), 12000);
  cierto(precioDelPlato(datos, "OFERTA", CODIGOS).igual);
});

prueba("arreglar el cero de más deja las cuatro parejas", () => {
  const precios = todasA("OFERTA", 10000);
  precios[clavePrecio("OFERTA", "PUNTERAS")] = 1000000;
  const datos = catalogo(precios);

  ponerPrecioEnTodas(datos, "OFERTA", CODIGOS, 10000);

  const info = precioDelPlato(datos, "OFERTA", CODIGOS);
  cierto(info.igual, "después de arreglarlo tienen que coincidir");
  igual(info.valor, 10000);
});

prueba("dejarlo en blanco borra el precio, NO lo pone en cero", () => {
  // Son cosas distintas: sin precio la app avisa en rojo; en cero cobraría
  // $ 0 calladita y la cuenta saldría por menos sin que nadie lo note.
  const datos = catalogo(todasA("OFERTA", 10000));
  ponerPrecioEnTodas(datos, "OFERTA", CODIGOS, "");
  for (const c of CODIGOS) igual(precioDe(datos, "OFERTA", c), null);
  igual(precioDelPlato(datos, "OFERTA", CODIGOS).falta, 4);
});

prueba("no se cuelan precios negativos", () => {
  const datos = catalogo();
  ponerPrecioEnTodas(datos, "OFERTA", CODIGOS, -5000);
  igual(precioDe(datos, "OFERTA", "MGP"), 0);
});

prueba("cambiar un plato no le toca el precio a otro", () => {
  const datos = catalogo({ ...todasA("OFERTA", 10000), ...todasA("ALMUERZO", 12000) });
  ponerPrecioEnTodas(datos, "OFERTA", CODIGOS, 11000);
  igual(precioDe(datos, "ALMUERZO", "MGP"), 12000);
  igual(precioDe(datos, "OFERTA", "MGP"), 11000);
});

// ---------------------------------------------------------------------------
grupo("Precios: la guardia del cero de más");

prueba("un cero de más se ve raro", () => {
  cierto(precioSeVeRaro(10000, 1000000), "10.000 -> 1.000.000 tiene que avisar");
  cierto(precioSeVeRaro(12000, 120000), "un cero de más también");
});

prueba("un cero de menos también se ve raro", () => {
  cierto(precioSeVeRaro(10000, 1000));
});

prueba("una subida normal de precio NO molesta", () => {
  // Si preguntara por cada subida, ella aprendería a darle a "sí" sin leer,
  // y el día del error de verdad también le daría a "sí".
  cierto(!precioSeVeRaro(12000, 13000), "subir el almuerzo mil pesos es normal");
  cierto(!precioSeVeRaro(10000, 25000), "hasta duplicarlo puede ser real");
  cierto(!precioSeVeRaro(25000, 10000));
});

prueba("ponerle precio a uno que no tenía no molesta", () => {
  cierto(!precioSeVeRaro(null, 25000));
  cierto(!precioSeVeRaro(0, 25000));
});
