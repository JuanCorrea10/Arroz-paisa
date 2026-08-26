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
export function clavePersona(empresaCome, nombre) {
  return normalizar(empresaCome) + "|" + normalizar(nombre);
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
  return consumo.fecha + "|" + normalizar(consumo.empresaCome) + "|" + normalizar(consumo.persona);
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

/**
 * Cuánto suma un renglón.
 * Si NO es facturable, suma cero: la persona comió pero no se le cobra.
 *
 * El precio sale del RENGLÓN (precioUnitario), no del catálogo. Esta
 * CONGELADO desde el día en que se registró. Si mañana sube el almuerzo, las
 * cuentas de cobro ya enviadas no se pueden mover. (Bug #9 del Excel.)
 */
export function subtotal(consumo) {
  if (consumo.facturable === false) return 0;
  return (Number(consumo.cantidad) || 0) * (Number(consumo.precioUnitario) || 0);
}

/** Suma los subtotales de una lista de renglones. */
export function sumar(consumos) {
  return consumos.reduce((acc, c) => acc + subtotal(c), 0);
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
    (c) => normalizar(c.empresaFactura) === codigo && quincenaDe(c.fecha, empresa) === quincena
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
    const emp = normalizar(c.empresaCome);
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
    const emp = normalizar(c.empresaCome);
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
    dia = dia.filter((c) => normalizar(c.empresaCome) === cod);
  }
  const porPlato = new Map();
  for (const c of dia) {
    // Agrupamos por plato Y POR PRECIO: si el mismo plato se cobró a dos
    // precios distintos, salen en renglones separados. Si los juntáramos,
    // el total no cuadraría con las cantidades y nadie sabría por qué.
    const llave = normalizar(c.producto) + "|" + (Number(c.precioUnitario) || 0) +
                  "|" + (c.facturable === false);
    if (!porPlato.has(llave)) {
      porPlato.set(llave, {
        producto: normalizar(c.producto),
        precioUnitario: Number(c.precioUnitario) || 0,
        facturable: c.facturable !== false,
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
    total: filas.reduce((a, f) => a + f.total, 0),
  };
}

/**
 * CONSUMO POR PERSONA: cuánto lleva cada persona en Q1, en Q2 y en el mes.
 * La quincena se calcula con la empresa A LA QUE SE LE FACTURA.
 */
export function informePorPersona(consumos, anio, mes, empresasPorCodigo, codigoEmpresa) {
  let lista = delMes(consumos, anio, mes);
  if (codigoEmpresa) {
    const cod = normalizar(codigoEmpresa);
    lista = lista.filter((c) => normalizar(c.empresaCome) === cod);
  }
  const porPersona = new Map();
  for (const c of lista) {
    const llave = clavePersona(c.empresaCome, c.persona);
    if (!porPersona.has(llave)) {
      porPersona.set(llave, {
        persona: normalizar(c.persona),
        empresaCome: normalizar(c.empresaCome),
        empresaFactura: normalizar(c.empresaFactura),
        q1: 0,
        q2: 0,
        mes: 0,
        facturas: new Set(),
      });
    }
    const fila = porPersona.get(llave);
    const empresa = empresasPorCodigo[normalizar(c.empresaFactura)];
    const q = quincenaDe(c.fecha, empresa);
    const valor = subtotal(c);
    if (q === 1) fila.q1 += valor;
    else if (q === 2) fila.q2 += valor;
    fila.mes += valor;
    fila.facturas.add(claveFactura(c));
  }
  return [...porPersona.values()]
    .map((f) => ({ ...f, facturas: f.facturas.size }))
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));
}

/**
 * CUENTA DE COBRO: el documento que se le entrega a la empresa.
 * Un renglón por plato, con cantidad, valor unitario y total.
 * Solo entra lo facturable.
 */
export function cuentaDeCobro(consumos, anio, mes, quincena, empresa, fechaCuenta = null) {
  const lista = deQuincena(consumos, anio, mes, quincena, empresa).filter(
    (c) => c.facturable !== false
  );
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
  if (!empresasPorCodigo[normalizar(consumo.empresaCome)]) {
    avisos.push({
      codigo: "EMPRESA_COME_DESCONOCIDA",
      mensaje: 'La empresa "' + consumo.empresaCome + '" no existe.',
      comoArreglar: "Créela en la pantalla Empresas, o corrija el renglón.",
    });
  }
  if (!empresasPorCodigo[normalizar(consumo.empresaFactura)]) {
    avisos.push({
      codigo: "EMPRESA_FACTURA_DESCONOCIDA",
      mensaje: 'No se sabe a quién cobrarle este renglón ("' + consumo.empresaFactura + '").',
      comoArreglar: "Revise en la pantalla Personas a qué empresa se le factura.",
    });
  }
  const laClave = clavePersona(consumo.empresaCome, consumo.persona);
  const existePersona = datos.personas.some((p) => clavePersona(p.empresaCome, p.nombre) === laClave);
  if (!existePersona) {
    avisos.push({
      codigo: "PERSONA_NO_ESTA",
      mensaje: consumo.persona + " no está en la lista de " + consumo.empresaCome + ".",
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
  if (consumo.facturable !== false && !(Number(consumo.precioUnitario) > 0)) {
    avisos.push({
      codigo: "SIN_PRECIO",
      mensaje: '"' + consumo.producto + '" quedó en $ 0 y sí se está cobrando.',
      comoArreglar: "Póngale el precio aquí mismo, o márquelo como no facturable.",
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
export function personasDe(datos, codigoEmpresa, incluirInactivas) {
  const cod = normalizar(codigoEmpresa);
  return datos.personas
    .filter((p) => normalizar(p.empresaCome) === cod && (incluirInactivas || p.activa !== false))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
