// ============================================================================
//  entrar.js  -  La pantalla de entrar con la cuenta (solo con la nube)
//
//  Sale una sola vez por computador: Firebase guarda la sesión, así que al
//  día siguiente la app abre derecho en Registrar. Por eso es una pantalla
//  y no una ventanita: cuando sale, es porque de verdad no hay nadie adentro
//  y no se puede hacer nada hasta que alguien entre.
// ============================================================================

import { el, poner, vaciar } from "./componentes.js";
import * as nube from "../datos/nube.js";

/**
 * Pinta la pantalla y devuelve una promesa que se cumple cuando alguien
 * entró bien. No se rechaza nunca: si la clave está mal, se dice y se
 * vuelve a intentar ahí mismo.
 */
export function pintarEntrar(raiz) {
  return new Promise((resolver) => {
    vaciar(raiz);

    const correo = el("input", {
      type: "email", id: "entrar-correo", autocomplete: "username",
      placeholder: "nombre@arrozpaisa.co", inputmode: "email", spellcheck: "false",
    });
    const clave = el("input", {
      type: "password", id: "entrar-clave", autocomplete: "current-password", clase: "campo-clave",
    });
    const ver = el("input", { type: "checkbox", estilo: "width:auto;min-height:auto" });
    ver.addEventListener("change", () => { clave.type = ver.checked ? "text" : "password"; });
    const error = el("p", { clase: "nota malo oculto", role: "alert" });
    const boton = el("button", { clase: "principal", type: "submit" }, "Entrar");

    const formulario = el("form", { clase: "entrar-formulario" },
      el("div", { clase: "campo" }, el("label", { for: correo.id, texto: "Correo de la cuenta" }), correo),
      el("div", { clase: "campo" }, el("label", { for: clave.id, texto: "Clave" }), clave),
      el("label", { clase: "casilla-ver" }, ver, " Mostrar la clave"),
      error,
      el("div", { clase: "acciones" }, boton)
    );

    formulario.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.classList.add("oculto");
      if (!correo.value.trim() || !clave.value) {
        error.textContent = "Escriba el correo y la clave de la cuenta.";
        error.classList.remove("oculto");
        return;
      }
      boton.disabled = true;
      boton.textContent = "Entrando…";
      try {
        const quien = await nube.entrar(correo.value, clave.value);
        resolver(quien);
      } catch (ex) {
        error.textContent = String(ex.message || ex);
        error.classList.remove("oculto");
        boton.disabled = false;
        boton.textContent = "Entrar";
        clave.value = "";
        clave.focus();
      }
    });

    poner(raiz,
      el("section", { clase: "tarjeta entrar" },
        el("h1", { texto: "Arroz Paisa" }),
        el("p", { texto: "Entre con la cuenta de este computador. Solo se pide una vez: después la aplicación abre directamente." }),
        formulario,
        el("p", { clase: "nota", texto:
          "Si no tiene cuenta o no recuerda la clave, comuníquese con el administrador. " +
          "Para entrar la primera vez hace falta internet." })
      )
    );
    setTimeout(() => correo.focus(), 50);
  });
}
