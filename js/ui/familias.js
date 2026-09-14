// ============================================================================
//  familias.js  -  Pantallas que son la misma cosa vista por pedazos
//
//  "Las listas" -- Personas, Platos, Empresas y Nombres repetidos -- no son
//  cuatro secciones distintas: son las cuatro listas de las que se alimenta
//  todo lo demás. Quien va a una, muchas veces va a otra en seguida.
//
//  Tenerlas como cuatro pestañas sueltas llenaba la barra. Mandarlas a la
//  portada las volvía incómodas: cambiarle el precio a un plato costaba
//  SALIRSE de lo que estaba haciendo, ir a la portada, buscar y entrar.
//
//  Así que van como UNA sola entrada en la barra, y adentro se pasa de una a
//  otra de un toque, sin salirse. Un sitio para acordarse y cero rodeos.
//
//  Ojo con la diferencia que costó entenderla: CREAR algo nuevo no pasa por
//  aquí. Una persona nueva se crea escribiendo su nombre en Registrar, y un
//  precio que falta se arregla desde la misma Cuenta de cobro. Esto es para
//  REVISAR y EDITAR las listas, que es otra cosa y se hace de vez en cuando.
// ============================================================================

import { el } from "./componentes.js";

export const FAMILIAS = [
  {
    id: "listas",
    nombre: "Listas",
    dice: "La gente, los platos y las empresas",
    // La primera es a la que se entra desde la barra.
    pantallas: [
      { cual: "personas", titulo: "Personas" },
      { cual: "catalogo", titulo: "Platos y precios" },
      { cual: "empresas", titulo: "Empresas" },
      { cual: "nombres", titulo: "Nombres repetidos" },
    ],
  },
];

/** La familia a la que pertenece una pantalla, o null. */
export function familiaDe(cual) {
  return FAMILIAS.find((f) => f.pantallas.some((p) => p.cual === cual)) || null;
}

/**
 * La tira para pasar de una lista a otra, sin salirse.
 *
 * Va ARRIBA del título de la pantalla, no abajo: primero se ve en qué familia
 * está parada y después qué está mirando. Al revés se lee como si fueran
 * botones de la pantalla.
 */
export function barraDeFamilia(cual) {
  const familia = familiaDe(cual);
  if (!familia) return null;

  return el("nav", { clase: "familia", "aria-label": familia.nombre },
    el("span", { clase: "familia-rotulo", texto: familia.nombre + ":" }),
    ...familia.pantallas.map((p) =>
      el("a", {
        clase: "familia-enlace" + (p.cual === cual ? " puesta" : ""),
        href: "#" + p.cual,
        "aria-current": p.cual === cual ? "page" : null,
      }, p.titulo)
    )
  );
}
