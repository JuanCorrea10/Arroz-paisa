// ============================================================================
//  sueltos.js  -  Los renglones que apuntan a algo que no existe.
//
//  Hay renglones registrados a nombre de una persona que no está en la lista
//  de su empresa, o con un plato que no está en el catálogo. En el Excel esos
//  renglones entraban en $ 0 y además no aparecían en la Cocina: se vendía la
//  comida y no se cobraba, calladito.
//
//  Casi siempre no son cosas nuevas, son cosas MAL ESCRITAS:
//
//      MARTHA SALGADO   cuando en MGP existe MARTA SALGADO
//      AGUA CON GAS     cuando en el catálogo existe AGUA GAS
//
//  Este archivo los encuentra y propone a qué se parecen. NO decide: para eso
//  está ella. Lo único que hace la app es no dejar que pasen desapercibidos.
//
//  Como calculos.js y nombres.js, es PURO: recibe datos y devuelve datos.
// ============================================================================

import { normalizar } from "./formato.js";
import { clavePersona, clavePrecio, subtotal } from "./calculos.js";
import {
  limpiarNombre, esqueleto, distancia, parecidasEnEmpresa,
} from "./nombres.js";

// ---------------------------------------------------------------------------
//  Palabras que no cambian de qué se está hablando
//
//  "AGUA GAS" y "AGUA CON GAS" son la misma agua: lo único que sobra es "CON".
//  "COMBO COSTILLAS" y "COMBO DE COSTILLAS", lo mismo con "DE".
//
//  En cambio "COMBO ALITAS" y "COMBO DE ALAS" NO son obvios, porque además del
//  "DE" cambia ALITAS por ALAS, y eso ya puede ser otro plato de otro precio.
//  Por eso la regla mira exactamente CUÁLES son las palabras que sobran.
// ---------------------------------------------------------------------------

const PALABRAS_DE_RELLENO = new Set([
  "DE", "DEL", "CON", "SIN", "EN", "A", "AL", "Y", "O",
  "LA", "EL", "LOS", "LAS", "UN", "UNA", "UNOS", "UNAS",
]);

/** Las palabras de un texto, sin tildes, sin repetir el orden. */
function palabrasDe(texto) {
  return esqueleto(texto).split(" ").filter(Boolean);
}

/** Lo que le sobra a la lista larga respecto de la corta. */
function loQueSobra(cortas, largas) {
  const libres = [...largas];
  for (const p of cortas) {
    const donde = libres.indexOf(p);
    if (donde === -1) return null; // no cabe: no es un caso de "le sobra"
    libres.splice(donde, 1);
  }
  return libres;
}

// ---------------------------------------------------------------------------
//  Comparar dos nombres de plato
// ---------------------------------------------------------------------------

/**
 * ¿Estos dos platos son el mismo?
 * Devuelve null, o { razon, fuerza, obvio }.
 *
 * "obvio" quiere decir que se puede dejar marcado de una para que ella solo
 * confirme. Nunca quiere decir que se aplique solo: esto mueve plata.
 */
export function compararPlatos(a, b) {
  const limpioA = limpiarNombre(a);
  const limpioB = limpiarNombre(b);
  if (!limpioA || !limpioB) return null;
  if (normalizar(a) === normalizar(b)) return null;

  const esqA = esqueleto(a);
  const esqB = esqueleto(b);

  // Mismas palabras, otro orden o con basura de por medio.
  if (esqA === esqB) {
    return { razon: "es el mismo plato escrito distinto", fuerza: 4, obvio: true };
  }

  // A uno le sobran palabras. Si lo único que sobra es relleno ("CON", "DE"),
  // es el mismo plato con el nombre más largo.
  const palA = palabrasDe(a);
  const palB = palabrasDe(b);
  const cortas = palA.length <= palB.length ? palA : palB;
  const largas = palA.length <= palB.length ? palB : palA;
  const sobra = loQueSobra(cortas, largas);

  if (sobra && sobra.length) {
    if (sobra.every((p) => PALABRAS_DE_RELLENO.has(p))) {
      return {
        razon: `es el mismo plato, solo sobra "${sobra.join(" ").toLowerCase()}"`,
        fuerza: 4,
        obvio: true,
      };
    }
    return {
      razon: `uno dice además "${sobra.join(" ").toLowerCase()}"`,
      fuerza: 2,
      obvio: false,
    };
  }

  // Una sola letra de diferencia en todo el nombre.
  if (distancia(esqA, esqB, 1) === 1) {
    return { razon: "se diferencian en una sola letra", fuerza: 3, obvio: false };
  }

  return null;
}

/** Los platos del catálogo que se parecen a este nombre. */
export function parecidosEnCatalogo(datos, nombrePlato) {
  const encontrados = [];
  for (const p of datos.productos) {
    const c = compararPlatos(nombrePlato, p.nombre);
    if (c) encontrados.push({ producto: p, ...c });
  }
  return encontrados.sort((a, b) => b.fuerza - a.fuerza);
}

// ---------------------------------------------------------------------------
//  Marcar como revisado, para que deje de preguntar
// ---------------------------------------------------------------------------

export function llaveSuelto(tipo, empresa, nombre) {
  return `${tipo}|${normalizar(empresa)}|${limpiarNombre(nombre)}`;
}

export function yaSeReviso(datos, tipo, empresa, nombre) {
  const lista = datos.sueltosRevisados || [];
  return lista.includes(llaveSuelto(tipo, empresa, nombre));
}

/** "Ninguna de las dos": se deja como está y no vuelve a aparecer. */
export function dejarComoEsta(datos, tipo, empresa, nombre) {
  if (!Array.isArray(datos.sueltosRevisados)) datos.sueltosRevisados = [];
  const llave = llaveSuelto(tipo, empresa, nombre);
  if (!datos.sueltosRevisados.includes(llave)) datos.sueltosRevisados.push(llave);
  return datos;
}

/** Deshace el "déjelo así", por si se arrepiente. */
export function volverARevisar(datos, tipo, empresa, nombre) {
  if (!Array.isArray(datos.sueltosRevisados)) return datos;
  const llave = llaveSuelto(tipo, empresa, nombre);
  datos.sueltosRevisados = datos.sueltosRevisados.filter((x) => x !== llave);
  return datos;
}

// ---------------------------------------------------------------------------
//  1. Renglones a nombre de alguien que no está en la lista
// ---------------------------------------------------------------------------

/**
 * A quién se puede parecer un nombre que NO existe en su empresa.
 *
 * Aquí somos más permisivos que al crear una persona nueva, y hay una razón:
 * cuando ella escribe un nombre nuevo, no sabemos si está mal; interrumpirla
 * con parecidos flojos es molestar. Pero cuando un renglón apunta a alguien
 * que no existe, ya SABEMOS que algo está mal. Entonces cualquier pista ayuda,
 * y para descartarla están los botones "No, es otra" y "Déjelo así".
 *
 * El caso que obligó a esto es real: MARTHA SALGADO contra MARTA SALGADO. Se
 * diferencian en dos letras, o sea la categoría más floja, y sin embargo es
 * justo la respuesta correcta.
 */
export function parecidasParaSuelto(datos, nombre, codigoEmpresa) {
  const encontradas = parecidasEnEmpresa(datos, nombre, codigoEmpresa);
  if (encontradas.length) return encontradas;

  // Nada por parecido de palabras. Miramos letra por letra, que para nombres
  // cortos ("ANA GOMEZ" contra "ANA GAMEZ") es lo único que sirve.
  const empresa = normalizar(codigoEmpresa);
  const esq = esqueleto(nombre);
  const sueltas = [];
  for (const p of datos.personas) {
    if (normalizar(p.empresaCome) !== empresa) continue;
    const d = distancia(esq, esqueleto(p.nombre), 2);
    if (d >= 1 && d <= 2) {
      sueltas.push({
        persona: p,
        razon: d === 1 ? "se diferencian en una letra" : "se diferencian en dos letras",
        fuerza: d === 1 ? 2 : 1,
      });
    }
  }
  return sueltas.sort((a, b) => b.fuerza - a.fuerza);
}

export function personasSueltas(datos, { incluirRevisadas = false } = {}) {
  const existentes = new Set(
    datos.personas.map((p) => clavePersona(p.empresaCome, p.nombre))
  );

  // Juntamos los renglones por (empresa, nombre): se decide una vez para todos.
  const grupos = new Map();
  for (const c of datos.consumos) {
    const llave = clavePersona(c.empresaCome, c.persona);
    if (existentes.has(llave)) continue;
    if (!grupos.has(llave)) {
      grupos.set(llave, {
        empresa: normalizar(c.empresaCome),
        nombre: normalizar(c.persona),
        renglones: 0,
        plata: 0,
        dias: new Set(),
        empresaFactura: normalizar(c.empresaFactura),
      });
    }
    const g = grupos.get(llave);
    g.renglones++;
    g.plata += subtotal(c);
    g.dias.add(c.fecha);
  }

  const salida = [];
  for (const g of grupos.values()) {
    if (!incluirRevisadas && yaSeReviso(datos, "PERSONA", g.empresa, g.nombre)) continue;
    const parecidas = parecidasParaSuelto(datos, g.nombre, g.empresa);
    salida.push({
      tipo: "PERSONA",
      empresa: g.empresa,
      nombre: g.nombre,
      empresaFactura: g.empresaFactura,
      renglones: g.renglones,
      plata: g.plata,
      dias: g.dias.size,
      sugerencias: parecidas.slice(0, 4).map((p) => ({
        nombre: p.persona.nombre,
        razon: p.razon,
        fuerza: p.fuerza,
      })),
    });
  }

  return salida.sort((a, b) => b.renglones - a.renglones);
}

/** "Es la misma persona": los renglones pasan a llamarse como la que ya está. */
export function unirPersonaSuelta(datos, empresa, nombreSuelto, nombreBueno) {
  const emp = normalizar(empresa);
  const suelto = normalizar(nombreSuelto);
  const buena = datos.personas.find(
    (p) => normalizar(p.empresaCome) === emp && normalizar(p.nombre) === normalizar(nombreBueno)
  );
  if (!buena) throw new Error(`${nombreBueno} no está en ${emp}.`);

  let movidos = 0;
  for (const c of datos.consumos) {
    if (normalizar(c.empresaCome) !== emp) continue;
    if (normalizar(c.persona) !== suelto) continue;
    c.persona = buena.nombre;
    // A quién se le factura lo manda la persona de verdad.
    if (buena.empresaFactura) c.empresaFactura = normalizar(buena.empresaFactura);
    c.revisar = (c.revisar || []).filter((x) => x !== "PERSONA_NO_ESTA");
    movidos++;
  }
  volverARevisar(datos, "PERSONA", emp, nombreSuelto);
  return { movidos, nombreBueno: buena.nombre };
}

/** "Es otra persona": se crea en la lista y los renglones quedan válidos. */
export function crearPersonaSuelta(datos, empresa, nombreSuelto, empresaFactura) {
  const emp = normalizar(empresa);
  const nombre = limpiarNombre(nombreSuelto);
  const yaEsta = datos.personas.some(
    (p) => normalizar(p.empresaCome) === emp && limpiarNombre(p.nombre) === nombre
  );
  if (!yaEsta) {
    datos.personas.push({
      nombre,
      empresaCome: emp,
      empresaFactura: normalizar(empresaFactura) || emp,
      activa: true,
    });
  }
  // Si el nombre venía sucio, los renglones se van con él para que coincidan.
  let arreglados = 0;
  for (const c of datos.consumos) {
    if (normalizar(c.empresaCome) !== emp) continue;
    if (normalizar(c.persona) !== normalizar(nombreSuelto)) continue;
    c.persona = nombre;
    c.revisar = (c.revisar || []).filter((x) => x !== "PERSONA_NO_ESTA");
    arreglados++;
  }
  volverARevisar(datos, "PERSONA", emp, nombreSuelto);
  return { nombre, arreglados };
}

// ---------------------------------------------------------------------------
//  2. Renglones con un plato que no está en el catálogo
// ---------------------------------------------------------------------------

export function platosSueltos(datos, { incluirRevisados = false } = {}) {
  const enCatalogo = new Set(datos.productos.map((p) => normalizar(p.nombre)));

  const grupos = new Map();
  for (const c of datos.consumos) {
    const plato = normalizar(c.producto);
    if (!plato) continue;
    const faltaEnCatalogo = !enCatalogo.has(plato);
    const sinPrecio = c.facturable !== false && !(Number(c.precioUnitario) > 0);
    if (!faltaEnCatalogo && !sinPrecio) continue;

    if (!grupos.has(plato)) {
      grupos.set(plato, {
        nombre: plato,
        faltaEnCatalogo,
        renglones: 0,
        cantidad: 0,
        empresas: new Set(),
        sinPrecio: 0,
      });
    }
    const g = grupos.get(plato);
    g.renglones++;
    g.cantidad += Number(c.cantidad) || 0;
    g.empresas.add(normalizar(c.empresaFactura));
    if (sinPrecio) g.sinPrecio++;
  }

  const salida = [];
  for (const g of grupos.values()) {
    if (!incluirRevisados && yaSeReviso(datos, "PLATO", "", g.nombre)) continue;
    const parecidos = parecidosEnCatalogo(datos, g.nombre);
    salida.push({
      tipo: "PLATO",
      nombre: g.nombre,
      faltaEnCatalogo: g.faltaEnCatalogo,
      renglones: g.renglones,
      cantidad: g.cantidad,
      sinPrecio: g.sinPrecio,
      empresas: [...g.empresas].sort(),
      sugerencias: parecidos.slice(0, 4).map((p) => ({
        nombre: p.producto.nombre,
        razon: p.razon,
        fuerza: p.fuerza,
        obvio: p.obvio,
      })),
    });
  }

  // Ahora los "parientes": platos sueltos que se parecen ENTRE ELLOS.
  //
  // Esto hacía falta. En los datos reales están "COMBO DE COSTILLAS" y
  // "COMBO COSTILLAS", los dos fuera del catálogo. Comparando solo contra el
  // catálogo, los dos decían "sin parecido" y ella habría creado el mismo
  // plato dos veces, que es volver a empezar el problema.
  for (const p of salida) {
    p.parientes = salida
      .filter((otro) => otro !== p)
      .map((otro) => {
        const c = compararPlatos(p.nombre, otro.nombre);
        return c ? { nombre: otro.nombre, renglones: otro.renglones, ...c } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.fuerza - a.fuerza)
      .slice(0, 4);
  }

  return salida.sort((a, b) => b.renglones - a.renglones);
}

/**
 * Qué pasaría si este plato suelto se une con uno del catálogo, SIN tocar nada.
 *
 * Esto no es un detalle: unir "AGUA CON GAS" (que iba en $ 0) con "AGUA GAS"
 * (que vale $ 3.000) le SUBE la cuenta a la empresa. Está bien que suba, porque
 * el agua se vendió y no se cobró. Pero ella tiene que verlo antes, no
 * enterarse cuando el cliente le reclame.
 */
export function simularUnionDePlato(datos, nombreSuelto, nombreBueno) {
  const suelto = normalizar(nombreSuelto);
  const bueno = normalizar(nombreBueno);
  let renglones = 0;
  let antes = 0;
  let despues = 0;
  const porEmpresa = new Map();

  for (const c of datos.consumos) {
    if (normalizar(c.producto) !== suelto) continue;
    const empresa = normalizar(c.empresaFactura);
    const precioNuevo = datos.precios[clavePrecio(bueno, empresa)];
    const nuevo = Number.isFinite(precioNuevo) ? precioNuevo : Number(c.precioUnitario) || 0;

    const viejoTotal = subtotal(c);
    const nuevoTotal = c.facturable === false ? 0 : (Number(c.cantidad) || 0) * nuevo;

    renglones++;
    antes += viejoTotal;
    despues += nuevoTotal;

    if (!porEmpresa.has(empresa)) porEmpresa.set(empresa, { antes: 0, despues: 0 });
    const e = porEmpresa.get(empresa);
    e.antes += viejoTotal;
    e.despues += nuevoTotal;
  }

  return {
    nombreSuelto: suelto,
    nombreBueno: bueno,
    renglones,
    antes,
    despues,
    diferencia: despues - antes,
    porEmpresa: [...porEmpresa.entries()]
      .map(([empresa, v]) => ({ empresa, ...v, diferencia: v.despues - v.antes }))
      .filter((e) => e.diferencia !== 0)
      .sort((a, b) => b.diferencia - a.diferencia),
  };
}

/** "Es el mismo plato": los renglones pasan al del catálogo, con su precio. */
export function unirPlatoSuelto(datos, nombreSuelto, nombreBueno) {
  const previa = simularUnionDePlato(datos, nombreSuelto, nombreBueno);
  const suelto = normalizar(nombreSuelto);
  const producto = datos.productos.find((p) => normalizar(p.nombre) === normalizar(nombreBueno));
  if (!producto) throw new Error(`${nombreBueno} no está en el catálogo.`);

  for (const c of datos.consumos) {
    if (normalizar(c.producto) !== suelto) continue;
    const empresa = normalizar(c.empresaFactura);
    const precio = datos.precios[clavePrecio(producto.nombre, empresa)];
    c.producto = producto.nombre;
    if (Number.isFinite(precio)) c.precioUnitario = precio;
    c.revisar = (c.revisar || []).filter(
      (x) => x !== "PLATO_NO_ESTA" && !(x === "SIN_PRECIO" && Number(precio) > 0)
    );
  }
  volverARevisar(datos, "PLATO", "", nombreSuelto);
  return previa;
}

/** "Es un plato diferente": entra al catálogo con el precio que ella diga. */
export function crearPlatoSuelto(datos, nombreSuelto, precioPorEmpresa) {
  const nombre = limpiarNombre(nombreSuelto);
  if (!datos.productos.some((p) => normalizar(p.nombre) === nombre)) {
    datos.productos.push({ nombre, activo: true });
  }
  for (const [empresa, valor] of Object.entries(precioPorEmpresa || {})) {
    if (valor === "" || valor === null || valor === undefined) continue;
    datos.precios[clavePrecio(nombre, empresa)] = Number(valor) || 0;
  }

  let arreglados = 0;
  for (const c of datos.consumos) {
    if (normalizar(c.producto) !== normalizar(nombreSuelto)) continue;
    c.producto = nombre;
    const precio = datos.precios[clavePrecio(nombre, normalizar(c.empresaFactura))];
    if (Number.isFinite(precio)) c.precioUnitario = precio;
    c.revisar = (c.revisar || []).filter(
      (x) => x !== "PLATO_NO_ESTA" && !(x === "SIN_PRECIO" && Number(precio) > 0)
    );
    arreglados++;
  }
  volverARevisar(datos, "PLATO", "", nombreSuelto);
  return { nombre, arreglados };
}

// ---------------------------------------------------------------------------
//  Cuántas cosas hay pendientes, para el avisito del menú
// ---------------------------------------------------------------------------

export function cuantosSueltos(datos) {
  const personas = personasSueltas(datos);
  const platos = platosSueltos(datos);
  return {
    personas: personas.length,
    platos: platos.length,
    total: personas.length + platos.length,
    renglones:
      personas.reduce((a, p) => a + p.renglones, 0) +
      platos.reduce((a, p) => a + p.renglones, 0),
  };
}
