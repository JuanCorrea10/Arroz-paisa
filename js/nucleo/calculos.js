// ============================================================================
//  calculos.js  -  El cerebro. Quincenas, totales, facturas, cuadre y avisos.
//
//  TODO en este archivo es PURO: recibe datos, devuelve datos. No toca la
//  pantalla ni guarda nada. Gracias a eso lo podemos probar automáticamente
//  contra los números reales del Excel de agosto.
// ============================================================================

import { normalizar, diaDe, mesDe, anioDe, esFechaISO, diasDelMes } from "./formato.js";

// ---------------------------------------------------------------------------
//  Llaves: cómo identificamos a una persona y a una factura
// ---------------------------------------------------------------------------

/**
 * La llave REAL de una persona NO es su nombre.
 * En los datos hay 477 nombres distintos repartidos en 561 renglones:
 * 79 nombres existen en dos empresas a la vez (AGRO y BASARILI son sedes
 * vecinas y hay tocayos). Si usáramos solo el nombre, se rompería el 25%
 * de los datos. Por eso la llave es EMPRESA + NOMBRE.
 */
export function clavePersona(empresa, nombre) {
  return normalizar(empresa) + "|" + normalizar(nombre);
}

/** La llave de un precio: un mismo plato puede valer distinto en cada empresa. */
export function clavePrecio(producto, empresa) {
  return normalizar(producto) + "|" + normalizar(empresa);
}

/**
 * UNA FACTURA = UNA PERSONA QUE COMIÓ UN DÍA.
 * Si pidió almuerzo + gaseosa + postre, son 3 renglones pero UNA sola factura.
 * Esto importa porque el trabajador le dice "hoy hice 47 facturas" y hay que
 * poder cuadrar ese número contra el sistema.
 */
export function claveFactura(consumo) {
  return consumo.fecha + "|" + normalizar(consumo.empresa) + "|" + normalizar(consumo.persona);
}

// ---------------------------------------------------------------------------
//  Quincenas
// ---------------------------------------------------------------------------

/**
 * Q1 = del día 1 hasta el "último día Q1" de esa empresa.
 * Q2 = del siguiente hasta fin de mes.
 *
 * OJO, dos trampas:
 *  1. El corte depende de la empresa (MGP corta el 13, las demás el 14).
 *  2. Se mira la empresa A LA QUE SE LE FACTURA, no dónde comió la persona.
 */
export function quincenaDe(fechaISO, empresa) {
  if (!esFechaISO(fechaISO) || !empresa) return null;
  const corte = Number(empresa.ultimoDiaQ1);
  if (!Number.isFinite(corte)) return null;
  return diaDe(fechaISO) <= corte ? 1 : 2;
}

/** Los días exactos que abarca una quincena. Ej: { desde: 1, hasta: 13 } */
export function rangoQuincena(anio, mes, quincena, empresa) {
  const corte = Number(empresa && empresa.ultimoDiaQ1) || 15;
  const finDeMes = diasDelMes(anio, mes);
  return quincena === 1
    ? { desde: 1, hasta: Math.min(corte, finDeMes) }
    : { desde: Math.min(corte + 1, finDeMes), hasta: finDeMes };
}

// ---------------------------------------------------------------------------
//  Plata
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  CÓMO SE PAGA CADA PEDIDO
//
//  Antes esto era un solo sí/no ("facturable"), y ese sí/no estaba tapando dos
//  preguntas distintas:
//
//      ¿quién paga?          ¿esto fue una venta?
//      la empresa            sí          -> a crédito
//      la persona, de una    sí          -> de contado
//      nadie                 no          -> cortesía
//
//  Con un solo botón, un almuerzo pagado en efectivo no tenía dónde ir. Si se
//  dejaba normal, la empresa terminaba pagando algo que la persona ya había
//  pagado. Si se marcaba "no cobrar", la venta desaparecía: ese día el negocio
//  aparecía vendiendo menos de lo que vendió, y no quedaba rastro del pago.
//
//  Por eso ahora son tres estados y no dos.
// ---------------------------------------------------------------------------

export const A_CREDITO = "empresa";
export const DE_CONTADO = "contado";
export const CORTESIA = "cortesia";

/**
 * Cómo se paga este renglón.
 *
 * Los renglones viejos no tienen el campo: se guardaron cuando solo existía
 * "facturable". Se traducen aquí mismo y no hay que convertir nada en el
 * archivo de datos. Una conversión de 1135 renglones es una oportunidad de
 * dañarlos; leerlos bien no lo es.
 */
export function formaDeCobro(consumo) {
  const forma = consumo && consumo.cobro;
  if (forma === A_CREDITO || forma === DE_CONTADO || forma === CORTESIA) return forma;
  return consumo && consumo.facturable === false ? CORTESIA : A_CREDITO;
}

/** ¿Esto entra en la cuenta de cobro de la empresa? */
export function loPagaLaEmpresa(consumo) {
  return formaDeCobro(consumo) === A_CREDITO;
}

/** ¿La persona ya lo pagó de su bolsillo? */
export function yaLoPago(consumo) {
  return formaDeCobro(consumo) === DE_CONTADO;
}

/** ¿No lo paga nadie? */
export function esCortesia(consumo) {
  return formaDeCobro(consumo) === CORTESIA;
}

/**
 * Cuánto vale este renglón COMO VENTA.
 *
 * Ojo con la diferencia: de contado SÍ vale (la plata entró, solo que por la
 * caja y no por la empresa). Solo la cortesía vale cero, porque ahí no entró
 * plata de ningún lado.
 *
 * El precio sale del RENGLÓN (precioUnitario), no del catálogo. Está
 * CONGELADO desde el día en que se registró. Si mañana sube el almuerzo, las
 * cuentas de cobro ya enviadas no se pueden mover. (Bug #9 del Excel.)
 */
export function subtotal(consumo) {
  if (esCortesia(consumo)) return 0;
  return (Number(consumo.cantidad) || 0) * (Number(consumo.precioUnitario) || 0);
}

/** Lo que de este renglón le toca pagar a la empresa. Contado y cortesía: 0. */
export function subtotalAcreditoDeEmpresa(consumo) {
  return loPagaLaEmpresa(consumo) ? subtotal(consumo) : 0;
}

/** Lo que de este renglón entró en efectivo. */
export function subtotalDeContado(consumo) {
  return yaLoPago(consumo) ? subtotal(consumo) : 0;
}

/** Suma lo VENDIDO: crédito y contado juntos. La cortesía no suma. */
export function sumar(consumos) {
  return consumos.reduce((acc, c) => acc + subtotal(c), 0);
}

/** Suma solo lo que le toca pagar a la empresa. Es lo que va en la cuenta. */
export function sumarLoDeLaEmpresa(consumos) {
  return consumos.reduce((acc, c) => acc + subtotalAcreditoDeEmpresa(c), 0);
}

/** Suma solo lo que entró en efectivo. Es lo que debe haber en la caja. */
export function sumarLoDeContado(consumos) {
  return consumos.reduce((acc, c) => acc + subtotalDeContado(c), 0);
}

// ---------------------------------------------------------------------------
//  Filtros
//
//  SIEMPRE filtramos por mes Y año. Ese fue el bug #5 del Excel: la cuenta
//  de cobro filtraba solo por quincena, así que al llegar septiembre la
//  "quincena 1" sumaba agosto + septiembre y salía por el doble.
// ---------------------------------------------------------------------------

export function delMes(consumos, anio, mes) {
  return consumos.filter((c) => anioDe(c.fecha) === anio && mesDe(c.fecha) === mes);
}

export function delDia(consumos, fechaISO) {
  return consumos.filter((c) => c.fecha === fechaISO);
}

/** Renglones que se le facturan a una empresa, en una quincena de un mes. */
export function deQuincena(consumos, anio, mes, quincena, empresa) {
  const codigo = normalizar(empresa.codigo);
  return delMes(consumos, anio, mes).filter(
    (c) => normalizar(c.empresa) === codigo && quincenaDe(c.fecha, empresa) === quincena
  );
}

// ---------------------------------------------------------------------------
//  Facturas
// ---------------------------------------------------------------------------

/** Cuántas facturas (persona-día) hay en esta lista de renglones. */
export function contarFacturas(consumos) {
  const vistas = new Set();
  for (const c of consumos) vistas.add(claveFactura(c));
  return vistas.size;
}

/** Facturas agrupadas por empresa DONDE COME. Devuelve { MGP: 204, ... } */
export function facturasPorEmpresa(consumos) {
  const porEmpresa = new Map();
  for (const c of consumos) {
    const emp = normalizar(c.empresa);
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, new Set());
    porEmpresa.get(emp).add(claveFactura(c));
  }
  const salida = {};
  for (const [emp, set] of porEmpresa) salida[emp] = set.size;
  return salida;
}

// ---------------------------------------------------------------------------
//  Los informes
// ---------------------------------------------------------------------------

/**
 * COCINA: para un día, cuánto hay que preparar de cada plato, en columnas
 * por empresa y con un total.
 *
 * Aquí entran TODOS los renglones, hasta los no facturables: si alguien
 * come gratis, igual hay que cocinarle. (Bug #4 del Excel: los platos que
 * no estaban en el catálogo no aparecían en Cocina y no se preparaban.)
 */
export function informeCocina(consumos, fechaISO, codigosEmpresa) {
  const dia = delDia(consumos, fechaISO);
  const porPlato = new Map();
  for (const c of dia) {
    const plato = normalizar(c.producto);
    if (!porPlato.has(plato)) {
      porPlato.set(plato, { producto: plato, porEmpresa: {}, total: 0 });
    }
    const fila = porPlato.get(plato);
    const emp = normalizar(c.empresa);
    const cant = Number(c.cantidad) || 0;
    fila.porEmpresa[emp] = (fila.porEmpresa[emp] || 0) + cant;
    fila.total += cant;
  }
  const filas = [...porPlato.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  for (const f of filas) {
    for (const cod of codigosEmpresa) if (!(cod in f.porEmpresa)) f.porEmpresa[cod] = 0;
  }
  return filas;
}

/**
 * RESUMEN DEL DÍA: los platos de un día (de una empresa o de todas), con
 * cantidad, precio y total. Es lo que se le manda a la empresa cada día.
 */
export function informeDia(consumos, fechaISO, codigoEmpresa) {
  let dia = delDia(consumos, fechaISO);
  if (codigoEmpresa) {
    const cod = normalizar(codigoEmpresa);
    dia = dia.filter((c) => normalizar(c.empresa) === cod);
  }
  const porPlato = new Map();
  for (const c of dia) {
    // Agrupamos por plato Y POR PRECIO: si el mismo plato se cobró a dos
    // precios distintos, salen en renglones separados. Si los juntáramos,
    // el total no cuadraría con las cantidades y nadie sabría por qué.
    // Se agrupa tambien por FORMA DE COBRO. Dos almuerzos del mismo precio,
    // uno a credito y otro pagado de una, no pueden ir en el mismo renglon:
    // uno se le cobra a la empresa y el otro ya esta en la caja.
    const llave = normalizar(c.producto) + "|" + (Number(c.precioUnitario) || 0) +
                  "|" + formaDeCobro(c);
    if (!porPlato.has(llave)) {
      porPlato.set(llave, {
        producto: normalizar(c.producto),
        precioUnitario: Number(c.precioUnitario) || 0,
        forma: formaDeCobro(c),
        facturable: !esCortesia(c),   // lo que ya leian las pantallas viejas
        cantidad: 0,
        total: 0,
      });
    }
    const fila = porPlato.get(llave);
    fila.cantidad += Number(c.cantidad) || 0;
    fila.total += subtotal(c);
  }
  const filas = [...porPlato.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  return {
    fecha: fechaISO,
    empresa: codigoEmpresa ? normalizar(codigoEmpresa) : null,
    filas,
    renglones: dia.length,
    facturas: contarFacturas(dia),
    // Lo vendido: credito + contado.
    total: filas.reduce((a, f) => a + f.total, 0),
    // Y partido, que es lo que hace falta para cuadrar la caja al cerrar:
    // "aCredito" se lo van a pagar despues, "deContado" tiene que estar ahi.
    aCredito: sumarLoDeLaEmpresa(dia),
    deContado: sumarLoDeContado(dia),
  };
}

/**
 * Los renglones de un día que llevan una nota ("sin verduras", "para llevar").
 *
 * Va aparte del informe de Cocina a propósito. Cocina agrupa por plato, y una
 * nota NO se puede agrupar: es de UNA persona. Si se metiera en el conteo, o
 * se perdería, o partiría el plato en dos filas por una nota.
 *
 * Y si la nota no llega a la cocina, la nota no sirve para nada: se anotó
 * "sin verduras" y el plato salió con verduras igual.
 */
export function notasDelDia(consumos, fechaISO, codigosEmpresa) {
  const permitidas = codigosEmpresa && codigosEmpresa.length
    ? new Set(codigosEmpresa.map(normalizar))
    : null;

  return delDia(consumos, fechaISO)
    .filter((c) => String(c.observacion || "").trim())
    .filter((c) => !permitidas || permitidas.has(normalizar(c.empresa)))
    .map((c) => ({
      empresa: normalizar(c.empresa),
      persona: normalizar(c.persona),
      producto: normalizar(c.producto),
      cantidad: Number(c.cantidad) || 0,
      nota: String(c.observacion).trim(),
    }))
    .sort((a, b) =>
      a.empresa.localeCompare(b.empresa, "es") ||
      a.persona.localeCompare(b.persona, "es"));
}

/**
 * LAS COMANDAS DEL DÍA, agrupadas por persona.
 *
 * Un pedido es UNA persona con todos sus platos, no un montón de renglones
 * sueltos. Así se ve en la pantalla de registrar y así hay que entregarlo en
 * papel: "ANDREY MORALES — 1 almuerzo, 1 gaseosa — $ 19.000".
 *
 * Esto vive aquí y no en la pantalla porque lo usan dos: la pantalla para
 * pintar las tarjetas y el PDF que se les manda a los trabajadores. Cuando la
 * misma agrupación se escribe dos veces, tarde o temprano una de las dos
 * cuenta distinto y nadie entiende por qué el papel no cuadra con lo que se
 * ve en la pantalla.
 */
export function comandasDelDia(consumos, fechaISO, codigoEmpresa) {
  const cod = codigoEmpresa ? normalizar(codigoEmpresa) : null;
  const renglones = delDia(consumos, fechaISO)
    .filter((c) => !cod || normalizar(c.empresa) === cod);

  const porPersona = new Map();
  for (const c of renglones) {
    const quien = normalizar(c.persona);
    if (!porPersona.has(quien)) {
      porPersona.set(quien, { persona: quien, empresa: normalizar(c.empresa), platos: [] });
    }
    porPersona.get(quien).platos.push(c);
  }

  return [...porPersona.values()]
    .map((p) => ({
      ...p,
      // Tres totales, porque no son lo mismo y confundirlos es cobrar mal:
      //   total     todo lo que se llevó, valga quien lo pague
      //   empresa   lo que va a la cuenta de cobro
      //   contado   lo que ya pagó de su bolsillo
      total: p.platos.reduce((a, c) => a + subtotal(c), 0),
      empresa: p.empresa,
      aLaEmpresa: p.platos.reduce((a, c) => a + subtotalAcreditoDeEmpresa(c), 0),
      deContado: p.platos.reduce((a, c) => a + subtotalDeContado(c), 0),
    }))
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));
}

/**
 * CONSUMO POR PERSONA: cuánto lleva cada persona en Q1, en Q2 y en el mes.
 * La quincena se calcula con la empresa A LA QUE SE LE FACTURA.
 */
export function informePorPersona(consumos, anio, mes, empresasPorCodigo, codigoEmpresa, fechaDia = null) {
  let lista = delMes(consumos, anio, mes);
  if (codigoEmpresa) {
    const cod = normalizar(codigoEmpresa);
    lista = lista.filter((c) => normalizar(c.empresa) === cod);
  }
  const porPersona = new Map();
  for (const c of lista) {
    const llave = clavePersona(c.empresa, c.persona);
    if (!porPersona.has(llave)) {
      porPersona.set(llave, {
        persona: normalizar(c.persona),
        empresa: normalizar(c.empresa),
        // q1, q2 y mes son lo que va a la cuenta de la empresa: lo que le van
        // a descontar. Lo que la persona ya pago de su bolsillo NO puede
        // estar aqui, o se le descontaria dos veces.
        // "dia" es lo de un día suelto, el que ella escoja arriba. Sirve para
        // contestar "¿cuánto lleva Fulano HOY?" sin salirse de esta pantalla,
        // que es lo que le preguntan en la portería.
        dia: 0,
        q1: 0,
        q2: 0,
        mes: 0,
        contado: 0,
        facturas: new Set(),
      });
    }
    const fila = porPersona.get(llave);
    const empresa = empresasPorCodigo[normalizar(c.empresa)];
    const q = quincenaDe(c.fecha, empresa);
    const alaEmpresa = subtotalAcreditoDeEmpresa(c);
    if (q === 1) fila.q1 += alaEmpresa;
    else if (q === 2) fila.q2 += alaEmpresa;
    fila.mes += alaEmpresa;
    if (fechaDia && c.fecha === fechaDia) fila.dia += alaEmpresa;
    fila.contado += subtotalDeContado(c);
    fila.facturas.add(claveFactura(c));
  }
  // La quincena EN CURSO: la del día que se está mirando.
  //
  // Se calcula por persona y no una sola vez para todos, porque el corte
  // depende de la empresa: MGP cierra la primera quincena el 13 y las demás
  // el 14. El día 14, entonces, la gente de MGP ya va en la segunda quincena
  // mientras la de AGRO sigue en la primera. Un solo número para todos daría
  // mal en ese día -- y es justo el día en que se pasa la primera cuenta.
  return [...porPersona.values()]
    .map((f) => {
      const empresa = empresasPorCodigo[f.empresa];
      const quincenaActual = fechaDia ? quincenaDe(fechaDia, empresa) : null;
      return {
        ...f,
        facturas: f.facturas.size,
        quincenaActual,
        // Lo que lleva en la quincena que todavía no se ha cobrado. Es lo que
        // contesta "¿yo cuánto llevo?": la quincena pasada ya se facturó.
        enCurso: quincenaActual === 1 ? f.q1 : quincenaActual === 2 ? f.q2 : 0,
      };
    })
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));
}

/**
 * CUENTA DE COBRO: el documento que se le entrega a la empresa.
 * Un renglón por plato, con cantidad, valor unitario y total.
 * Solo entra lo que paga la empresa: ni lo de contado ni las cortesías.
 */
export function cuentaDeCobro(consumos, anio, mes, quincena, empresa, fechaCuenta = null) {
  // Lo de contado NO puede entrar aquí. Si entrara, se le cobraría a la
  // empresa un almuerzo que la persona ya pagó en la caja: cobrado dos veces.
  const lista = deQuincena(consumos, anio, mes, quincena, empresa).filter(loPagaLaEmpresa);
  const porPlato = new Map();
  for (const c of lista) {
    const llave = normalizar(c.producto) + "|" + (Number(c.precioUnitario) || 0);
    if (!porPlato.has(llave)) {
      porPlato.set(llave, {
        producto: normalizar(c.producto),
        precioUnitario: Number(c.precioUnitario) || 0,
        cantidad: 0,
        total: 0,
      });
    }
    const fila = porPlato.get(llave);
    fila.cantidad += Number(c.cantidad) || 0;
    fila.total += subtotal(c);
  }
  const filas = [...porPlato.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  return {
    empresa,
    anio,
    mes,
    quincena,
    rango: rangoQuincena(anio, mes, quincena, empresa),
    filas,
    renglones: lista.length,
    facturas: contarFacturas(lista),
    total: filas.reduce((a, f) => a + f.total, 0),
    // La fecha en que se pasa la cuenta. Si no la han puesto, va null y el
    // documento no inventa ninguna.
    fechaCuenta: esFechaISO(fechaCuenta) ? fechaCuenta : null,
  };
}

// ---------------------------------------------------------------------------
//  La fecha en que se pasa la cuenta
//
//  Los dias que cubre la quincena NO cambian: eso lo manda el dia de corte de
//  la empresa y sigue igual. Lo que cambia es CUANDO se pasa la cuenta: a
//  veces el mismo dia del corte, a veces tres dias despues, segun cuando la
//  reciba el cliente.
//
//  Por eso la fecha se guarda aparte y no se calcula. Si se calculara,
//  estariamos inventando un dato que solo ella sabe.
// ---------------------------------------------------------------------------

export function llaveDeCobro(codigoEmpresa, anio, mes, quincena) {
  return `${normalizar(codigoEmpresa)}|${anio}|${mes}|${quincena}`;
}

/** La fecha que ella puso, o null si todavia no ha puesto ninguna. */
export function fechaDeCobro(datos, codigoEmpresa, anio, mes, quincena) {
  const guardadas = datos.fechasDeCobro || {};
  const v = guardadas[llaveDeCobro(codigoEmpresa, anio, mes, quincena)];
  return esFechaISO(v) ? v : null;
}

export function ponerFechaDeCobro(datos, codigoEmpresa, anio, mes, quincena, fecha) {
  if (!datos.fechasDeCobro) datos.fechasDeCobro = {};
  const llave = llaveDeCobro(codigoEmpresa, anio, mes, quincena);
  if (esFechaISO(fecha)) datos.fechasDeCobro[llave] = fecha;
  else delete datos.fechasDeCobro[llave];
  return datos;
}

/**
 * CUADRE DE FACTURAS: una fila por día del mes.
 * Ella escribe cuántas facturas dice el trabajador que hizo, y la app le
 * dice cuántas hay registradas y de a cuántas está la diferencia.
 */
export function informeCuadre(consumos, anio, mes, declarados) {
  const dichos = declarados || {};
  const total = diasDelMes(anio, mes);
  const delMesActual = delMes(consumos, anio, mes);
  const porDia = new Map();
  for (const c of delMesActual) {
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, new Set());
    porDia.get(c.fecha).add(claveFactura(c));
  }
  const filas = [];
  for (let d = 1; d <= total; d++) {
    const fecha = anio + "-" + String(mes).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const registradas = porDia.has(fecha) ? porDia.get(fecha).size : 0;
    const bruto = dichos[fecha];
    const vacio = bruto === "" || bruto === null || bruto === undefined;
    const declarado = vacio ? null : Number(bruto);
    const tieneDato = declarado !== null && Number.isFinite(declarado);
    filas.push({
      fecha,
      dia: d,
      registradas,
      declarado: tieneDato ? declarado : null,
      diferencia: tieneDato ? registradas - declarado : null,
      estado: !tieneDato ? "sin-dato" : registradas === declarado ? "cuadra" : "no-cuadra",
    });
  }
  return filas;
}

// ---------------------------------------------------------------------------
//  Avisos: nada puede quedar mal Y CALLADO
//
//  El Excel fallaba en silencio y nadie se daba cuenta hasta fin de mes.
//  Aquí, todo lo que no cuadre tiene que verse en pantalla, en español,
//  diciendo QUÉ pasa y CÓMO se arregla.
// ---------------------------------------------------------------------------

export function revisarConsumo(consumo, datos) {
  const avisos = [];
  const empresasPorCodigo = indicePorCodigo(datos.empresas);

  if (!esFechaISO(consumo.fecha)) {
    avisos.push({
      codigo: "FECHA_MALA",
      mensaje: "Este renglón no tiene una fecha válida.",
      comoArreglar: "Bórrelo y vuelva a registrarlo eligiendo la fecha en el calendario.",
    });
  }
  // Antes esto se revisaba dos veces, una por cada empresa del renglón. Ahora
  // la empresa es una sola, y el aviso también.
  if (!empresasPorCodigo[normalizar(consumo.empresa)]) {
    avisos.push({
      codigo: "EMPRESA_DESCONOCIDA",
      mensaje: 'La empresa "' + consumo.empresa + '" no existe.',
      comoArreglar: "Créela en la pantalla Empresas, o corrija el renglón.",
    });
  }
  const laClave = clavePersona(consumo.empresa, consumo.persona);
  const existePersona = datos.personas.some((p) => clavePersona(p.empresa, p.nombre) === laClave);
  if (!existePersona) {
    avisos.push({
      codigo: "PERSONA_NO_ESTA",
      mensaje: consumo.persona + " no está en la lista de " + consumo.empresa + ".",
      comoArreglar: "Agréguela en la pantalla Personas, o cambie el renglón de empresa.",
    });
  }
  const existeProducto = datos.productos.some(
    (p) => normalizar(p.nombre) === normalizar(consumo.producto)
  );
  if (!existeProducto) {
    avisos.push({
      codigo: "PLATO_NO_ESTA",
      mensaje: 'El plato "' + consumo.producto + '" no está en el catálogo.',
      comoArreglar: "Agréguelo en la pantalla Catálogo con su precio.",
    });
  }
  // Una cortesía en $ 0 está bien: no la paga nadie. Pero un pedido de
  // contado en $ 0 es un error igual de grave que uno a crédito, porque
  // significa que alguien pagó y no quedó anotado cuánto.
  if (!esCortesia(consumo) && !(Number(consumo.precioUnitario) > 0)) {
    avisos.push({
      codigo: "SIN_PRECIO",
      mensaje: '"' + consumo.producto + '" quedó en $ 0 y sí se está cobrando.',
      comoArreglar: "Póngale el precio aquí mismo, o márquelo como cortesía.",
    });
  }
  if (!(Number(consumo.cantidad) > 0)) {
    avisos.push({
      codigo: "SIN_CANTIDAD",
      mensaje: "La cantidad tiene que ser 1 o más.",
      comoArreglar: "Escriba cuántos pidió.",
    });
  }
  return avisos;
}

/** Revisa TODOS los renglones y devuelve solo los que tienen problemas. */
export function revisarTodo(datos) {
  const problemas = [];
  for (const c of datos.consumos) {
    const avisos = revisarConsumo(c, datos);
    if (avisos.length) problemas.push({ consumo: c, avisos });
  }
  return problemas;
}

// ---------------------------------------------------------------------------
//  Ayudas
// ---------------------------------------------------------------------------

/** [{codigo:"MGP",...}] -> { MGP: {codigo:"MGP",...} } */
export function indicePorCodigo(empresas) {
  const indice = {};
  for (const e of empresas) indice[normalizar(e.codigo)] = e;
  return indice;
}

/** Busca el precio de un plato para una empresa. Devuelve null si no hay. */
export function precioDe(datos, producto, empresa) {
  const v = datos.precios[clavePrecio(producto, empresa)];
  return Number.isFinite(v) ? v : null;
}

/** Las personas de una empresa, ordenadas alfabéticamente. */
/**
 * El precio de un plato, mirado como UNO solo.
 *
 * El catálogo guarda un precio por plato Y POR EMPRESA. Se hizo así por si
 * alguna fábrica negociaba distinto... y en los datos de verdad eso no pasa
 * ni una vez: los 77 platos cuestan lo mismo en las cuatro. Lo único que
 * lograba esa columna de más era que cambiar un precio costara cuatro
 * ediciones en vez de una, con cuatro oportunidades de escribir mal.
 *
 * Devuelve:
 *   igual   -> todas las empresas cobran lo mismo (o solo hay una)
 *   valor   -> ese precio, si igual. Si no, null.
 *   falta   -> a cuántas empresas les falta el precio
 *   porEmpresa -> el detalle, para cuando de verdad hay que mirarlo
 *
 * Que "igual" sea falso casi siempre significa que alguien escribió mal, no
 * que la empresa cobre distinto. Por eso la pantalla lo muestra como aviso.
 */
export function precioDelPlato(datos, nombrePlato, codigos) {
  const porEmpresa = {};
  let falta = 0;
  const vistos = new Set();

  for (const codigo of codigos) {
    const valor = precioDe(datos, nombrePlato, codigo);
    porEmpresa[normalizar(codigo)] = valor;
    if (valor === null) falta++;
    else vistos.add(valor);
  }

  const igual = vistos.size <= 1;
  return {
    igual,
    valor: igual && vistos.size === 1 ? [...vistos][0] : null,
    falta,
    porEmpresa,
  };
}

/**
 * ¿Este precio nuevo se ve como un error de dedo?
 *
 * El caso que se quiere cazar es el cero de más: un plato de $ 10.000 que
 * queda en $ 1.000.000 porque se pasó un dedo. No da error en ninguna parte;
 * simplemente sale una cuenta de cobro por un millón.
 *
 * No decide nada: solo dice "esto se ve raro" para poder preguntar antes de
 * guardar. Un cambio de precio de verdad (subió el almuerzo de 12 a 13 mil)
 * nunca es de cinco veces, así que no molesta.
 */
export function precioSeVeRaro(precioViejo, precioNuevo) {
  const viejo = Number(precioViejo) || 0;
  const nuevo = Number(precioNuevo) || 0;
  if (viejo <= 0 || nuevo <= 0) return false;
  return nuevo >= viejo * 5 || nuevo * 5 <= viejo;
}

export function personasDe(datos, codigoEmpresa, incluirInactivas) {
  const cod = normalizar(codigoEmpresa);
  return datos.personas
    .filter((p) => normalizar(p.empresa) === cod && (incluirInactivas || p.activa !== false))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * TODO lo de una empresa en un mes, en un solo objeto.
 *
 * Existe para que el archivo de página web y el PDF no puedan decir cosas
 * distintas. Antes las cuentas del reporte se armaban dentro del generador de
 * HTML; el día que hiciéramos un segundo documento tocaba copiarlas, y dos
 * copias de la misma cuenta terminan desviándose sin que nadie se dé cuenta
 * hasta que un supervisor reclama.
 *
 * Solo entra lo de ESTA empresa. Lo demás ni siquiera se calcula, así que no
 * hay forma de que se filtre a un archivo que no le corresponde.
 */
export function informeCompletoDeEmpresa(datos, codigoEmpresa, anio, mes) {
  const empresasPorCodigo = indicePorCodigo(datos.empresas);
  const empresa = empresasPorCodigo[normalizar(codigoEmpresa)];
  if (!empresa) throw new Error("Esa empresa no existe.");

  const cod = normalizar(codigoEmpresa);
  const mios = delMes(datos.consumos, anio, mes).filter(
    (c) => normalizar(c.empresa) === cod);
  const cobrables = mios.filter(loPagaLaEmpresa);

  const q1 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 1);
  const q2 = cobrables.filter((c) => quincenaDe(c.fecha, empresa) === 2);
  const r1 = rangoQuincena(anio, mes, 1, empresa);
  const r2 = rangoQuincena(anio, mes, 2, empresa);

  // Día por día. Aquí entran también los renglones que NO se cobran: el
  // supervisor necesita ver que ese día esa persona sí comió, aunque la
  // empresa no lo pague.
  const porDia = new Map();
  for (const c of mios) {
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, []);
    porDia.get(c.fecha).push(c);
  }
  const dias = [...porDia.keys()].sort().map((fecha) => {
    const renglones = porDia.get(fecha)
      .slice()
      .sort((a, b) => String(a.persona).localeCompare(String(b.persona), "es"));
    return {
      fecha,
      renglones,
      facturas: contarFacturas(renglones),
      total: sumarLoDeLaEmpresa(renglones),
      notas: notasDelDia(mios, fecha, [codigoEmpresa]),
    };
  });

  // Por plato. El precio entra en la llave porque el mismo plato puede haber
  // subido de precio a mitad de mes, y juntarlos taparía el cambio.
  const porPlato = new Map();
  for (const c of cobrables) {
    const llave = normalizar(c.producto) + "|" + (Number(c.precioUnitario) || 0);
    if (!porPlato.has(llave)) {
      porPlato.set(llave, {
        producto: normalizar(c.producto),
        precio: Number(c.precioUnitario) || 0,
        cantidad: 0,
        total: 0,
      });
    }
    const f = porPlato.get(llave);
    f.cantidad += Number(c.cantidad) || 0;
    f.total += subtotal(c);
  }
  const platos = [...porPlato.values()].sort((a, b) => b.total - a.total);

  const personas = informePorPersona(datos.consumos, anio, mes, empresasPorCodigo)
    .filter((f) => f.empresa === cod);

  return {
    empresa, anio, mes,
    rangos: { q1: r1, q2: r2 },
    totales: {
      q1: sumar(q1),
      q2: sumar(q2),
      mes: sumar(cobrables),
      facturas: contarFacturas(cobrables),
      renglones: mios.length,
      platos: platos.reduce((a, p) => a + p.cantidad, 0),
    },
    platos, personas, dias,
    acreedor: (datos.config && datos.config.acreedor) || {},
  };
}
