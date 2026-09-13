// ============================================================================
//  importar-compras.test.mjs  -  Traer el Excel de facturas de proveedores
//
//  Los números de aquí NO son inventados: salieron del archivo de verdad,
//  "REGISTRO FACTURAS SUPERVISORES.xlsx", contado a mano con otra herramienta.
//  Si alguno falla, la importación está mal y no se puede usar.
//
//  Lo que más caro sale si se daña:
//
//    - Colarse en una hoja que NO es de facturas. El archivo tiene cinco hojas
//      y tres son calendarios de giro; una de ellas ("CONTROL PAGOS") hasta
//      tiene columnas FECHA, PROVEEDOR y VALOR.
//    - Tragarse la tablita de totales que ella dejó metida entre las filas.
//    - Descartar callado un renglón que no se entendió. Hay una fecha
//      "28/08/0206" -- año 206 -- que si se colara dejaría una factura fuera
//      de toda semana, y si se botara sin avisar, plata que nadie paga.
// ============================================================================

import { bytesDelArchivo } from "./leer-archivo.mjs";
import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { hojasDesdeArchivo } from "../js/datos/excel.js";
import {
  importarCompras, leerHojaDeCompras, buscarEncabezado, aPlata,
} from "../js/nucleo/importar-compras.js";
import { pagoSemanal, proveedoresParecidos } from "../js/nucleo/compras.js";

grupo("El Excel de facturas de proveedores");

let leido = null;
try {
  const bytes = await bytesDelArchivo("REGISTRO_FACTURAS_SUPERVISORES.xlsx");
  leido = importarCompras(await hojasDesdeArchivo(bytes));
} catch (e) {
  // Sin el archivo (está en .gitignore: son datos de ella) estas no corren.
  leido = null;
}

if (!leido) {
  prueba("el archivo de facturas no está en tests/datos/", () => {
    cierto(true, "se saltan estas pruebas");
  });
} else {
  prueba("entran las 140 facturas que se pueden leer", () => {
    igual(leido.resumen.facturas, 140);
  });

  prueba("y suman los $ 37.137.550 del archivo", () => {
    igual(leido.resumen.plata, 37137550);
  });

  prueba("las dos sedes salen del nombre de la hoja", () => {
    igual(leido.resumen.sedes, ["BOSQUELARGO", "LAGOS"]);
  });

  prueba("cada hoja aporta lo suyo", () => {
    igual(leido.resumen.hojasLeidas,
          [{ hoja: "BOSQUELARGO", facturas: 66 }, { hoja: "LAGOS", facturas: 74 }]);
  });

  prueba("las tres hojas que NO son facturas se quedan por fuera", () => {
    // "CONTROL PAGOS" es la más peligrosa: tiene FECHA, PROVEEDOR y VALOR,
    // pero es el calendario de a quién se le gira los lunes.
    igual(leido.resumen.hojasSaltadas,
          ["CONTROL PAGOS", "EFECTIVO", "RESUMEN DE PAGOS"]);
  });

  prueba("solo avisa de los DOS renglones que de verdad tienen algo raro", () => {
    // Ni uno más: un aviso que sale de sobra deja de leerse, y el día que
    // salga uno de verdad se pierde entre el ruido.
    igual(leido.avisos.length, 2);
  });

  prueba("avisa de la fecha imposible, y no la deja entrar", () => {
    const a = leido.avisos.find((x) => /fecha/.test(x.motivo));
    cierto(a, "tiene que haber un aviso de fecha");
    igual(a.dice, "28/08/0206");
    igual(a.hoja, "LAGOS");
    cierto(!leido.compras.some((c) => c.fecha.startsWith("0206")),
           "ninguna factura puede quedar en el año 206");
  });

  prueba("avisa de la factura sin valor, pero SÍ la deja entrar", () => {
    // Existe, llegó y hay que pagarla. Lo que no se puede es inventarle el
    // valor ni callar que el total va corto.
    const a = leido.avisos.find((x) => /valor/.test(x.motivo));
    cierto(a, "tiene que haber un aviso de valor");
    igual(a.proveedor, "JAMAICA");
    igual(leido.resumen.sinValor, 1);
  });

  prueba("no se traga la tablita de totales metida entre las filas", () => {
    // En BOSQUELARGO, entre las filas 60 y 65, ella tiene un mini-resumen con
    // nombres de proveedor y cifras. Nada de eso es una factura.
    cierto(!leido.compras.some((c) => c.proveedor === "BOSQUE"),
           "BOSQUE es un título de esa tablita, no un proveedor");
    cierto(!leido.compras.some((c) => /^\d+$/.test(c.proveedor)),
           "un número no es un proveedor");
  });

  prueba("dice cuáles facturas están repetidas, sin borrar ninguna", () => {
    // Puede ser doble registro o puede ser real (dos entregas el mismo día).
    // No se decide por ella.
    igual(leido.repetidas.length, 2);
    for (const r of leido.repetidas) igual(r.proveedor, "DIEGO VELASQUEZ");
  });

  prueba("toda factura que entró tiene fecha, proveedor y sede", () => {
    for (const c of leido.compras) {
      cierto(/^\d{4}-\d{2}-\d{2}$/.test(c.fecha), "fecha rara: " + c.fecha);
      cierto(!!c.proveedor, "sin proveedor");
      cierto(!!c.sede, "sin sede");
    }
  });

  prueba("la cantidad se guarda TAL CUAL viene, sin convertirla", () => {
    // Viene en diecinueve formatos: "20 KILOS", "20KL", "8,29 KG", "20770
    // GRAMOS". Convertirla sería inventarse un número: hay una pechuga
    // anotada como "862 KILOS" que por el precio no pasa de 24.
    const raras = leido.compras.filter((c) => /KL|KG|GRAMOS|BULTOS/i.test(c.cantidad));
    cierto(raras.length > 50, "deberían quedar muchas con su unidad escrita");
  });

  prueba("el pago semanal de una semana real da un número", () => {
    // De punta a punta: del Excel a la meta que ella pidió.
    const r = pagoSemanal(leido.compras, "2026-09-07", "2026-09-13");
    cierto(r.total.porPagar > 0, "tiene que haber algo por pagar");
    igual(r.total.pagado, 0, "recién importado, nada está marcado como pagado");
    igual(r.total.porPagar, r.total.total);
  });

  prueba("y salen los proveedores escritos de dos formas", () => {
    // Es lo que haría girar dos veces al mismo señor.
    const pares = proveedoresParecidos(leido.compras);
    cierto(pares.some((p) =>
      (p.a === "DIEGO VELASQUEZ" && p.b === "DIEGO VELAZQUEZ") ||
      (p.b === "DIEGO VELASQUEZ" && p.a === "DIEGO VELAZQUEZ")),
      "tiene que cazar el de la ese y la zeta");
  });
}

// ---------------------------------------------------------------------------
grupo("Leer las piezas del Excel de compras");

prueba("encuentra el encabezado aunque la hoja empiece corrida", () => {
  // Una hoja del archivo empieza en la columna B y la otra en la C.
  const filas = [
    [null, "ARROZ PAISA IBAGUE"],
    [],
    [null, null, "FECHA", "No FACTURA", "NOMBRE DE QUIEN INGRESA", "PROVEEDOR",
     "PRODUCTO", "CANTIDAD", "VALOR TOTAL"],
  ];
  const cab = buscarEncabezado(filas);
  igual(cab.fila, 2);
  igual(cab.columnas.fecha, 2);
  igual(cab.columnas.proveedor, 5);
});

prueba("una hoja sin número de factura NO es de facturas", () => {
  // Es "CONTROL PAGOS": tiene fecha, proveedor y valor, pero es el calendario
  // de giros. Si entrara, se colarían doce renglones que no son facturas.
  igual(buscarEncabezado([
    ["FECHA", "PROVEEDOR", "PRODUCTO", "CENTRO DE COSTO", "FRECUENCIA PAGO",
     "CUENTA", "VALOR", "ESTADO"],
  ]), null);
});

prueba("una hoja que no tiene nada que ver se salta", () => {
  igual(leerHojaDeCompras("EFECTIVO", [[null, "PAGOS EN EFECTIVO"], [null, "HIELO"]]), null);
});

prueba("lee la plata venga como venga", () => {
  igual(aPlata(170000), 170000);
  igual(aPlata("170000"), 170000);
  igual(aPlata("$ 170.000"), 170000);
  igual(aPlata("170.000"), 170000);
  igual(aPlata(""), null);
  igual(aPlata(null), null);
  igual(aPlata("no sé"), null);
  igual(aPlata(0), null, "cero no es un valor, es que falta");
});
