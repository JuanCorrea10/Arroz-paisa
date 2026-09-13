// ============================================================================
//  compras.js  -  Lo que se le COMPRA a los proveedores
//
//  El otro lado del negocio. La app hasta ahora solo sabía de lo que se vende
//  (almuerzos a cuatro fábricas); esto es lo que se paga: tocino, pechuga,
//  arroz, camarón, que llegan con su factura de papel.
//
//  Ojo con no confundir dos cosas que se parecen y NO son lo mismo:
//
//    empresa   un CLIENTE al que se le vende y se le cobra (MGP, AGRO...).
//    sede      dónde opera el restaurante (BOSQUE LARGO, LAGOS). Es donde
//              llega la comida. No se le cobra a nadie.
//
//  Meterlas en el mismo cajón sería el error más caro posible: las cuentas de
//  cobro saldrían dirigidas a una bodega y las compras se le cobrarían a una
//  fábrica.
//
//  LA META, dicha por ella: "totalizar el pago semanal de proveedores". A los
//  proveedores se les paga los lunes, y lo que necesita el lunes por la mañana
//  es UN número por proveedor: cuánto girarle. Eso es pagoSemanal().
// ============================================================================

import { normalizar, esFechaISO, lunesDeLaSemana, sumarDias } from "./formato.js";
import { compararNombres, esqueletoApretado } from "./nombres.js";

/** La llave de una compra: un proveedor no puede tener dos veces la misma factura. */
export function claveFacturaCompra(compra) {
  return normalizar(compra.proveedor) + "|" + normalizar(compra.factura);
}

/**
 * ¿Está pagada?
 *
 * Se guarda la FECHA en que se pagó, no un sí/no. Con un sí/no se sabe que se
 * pagó pero no cuándo, y a fin de mes no hay forma de cuadrar contra el banco.
 * En el Excel esto vivía en la columna de observaciones, escrito de cinco
 * formas distintas ("PAGAS", "PAGADA", "PAGA", "YA SE PAGO"), revuelto con
 * números sueltos -- o sea que la pregunta "¿qué me falta por pagar?" no se
 * podía contestar.
 */
export function estaPagada(compra) {
  return !!(compra && esFechaISO(compra.pagadaEl));
}

/** Lo que vale esa factura. Sin valor es cero, y se cuenta aparte. */
export function valorDe(compra) {
  const v = Number(compra && compra.valor);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** ¿Le falta el valor? Una factura sin valor no suma y hay que decirlo. */
export function sinValor(compra) {
  return valorDe(compra) === 0;
}

/** Las compras que caen entre dos fechas, y de una sede si se pide. */
export function comprasEnRango(compras, desdeISO, hastaISO, sede = null) {
  const desde = esFechaISO(desdeISO) ? desdeISO : null;
  const hasta = esFechaISO(hastaISO) ? hastaISO : null;
  const cual = sede ? normalizar(sede) : null;

  return (compras || []).filter((c) => {
    if (!esFechaISO(c.fecha)) return false;
    if (desde && c.fecha < desde) return false;
    if (hasta && c.fecha > hasta) return false;
    if (cual && normalizar(c.sede) !== cual) return false;
    return true;
  });
}

/**
 * LA META: cuánto hay que girarle a cada proveedor esta semana.
 *
 * Una fila por proveedor, ordenadas por plata de mayor a menor -- el giro
 * grande es el que no se puede equivocar, y ese tiene que quedar arriba.
 *
 * "porPagar" y "pagado" van SEPARADOS a propósito. El lunes por la mañana lo
 * que ella necesita girar es lo que está por pagar; si se sumaran juntos,
 * giraría de más por algo que ya pagó, y eso no se devuelve.
 *
 * "sinValor" son facturas que llegaron sin precio. No suman -- no se puede
 * inventar lo que vale una factura -- pero se cuentan para poder avisar que el
 * total está corto. Callarlas sería el bug del Excel otra vez.
 */
export function pagoSemanal(compras, desdeISO, hastaISO, sede = null) {
  const dentro = comprasEnRango(compras, desdeISO, hastaISO, sede);

  const porProveedor = new Map();
  const total = { facturas: 0, total: 0, pagado: 0, porPagar: 0, sinValor: 0 };

  for (const c of dentro) {
    const quien = normalizar(c.proveedor) || "(sin proveedor)";
    if (!porProveedor.has(quien)) {
      porProveedor.set(quien, {
        proveedor: quien,
        facturas: 0, total: 0, pagado: 0, porPagar: 0, sinValor: 0,
        compras: [],
      });
    }
    const fila = porProveedor.get(quien);
    const plata = valorDe(c);
    const pagada = estaPagada(c);

    fila.compras.push(c);
    fila.facturas += 1;
    fila.total += plata;
    fila[pagada ? "pagado" : "porPagar"] += plata;
    if (sinValor(c)) fila.sinValor += 1;

    total.facturas += 1;
    total.total += plata;
    total[pagada ? "pagado" : "porPagar"] += plata;
    if (sinValor(c)) total.sinValor += 1;
  }

  const filas = [...porProveedor.values()]
    .map((f) => ({
      ...f,
      compras: f.compras.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }))
    .sort((a, b) => b.total - a.total || a.proveedor.localeCompare(b.proveedor, "es"));

  return {
    desde: esFechaISO(desdeISO) ? desdeISO : null,
    hasta: esFechaISO(hastaISO) ? hastaISO : null,
    sede: sede ? normalizar(sede) : null,
    filas,
    total: { ...total, proveedores: filas.length },
  };
}

/**
 * La semana de una fecha: de lunes a domingo.
 *
 * A los proveedores se les paga los LUNES, así que la semana que se paga es la
 * que acaba de terminar. De lunes a domingo y no de domingo a sábado porque es
 * como se cuenta aquí, y porque el corte del pago cae justo en el lunes.
 */
export function laSemanaDe(fechaISO) {
  const lunes = lunesDeLaSemana(fechaISO);
  if (!lunes) return { desde: "", hasta: "" };
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/**
 * Lo que está sin pagar, sea de cuando sea.
 *
 * Es la pregunta que el Excel no podía contestar, porque el estado del pago
 * vivía en texto libre. De más viejo a más nuevo: lo que lleva más tiempo
 * debiéndose es lo que primero hay que mirar.
 */
export function loQueFaltaPorPagar(compras, sede = null) {
  const cual = sede ? normalizar(sede) : null;
  return (compras || [])
    .filter((c) => esFechaISO(c.fecha) && !estaPagada(c))
    .filter((c) => !cual || normalizar(c.sede) === cual)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Los proveedores que aparecen en las compras, para las listas y buscadores. */
export function proveedoresDe(compras) {
  const vistos = new Map();
  for (const c of compras || []) {
    const quien = normalizar(c.proveedor);
    if (!quien) continue;
    vistos.set(quien, (vistos.get(quien) || 0) + 1);
  }
  return [...vistos.entries()]
    .map(([nombre, veces]) => ({ nombre, veces }))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es"));
}

/** Las sedes que aparecen en las compras. */
export function sedesDe(compras) {
  const vistas = new Set();
  for (const c of compras || []) {
    const s = normalizar(c.sede);
    if (s) vistas.add(s);
  }
  return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Proveedores que parecen el MISMO escrito de dos formas.
 *
 * Esto no es cosmética: es plata. En los datos de ella, "DIEGO VELASQUEZ" y
 * "DIEGO VELAZQUEZ" -- una ese y una zeta -- son 55 facturas partidas en dos
 * filas del pago semanal. Si ella gira lo que dice cada fila, le gira DOS
 * VECES al mismo señor. Y al revés: cada fila se ve más chica de lo que es, y
 * un proveedor grande pasa por chiquito.
 *
 * Se avisa, no se une solo. Unir dos proveedores mueve plata de una cuenta
 * bancaria a otra, y eso no lo decide un programa: pueden ser de verdad dos
 * empresas parecidas.
 */
export function proveedoresParecidos(compras) {
  const nombres = proveedoresDe(compras).map((p) => p.nombre);
  const pares = [];

  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const a = nombres[i];
      const b = nombres[j];

      // Dos formas de parecerse, y hacen falta las dos: compararNombres caza
      // "una letra de diferencia" y "le falta un apellido"; el esqueleto
      // apretado caza "ORIZ" contra "ORIZ S.A.S", que es lo mismo sin el
      // tipo de sociedad.
      const dice = compararNombres(a, b);
      const mismoEsqueleto = esqueletoApretado(a) &&
                             esqueletoApretado(a) === esqueletoApretado(b);
      const unoEmpiezaComoElOtro =
        a.length >= 4 && b.length >= 4 &&
        (a.startsWith(b) || b.startsWith(a));

      if (!dice && !mismoEsqueleto && !unoEmpiezaComoElOtro) continue;

      pares.push({
        a, b,
        razon: dice ? dice.razon
             : mismoEsqueleto ? "se escriben igual sin los puntos"
             : "uno es el otro con algo más al final",
      });
    }
  }
  return pares;
}
