// ============================================================================
//  decir-rango.test.mjs
//
//  Cómo se DICE en el papel de qué día a qué día va una cuenta.
//
//  Parece cosa de estética y no lo es: el contador de la fábrica archiva por
//  ese renglón. Si una cuenta que va del 1 de enero al 31 de diciembre dice
//  "Del 1 al 31 de agosto", el papel cubre una cosa y dice otra, y nadie lo
//  nota hasta que se reclama un pago que ya estaba cobrado.
// ============================================================================

import { grupo, prueba, igual } from "./probar.mjs";
import { rangoEnPalabras, rangoParaArchivo, diasDichos } from "../js/nucleo/formato.js";

grupo("Decir un rango de fechas");

prueba("dentro del mismo mes no repite el mes", () => {
  igual(rangoEnPalabras("2026-08-01", "2026-08-15"), "Del 1 al 15 de agosto de 2026");
});

prueba("cruzando meses dice los dos meses", () => {
  igual(rangoEnPalabras("2026-08-20", "2026-09-05"),
        "Del 20 de agosto al 5 de septiembre de 2026");
});

prueba("cruzando años dice los dos años", () => {
  igual(rangoEnPalabras("2026-12-28", "2027-01-10"),
        "Del 28 de diciembre de 2026 al 10 de enero de 2027");
});

prueba("el año entero se lee como el año entero", () => {
  igual(rangoEnPalabras("2026-01-01", "2026-12-31"),
        "Del 1 de enero al 31 de diciembre de 2026");
});

prueba("un solo día no se rompe", () => {
  igual(rangoEnPalabras("2026-08-07", "2026-08-07"), "Del 7 al 7 de agosto de 2026");
});

prueba("sin fechas de verdad no inventa nada", () => {
  // Devolver "" deja el renglón vacío, que se ve. Inventar un mes no se ve.
  igual(rangoEnPalabras("", "2026-08-15"), "");
  igual(rangoEnPalabras("2026-08-01", 15), "");
  igual(rangoEnPalabras(null, null), "");
});

prueba("el nombre del archivo lleva las dos fechas completas", () => {
  // Con fechas completas los PDF de una empresa quedan ordenados solos en la
  // carpeta, y dos cuentas del mismo mes no se pisan.
  igual(rangoParaArchivo("2026-01-01", "2026-12-31"), "2026-01-01_al_2026-12-31");
});

// ---------------------------------------------------------------------------
grupo("Listar fechas sin volverse ilegible");

prueba("del mismo mes: basta el número del día", () => {
  igual(diasDichos(["2026-08-06", "2026-08-10", "2026-08-11"]), ["6", "10", "11"]);
});

prueba("de meses distintos: lleva el mes, que si no \"el 3\" son dos días", () => {
  igual(diasDichos(["2026-08-06", "2026-09-03"]), ["6 ago", "3 sep"]);
});

prueba("de años distintos también lleva el mes", () => {
  igual(diasDichos(["2026-12-28", "2027-01-03"]), ["28 dic", "3 ene"]);
});

prueba("una sola fecha, o ninguna, no se rompe", () => {
  igual(diasDichos(["2026-08-06"]), ["6"]);
  igual(diasDichos([]), []);
  igual(diasDichos(null), []);
});

prueba("lo que no es fecha no se cuela", () => {
  igual(diasDichos(["2026-08-06", "", null, "manana"]), ["6"]);
});
