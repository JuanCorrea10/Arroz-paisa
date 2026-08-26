// ============================================================================
//  cantidad.test.mjs  -  Escribir la cantidad adelante: "3 almuerzo"
//
//  Ella transcribe de un audio donde le van dictando. Oye "tres almuerzos" y
//  lo natural es escribir "3 almuerzo", no buscar el plato y darle tres veces
//  al mas. Estas pruebas cuidan que no se cuele un numero donde no va: si
//  "COCA COLA 1.5" se leyera como "1 vez COCA COLA .5", se dañaria el pedido.
// ============================================================================

import { grupo, prueba, igual } from "./probar.mjs";
import { separarCantidad } from "../js/ui/componentes.js";

grupo("La cantidad escrita adelante");

prueba("lo normal: un numero, un espacio y el plato", () => {
  igual(separarCantidad("3 almuerzo"), { cuantos: 3, resto: "almuerzo" });
});

prueba("aguanta la equis: 3x almuerzo", () => {
  igual(separarCantidad("3x almuerzo"), { cuantos: 3, resto: "almuerzo" });
});

prueba("aguanta espacios de sobra", () => {
  igual(separarCantidad("  2   coca cola  "), { cuantos: 2, resto: "coca cola" });
});

prueba("sin numero adelante, no cambia nada", () => {
  igual(separarCantidad("almuerzo"), { cuantos: 1, resto: "almuerzo" });
});

prueba("un numero solo NO es una cantidad", () => {
  // Alguien buscando un plato que tiene numeros en el nombre.
  igual(separarCantidad("15"), { cuantos: 1, resto: "15" });
});

prueba("el numero del NOMBRE del plato no se toca", () => {
  // "COCA COLA 1.5" no puede volverse "1 vez COCA COLA .5".
  igual(separarCantidad("coca cola 1.5"), { cuantos: 1, resto: "coca cola 1.5" });
  igual(separarCantidad("quatro 1,5"), { cuantos: 1, resto: "quatro 1,5" });
  igual(separarCantidad("sprite 1.5"), { cuantos: 1, resto: "sprite 1.5" });
});

prueba("pero SI se puede pedir dos de esos", () => {
  igual(separarCantidad("2 coca cola 1.5"), { cuantos: 2, resto: "coca cola 1.5" });
});

prueba("no se aceptan cantidades absurdas", () => {
  // 500 almuerzos de una persona es un dedo pegado en el teclado.
  igual(separarCantidad("500 almuerzo").cuantos, 99);
  igual(separarCantidad("0 almuerzo").cuantos, 1);
});

prueba("aguanta que no le llegue nada", () => {
  igual(separarCantidad(""), { cuantos: 1, resto: "" });
  igual(separarCantidad(null), { cuantos: 1, resto: "" });
});
