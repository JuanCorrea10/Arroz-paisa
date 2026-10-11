// ============================================================================
//  La clave de la dueña: se guarda como huella, se revisa, y dice qué
//  pantallas la piden. Nada de esto puede fallar callado: una clave que no
//  cierra lo que debe deja a cualquiera cambiando precios; una que cierra de
//  más deja a la empleada sin poder anotar.
// ============================================================================
import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { datosVacios, completarDatos } from "../js/nucleo/modelo.js";
import {
  hayClave, ponerClave, quitarClave, esLaClave, revisarClave, pideClave,
  pantallasConClave, ponerPantallasConClave, sePuedeUsarClave,
  CON_CLAVE_POR_DEFECTO, NUNCA_PIDEN, PANTALLA_DE_LA_CLAVE,
} from "../js/nucleo/clave.js";

grupo("La clave de la dueña");

prueba("Node puede sacar huellas (si esto falla, ninguna otra prueba de aquí vale)", () => {
  cierto(sePuedeUsarClave());
});

prueba("sin clave puesta nada la pide, ni siquiera la pantalla de la clave", () => {
  const d = datosVacios();
  igual(hayClave(d), false);
  for (const p of ["catalogo", "datos", "registrar", PANTALLA_DE_LA_CLAVE]) {
    igual(pideClave(d, p), false, p);
  }
});

prueba("se pone, se reconoce, y la equivocada no pasa", async () => {
  const d = datosVacios();
  await ponerClave(d, "arroz2026");
  cierto(hayClave(d));
  cierto(await esLaClave(d, "arroz2026"));
  igual(await esLaClave(d, "arroz2025"), false);
  igual(await esLaClave(d, ""), false);
  igual(await esLaClave(d, "ARROZ2026"), false, "distingue mayúsculas");
});

prueba("un espacio de más al escribirla no la daña", async () => {
  // Ella la va a escribir en una cocina a las seis de la mañana. Un espacio
  // al final no puede ser "clave equivocada".
  const d = datosVacios();
  await ponerClave(d, " 1234 ");
  cierto(await esLaClave(d, "1234"));
  cierto(await esLaClave(d, "1234 "));
});

prueba("la clave NO queda escrita en los datos: solo su huella", async () => {
  const d = datosVacios();
  await ponerClave(d, "mi-clave-secreta");
  const texto = JSON.stringify(d);
  igual(texto.includes("mi-clave-secreta"), false, "los respaldos se mandan por WhatsApp");
  cierto(d.config.clave.huella.length >= 32);
  cierto(d.config.clave.sal.length >= 16);
});

prueba("dos veces la misma clave dejan huellas distintas (la sal)", async () => {
  const a = datosVacios(), b = datosVacios();
  await ponerClave(a, "1234");
  await ponerClave(b, "1234");
  cierto(a.config.clave.huella !== b.config.clave.huella);
});

prueba("una clave corta se rechaza con un mensaje para ella", async () => {
  igual(revisarClave("12"), "La clave debe tener al menos 4 caracteres.");
  igual(revisarClave(""), "Ingrese la clave.");
  igual(revisarClave("   "), "Ingrese la clave.");
  igual(revisarClave("1234"), null);
  const d = datosVacios();
  let fallo = null;
  try { await ponerClave(d, "12"); } catch (e) { fallo = e.message; }
  cierto(fallo && /al menos 4/.test(fallo), "ponerClave también la rechaza: " + fallo);
  igual(hayClave(d), false, "y no deja nada a medias");
});

prueba("sin clave, cualquier cosa es la clave (no hay nada que cerrar)", async () => {
  cierto(await esLaClave(datosVacios(), "lo que sea"));
});

prueba("con clave, las pantallas delicadas la piden y las del día a día no", async () => {
  const d = datosVacios();
  await ponerClave(d, "1234");
  for (const p of CON_CLAVE_POR_DEFECTO) cierto(pideClave(d, p), p + " debería pedirla");
  for (const p of NUNCA_PIDEN) igual(pideClave(d, p), false, p + " no debería pedirla");
  cierto(pideClave(d, PANTALLA_DE_LA_CLAVE), "la pantalla de la clave siempre la pide");
  igual(pideClave(d, "cobro"), false, "la cuenta de cobro queda libre por defecto");
});

prueba("por defecto cierra exactamente lo que ella dijo", () => {
  // Precios, catálogo, personas, empresas, respaldos y la plata del negocio.
  for (const p of ["catalogo", "empresas", "personas", "nombres", "datos", "ventas", "ventasmes", "compras", "pagos"]) {
    cierto(CON_CLAVE_POR_DEFECTO.includes(p), p);
  }
  for (const p of ["registrar", "cocina", "resumen"]) {
    cierto(!CON_CLAVE_POR_DEFECTO.includes(p), p + " es del día a día");
  }
});

prueba("ella puede cambiar qué pantallas la piden", async () => {
  const d = datosVacios();
  await ponerClave(d, "1234");
  ponerPantallasConClave(d, ["catalogo", "cobro"]);
  cierto(pideClave(d, "cobro"));
  igual(pideClave(d, "ventas"), false);
  igual(pideClave(d, "datos"), false);
  cierto(pideClave(d, PANTALLA_DE_LA_CLAVE), "esa no se puede destapar");
});

prueba("lo del día a día no se puede cerrar ni queriendo", async () => {
  // Si Registrar pidiera clave, la empleada no podría trabajar y la clave
  // terminaría pegada en un papel al lado del teclado.
  const d = datosVacios();
  await ponerClave(d, "1234");
  const quedo = ponerPantallasConClave(d, ["registrar", "cocina", "catalogo", "registrar"]);
  igual(quedo, ["catalogo"]);
  igual(pideClave(d, "registrar"), false);
});

prueba("cambiar la clave conserva la lista de pantallas", async () => {
  const d = datosVacios();
  await ponerClave(d, "1234");
  ponerPantallasConClave(d, ["catalogo"]);
  await ponerClave(d, "5678");
  igual(pantallasConClave(d), ["catalogo"]);
  cierto(await esLaClave(d, "5678"));
  igual(await esLaClave(d, "1234"), false, "la vieja ya no sirve");
});

prueba("quitarla abre todo otra vez", async () => {
  const d = datosVacios();
  await ponerClave(d, "1234");
  quitarClave(d);
  igual(hayClave(d), false);
  igual(pideClave(d, "catalogo"), false);
  igual(pideClave(d, PANTALLA_DE_LA_CLAVE), false);
  cierto(await esLaClave(d, "cualquiera"));
});

prueba("no se puede escoger pantallas sin haber puesto clave", () => {
  let fallo = null;
  try { ponerPantallasConClave(datosVacios(), ["catalogo"]); } catch (e) { fallo = e.message; }
  igual(fallo, "Primero debe configurar una clave.");
});

prueba("la clave sobrevive a completarDatos (que es por donde pasa todo archivo)", async () => {
  const d = datosVacios();
  await ponerClave(d, "1234");
  ponerPantallasConClave(d, ["catalogo", "datos"]);
  const otra = completarDatos(JSON.parse(JSON.stringify(d)));
  cierto(hayClave(otra));
  cierto(await esLaClave(otra, "1234"));
  igual(pantallasConClave(otra), ["catalogo", "datos"]);
});

prueba("un archivo viejo sin clave abre sin pedir nada", () => {
  const viejo = completarDatos({ empresas: [], productos: [], personas: [], consumos: [], precios: {}, config: {} });
  igual(hayClave(viejo), false);
  igual(pideClave(viejo, "catalogo"), false);
});

prueba("una clave rota en el archivo (sin huella) cuenta como sin clave, no como cerrada", () => {
  // Si quedara "cerrada" con una huella que no existe, nadie podría entrar
  // nunca: ese es el estado sin salida que no puede existir.
  const d = datosVacios();
  d.config.clave = { pide: ["catalogo"] };
  igual(hayClave(d), false);
  igual(pideClave(d, "catalogo"), false);
});
