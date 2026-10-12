// ============================================================================
//  Sincronía con la nube: el archivo entero se vuelve renglones, y los
//  renglones que llegan se aplican sin pisar lo demás. Si esto falla, dos
//  computadores se pisan los datos callados -- justo lo que la nube debía
//  evitar.
// ============================================================================
import { grupo, prueba, igual, cierto } from "./probar.mjs";
import { datosVacios, nuevoConsumo, agregarProducto, agregarPersona, agregarEmpresa } from "../js/nucleo/modelo.js";
import {
  idDeDoc, llaveDeDoc, canonico, instantanea, diferencias, aplicar, enLotes,
  armarDesdeDocumentos, DOC_CONFIG, COLECCIONES,
} from "../js/datos/sincronia.js";

function conDeTodo() {
  const d = datosVacios();
  agregarEmpresa(d, { codigo: "MGP", razonSocial: "Industrias MGP" });
  agregarProducto(d, "ALMUERZO", { MGP: 12000 });
  agregarProducto(d, "1/2 POLLO", { MGP: 18000 });
  agregarPersona(d, { nombre: "ANA PEREZ", empresa: "MGP" });
  d.consumos.push(nuevoConsumo({ fecha: "2026-10-01", empresa: "MGP", persona: "ANA PEREZ", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 }));
  d.config.acreedor = { nombre: "Arroz Paisa", nit: "123", ciudad: "Ibagué" };
  return d;
}

grupo("Identificadores de documento");

prueba("una llave con barra, punto o tilde da un id válido y se devuelve igual", () => {
  for (const llave of ["1/2 POLLO", "MGP|ANA PEREZ", "QUATRO 1,5", "AREPA DE CHÓCOLO", ".", "..", "__raro__", "a/b/c"]) {
    const id = idDeDoc(llave);
    cierto(!id.includes("/"), `sin barra: ${id}`);
    cierto(id !== "." && id !== ".." && !/^__.*__$/.test(id), `no es reservado: ${id}`);
    igual(llaveDeDoc(id), llave);
  }
});

grupo("El texto canónico");

prueba("el mismo contenido da el mismo texto, sin importar el orden de las llaves", () => {
  igual(canonico({ b: 1, a: [1, { d: 2, c: 3 }] }), canonico({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

prueba("los sellos (_por, _en) y los undefined no cuentan", () => {
  igual(canonico({ a: 1, _por: "x", _en: 5, b: undefined }), canonico({ a: 1 }));
});

grupo("Qué cambió: del archivo entero a renglones");

prueba("de vacío a vacío no hay nada que mandar", () => {
  const { cambios } = diferencias(instantanea(datosVacios()), datosVacios());
  igual(cambios, []);
});

prueba("la primera vez, todo es nuevo: una escritura por renglón, precio, persona, empresa y config", () => {
  const d = conDeTodo();
  const { cambios } = diferencias(null, d);
  const por = (c) => cambios.filter((x) => x.coleccion === c);
  igual(por("empresas").length, 1);
  igual(por("productos").length, 2);
  igual(por("personas").length, 1);
  igual(por("consumos").length, 1);
  igual(por("precios").length, 2);
  igual(por("config").length, 1);
  igual(por("config")[0].id, DOC_CONFIG);
  cierto(cambios.every((c) => c.accion === "poner"));
});

prueba("anotar un plato manda SOLO ese consumo", () => {
  const d = conDeTodo();
  const { instantanea: foto } = diferencias(null, d);
  d.consumos.push(nuevoConsumo({ fecha: "2026-10-02", empresa: "MGP", persona: "ANA PEREZ", producto: "ALMUERZO", cantidad: 2, precioUnitario: 12000 }));
  const { cambios } = diferencias(foto, d);
  igual(cambios.length, 1);
  igual(cambios[0].coleccion, "consumos");
  igual(cambios[0].id, d.consumos[1].id);
  igual(cambios[0].doc.cantidad, 2);
});

prueba("cambiar la cantidad manda ese consumo; borrarlo manda 'quitar'", () => {
  const d = conDeTodo();
  let { instantanea: foto } = diferencias(null, d);
  d.consumos[0].cantidad = 3;
  let r = diferencias(foto, d);
  igual(r.cambios.map((c) => c.accion), ["poner"]);
  foto = r.instantanea;
  const id = d.consumos[0].id;
  d.consumos.splice(0, 1);
  r = diferencias(foto, d);
  igual(r.cambios, [{ coleccion: "consumos", id, accion: "quitar" }]);
});

prueba("renombrar un plato es quitar el viejo y poner el nuevo, y mover su precio", () => {
  const d = conDeTodo();
  const { instantanea: foto } = diferencias(null, d);
  d.productos[0].nombre = "ALMUERZO ESPECIAL";
  d.precios["ALMUERZO ESPECIAL|MGP"] = d.precios["ALMUERZO|MGP"];
  delete d.precios["ALMUERZO|MGP"];
  const { cambios } = diferencias(foto, d);
  const resumen = cambios.map((c) => `${c.coleccion}:${c.accion}:${llaveDeDoc(c.id)}`).sort();
  igual(resumen, [
    "precios:poner:ALMUERZO ESPECIAL|MGP",
    "precios:quitar:ALMUERZO|MGP",
    "productos:poner:ALMUERZO ESPECIAL",
    "productos:quitar:ALMUERZO",
  ]);
});

prueba("un precio va como documento { valor }", () => {
  const d = conDeTodo();
  const { cambios } = diferencias(null, d);
  const precio = cambios.find((c) => c.coleccion === "precios" && llaveDeDoc(c.id) === "ALMUERZO|MGP");
  igual(precio.doc, { valor: 12000 });
});

prueba("cambiar el mes que se mira NO se sube; cambiar quién cobra sí", () => {
  const d = conDeTodo();
  const { instantanea: foto } = diferencias(null, d);
  d.config.mes = 11;
  d.config.anio = 2027;
  igual(diferencias(foto, d).cambios, [], "el mes es de cada computador");
  d.config.acreedor.nit = "999";
  const { cambios } = diferencias(foto, d);
  igual(cambios.length, 1);
  igual(cambios[0].coleccion, "config");
  igual(cambios[0].doc.acreedor.nit, "999");
  igual(cambios[0].doc.mes, undefined);
});

prueba("los sellos que puso la nube no hacen que un renglón parezca cambiado", () => {
  const d = conDeTodo();
  const { instantanea: foto } = diferencias(null, d);
  d.consumos[0]._por = "mama@arrozpaisa.co";
  d.consumos[0]._en = 1700000000;
  igual(diferencias(foto, d).cambios, []);
});

prueba("cuadres no se sube: ya no lo usa nadie", () => {
  cierto(!COLECCIONES.cuadres);
});

prueba("los lotes son de 500 como máximo", () => {
  const muchos = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
  const lotes = enLotes(muchos);
  igual(lotes.map((l) => l.length), [500, 500, 201]);
  igual(enLotes([]), []);
});

grupo("Aplicar lo que llega de la nube");

prueba("un consumo nuevo de otro computador se agrega al final", () => {
  const d = conDeTodo();
  const ajeno = nuevoConsumo({ fecha: "2026-10-03", empresa: "MGP", persona: "ANA PEREZ", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 });
  const { cambiados } = aplicar(d, [{ coleccion: "consumos", id: ajeno.id, accion: "poner", doc: { ...ajeno, _por: "lagos@arrozpaisa.co" } }]);
  igual(cambiados, 1);
  igual(d.consumos.length, 2);
  igual(d.consumos[1].id, ajeno.id);
  igual(d.consumos[1]._por, "lagos@arrozpaisa.co", "y trae quién lo anotó");
});

prueba("un consumo que cambió allá se reemplaza AQUÍ en su mismo puesto", () => {
  const d = conDeTodo();
  d.consumos.push(nuevoConsumo({ fecha: "2026-10-02", empresa: "MGP", persona: "ANA PEREZ", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 }));
  const primero = d.consumos[0];
  const { cambiados } = aplicar(d, [{ coleccion: "consumos", id: primero.id, accion: "poner", doc: { ...primero, cantidad: 5 } }]);
  igual(cambiados, 1);
  igual(d.consumos[0].id, primero.id, "sigue de primero");
  igual(d.consumos[0].cantidad, 5);
  igual(d.consumos.length, 2);
});

prueba("el eco de lo que uno mismo escribió no cuenta como cambio, pero deja los sellos", () => {
  const d = conDeTodo();
  const mio = d.consumos[0];
  const { cambiados } = aplicar(d, [{ coleccion: "consumos", id: mio.id, accion: "poner", doc: { ...mio, _por: "yo", _en: 7 } }]);
  igual(cambiados, 0);
  cierto(d.consumos[0] === mio, "es el mismo objeto, no una copia");
  igual(mio._por, "yo");
});

prueba("borrado allá, se borra aquí; borrar lo que ya no está no es un cambio", () => {
  const d = conDeTodo();
  const id = d.consumos[0].id;
  igual(aplicar(d, [{ coleccion: "consumos", id, accion: "quitar" }]).cambiados, 1);
  igual(d.consumos.length, 0);
  igual(aplicar(d, [{ coleccion: "consumos", id, accion: "quitar" }]).cambiados, 0);
});

prueba("un precio que llega se pone en el mapa, y el mismo valor no cuenta", () => {
  const d = conDeTodo();
  const id = idDeDoc("ALMUERZO|MGP");
  igual(aplicar(d, [{ coleccion: "precios", id, accion: "poner", doc: { valor: 13000 } }]).cambiados, 1);
  igual(d.precios["ALMUERZO|MGP"], 13000);
  igual(aplicar(d, [{ coleccion: "precios", id, accion: "poner", doc: { valor: 13000 } }]).cambiados, 0);
  igual(aplicar(d, [{ coleccion: "precios", id, accion: "quitar" }]).cambiados, 1);
  igual("ALMUERZO|MGP" in d.precios, false);
});

prueba("la config que llega cambia quién cobra pero no toca el mes de este computador", () => {
  const d = conDeTodo();
  d.config.mes = 3;
  const { cambiados } = aplicar(d, [{ coleccion: "config", id: DOC_CONFIG, accion: "poner",
    doc: { acreedor: { nombre: "Otro", nit: "1", ciudad: "X" }, mes: 12, anio: 2030 } }]);
  igual(cambiados, 1);
  igual(d.config.acreedor.nombre, "Otro");
  igual(d.config.mes, 3);
});

prueba("una colección desconocida se ignora sin reventar", () => {
  const d = conDeTodo();
  igual(aplicar(d, [{ coleccion: "cuadres", id: "x", accion: "poner", doc: { valor: 1 } }]).cambiados, 0);
  igual(aplicar(d, [{ coleccion: "loQueSea", id: "x", accion: "poner", doc: {} }]).cambiados, 0);
});

prueba("aplicar deja la instantánea al día: lo que llegó no se vuelve a mandar", () => {
  const d = conDeTodo();
  const { instantanea: foto } = diferencias(null, d);
  const ajeno = nuevoConsumo({ fecha: "2026-10-03", empresa: "MGP", persona: "ANA PEREZ", producto: "ALMUERZO", cantidad: 1, precioUnitario: 12000 });
  aplicar(d, [{ coleccion: "consumos", id: ajeno.id, accion: "poner", doc: ajeno }], foto);
  igual(diferencias(foto, d).cambios, [], "si se mandara otra vez, cada computador le haría eco al otro sin parar");
  const id = d.consumos[0].id;
  aplicar(d, [{ coleccion: "consumos", id, accion: "quitar" }], foto);
  igual(diferencias(foto, d).cambios, []);
});

prueba("armar los datos desde los documentos de la nube da un objeto completo", () => {
  const original = conDeTodo();
  const { cambios } = diferencias(null, original);
  const documentos = {};
  for (const c of cambios) (documentos[c.coleccion] ||= {})[c.id] = c.doc;
  const armado = armarDesdeDocumentos(datosVacios(), documentos);
  igual(armado.consumos.length, 1);
  igual(armado.personas.length, 1);
  // La app limpia "1/2 POLLO" a "1 2 POLLO" al crearlo; la barra se prueba aparte en idDeDoc.
  igual(armado.productos.map((p) => p.nombre).sort(), ["1 2 POLLO", "ALMUERZO"]);
  igual(armado.precios, original.precios);
  igual(canonico(armado.config.acreedor), canonico(original.config.acreedor));
  igual(diferencias(instantanea(armado), original).cambios, [], "y es igual al original, renglón por renglón");
});
