// ============================================================================
//  pdf.js  -  Los documentos que se le entregan a la gente.
//
//  La cuenta de cobro es lo que el cliente recibe en la mano: tiene que verse
//  como un documento serio, no como una captura de pantalla.
// ============================================================================

import { pesos, fechaCorta, fechaLarga, nombreMes ,
  sedeDeEmpresa, razonSocialDe,
} from "../nucleo/formato.js";

// Los mismos colores del restaurante que usa la app. Cuando el supervisor
// recibe el PDF tiene que reconocerlo como el mismo documento que le mostraron
// en pantalla, no como algo salido de otro lado.
//
// (Antes esto era verde, de una version anterior. Un PDF verde llegando de una
// app roja se ve como si lo hubiera hecho otra persona.)
const MARCA = [217, 43, 34];      // --marca      #d92b22
const MARCA_HONDA = [192, 34, 25];// --marca-hondo #c02219
const ACHIOTE = [188, 67, 24];    // avisos
const GRIS = [133, 117, 110];
const RAYA = [251, 246, 237];     // el beige clarito de las filas alternas
const BEIGE = [233, 220, 198];
const TINTA = [36, 27, 24];
const BORDE = [229, 220, 204];    // --borde       #e5dccc, el filo de las tarjetas
const HUESO = [253, 250, 244];    // --papel-hueso #fdfaf4, el pie de la tarjeta

/**
 * "#a81e17" -> [168, 30, 23].
 *
 * El color de cada empresa lo reparte la app (componentes.js) y viene en hex,
 * que es lo que entiende el navegador; jsPDF pide tres numeros. Si llega algo
 * que no es un color, se usa el rojo de la marca: una tarjeta con la cinta del
 * color equivocado se entrega, una que revienta no.
 */
function aRGB(hex, siNo) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return siNo;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Como se cobra un renglon. La misma cuenta que hace la app. */
function formaDe(c) {
  return c.cobro || (c.facturable === false ? "cortesia" : "empresa");
}


/**
 * El logo, listo para meterlo en un PDF.
 *
 * jsPDF NO sabe esperar: cuando uno le pide poner una imagen, la necesita ya
 * convertida. Por eso se carga una sola vez al arrancar y se guarda aqui.
 * Si no alcanzo a cargar, el PDF sale sin logo y ya: una cuenta de cobro sin
 * logo sirve igual, pero una que se queda pegada esperando una imagen, no.
 */
let logoListo = null;

/**
 * Ojo con CUAL logo.
 *
 * El original es un JPG con fondo rojo, y ese rojo NO es el mismo de la app.
 * Puesto encima de la portada roja se ve un cuadrado de otro tono, como un
 * parche pegado. Por eso se usa la version blanca con fondo transparente
 * (la saca tests/sacar-logo.html), que se funde con cualquier rojo.
 *
 * Si esa version no esta, se cae al JPG: mejor un logo con parche que ningun
 * logo, y mucho mejor que un documento que no sale.
 */
export async function prepararLogo(ruta = "img/logo-blanco.png") {
  if (logoListo) return logoListo;
  try {
    let respuesta = await fetch(ruta);
    if (!respuesta.ok && ruta !== "img/logo.jpg") respuesta = await fetch("img/logo.jpg");
    if (!respuesta.ok) return null;
    const trozo = await respuesta.blob();
    logoListo = await new Promise((listo, falla) => {
      const lector = new FileReader();
      lector.onload = () => listo(lector.result);
      lector.onerror = falla;
      lector.readAsDataURL(trozo);
    });
    return logoListo;
  } catch {
    return null; // sin logo se puede vivir; sin cuenta de cobro no
  }
}

/**
 * Pone el logo, si hay.
 *
 * jsPDF necesita que le digan el formato ("PNG", "JPEG"). Escribirlo a mano en
 * cada documento es una trampa: el dia que cambie el archivo del logo, los
 * documentos que quedaron con el formato viejo dejan de salir -- y nadie lo
 * nota hasta que a alguien le toca entregar una cuenta de cobro.
 * Aqui se deduce del propio dato, asi que no hay nada que actualizar.
 */
function ponerLogo(doc, x, y, ancho, alto) {
  if (!logoListo) return false;
  const formato = logoListo.slice(0, 20).includes("image/png") ? "PNG" : "JPEG";
  try {
    doc.addImage(logoListo, formato, x, y, ancho, alto);
    return true;
  } catch {
    return false; // un documento sin logo se entrega; uno que revienta, no
  }
}

function nuevoDocumento(orientacion = "p") {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("No se pudo cargar el creador de PDF. Recargue la página (Ctrl + F5).");
  }
  return new window.jspdf.jsPDF({ orientation: orientacion, unit: "mm", format: "letter" });
}

// ---------------------------------------------------------------------------
//  Que un nombre quepa
//
//  Los nombres de las empresas no miden todos lo mismo: "INDUSTRIAS MGP" y
//  "BOTAS AGROINDUSTRIAL SAS" no ocupan igual. Con un tamano de letra fijo hay
//  que escoger el que le sirva al nombre mas largo, y entonces TODOS salen
//  chiquitos -- que es de lo que se quejo quien recibe los documentos.
//
//  Aqui no se escoge un tamano: se escoge un hueco, y el nombre sale con la
//  letra mas grande que quepa en ese hueco.
// ---------------------------------------------------------------------------

/**
 * De un renglon al siguiente, en milimetros.
 *
 * jsPDF pide el tamano de letra en puntos pero pinta en milimetros, y un punto
 * son 0.3528 mm. Separar dos renglones "a ojo" con un numero fijo cuadra con
 * una letra y se pisa con la de al lado; con esto no hay que adivinar.
 */
const ALTO_RENGLON = 1.15 * 0.3528; // el mismo interlineado que usa jsPDF

/**
 * El tamano de letra mas grande con el que el texto todavia cabe en el ancho.
 *
 * Se empieza por el grande y se va bajando de a poco. Del minimo no baja: si
 * ni asi cabe, se parte en renglones. La letra (negrilla o normal) hay que
 * ponerla ANTES de llamar, porque la negrilla mide mas y si no la cuenta sale
 * corta y el texto se sale igual.
 */
function medirAjustado(doc, texto, anchoMax, tamMax, tamMin) {
  const t = String(texto || "-");
  let tam = tamMax;
  while (tam > tamMin) {
    doc.setFontSize(tam);
    if (doc.getTextWidth(t) <= anchoMax) break;
    tam -= 0.5;
  }
  doc.setFontSize(tam);
  const renglones = doc.getTextWidth(t) <= anchoMax ? [t] : doc.splitTextToSize(t, anchoMax);
  return { tam, renglones, alto: renglones.length * tam * ALTO_RENGLON };
}

/** Lo escribe con esa letra y devuelve la medida, para saber que sigue debajo. */
function escribirAjustado(doc, texto, x, y, anchoMax, tamMax, tamMin, opciones) {
  const medida = medirAjustado(doc, texto, anchoMax, tamMax, tamMin);
  doc.setFontSize(medida.tam);
  doc.text(medida.renglones, x, y, opciones);
  return medida;
}

/** El encabezado rojo que llevan todos los documentos. */
function encabezado(doc, titulo, subtitulo, acreedor, conLogo = false) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, ancho, 26, "F");

  // El logo va PRIMERO y en su propio pedazo de la franja, y las letras se
  // corren para dejarle el sitio.
  //
  // Antes se pintaba de ultimo y en el mismo punto donde arranca el subtitulo:
  // el dibujo es blanco, la letra tambien, y el mes quedaba tapado desde la
  // primera silaba. Eso no se ve en el codigo -- hay que medir el dibujo para
  // darse cuenta -- pero en el papel salta a la vista.
  //
  // Si el logo no alcanzo a cargar no se deja el hueco vacio: las letras se
  // corren solo cuando de verdad hay algo que esquivar.
  const izquierda = conLogo && ponerLogo(doc, 12, 4, 18, 18) ? 34 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(titulo, izquierda, 12);

  // El bloque de la derecha se pinta primero, para saber cuanto sitio deja.
  // El subtitulo es donde va el nombre de la empresa, y si se agranda a ciegas
  // termina montado encima de este bloque: jsPDF no avisa cuando dos textos se
  // pisan, los pinta uno sobre el otro y quien lee no entiende nada.
  let ocupaDerecha = 0;
  if (acreedor && acreedor.nombre) {
    doc.setFont("helvetica", "bold");
    const nombre = escribirAjustado(doc, acreedor.nombre, ancho - 14, 11.5, 76, 10.5, 7.5, { align: "right" });
    ocupaDerecha = doc.getTextWidth(nombre.renglones[0]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (acreedor.nit) {
      doc.text("NIT " + acreedor.nit, ancho - 14, 17.5, { align: "right" });
      ocupaDerecha = Math.max(ocupaDerecha, doc.getTextWidth("NIT " + acreedor.nit));
    }
    if (acreedor.ciudad) {
      doc.text(acreedor.ciudad, ancho - 14, 22.5, { align: "right" });
      ocupaDerecha = Math.max(ocupaDerecha, doc.getTextWidth(acreedor.ciudad));
    }
  }

  // El subtitulo lleva el mes y el nombre de la empresa. Iba en 9.5, la letra
  // mas chiquita de la hoja, siendo lo que mas se busca al recibir el papel.
  doc.setFont("helvetica", "normal");
  escribirAjustado(doc, subtitulo, izquierda, 19.5, ancho - izquierda - 20 - ocupaDerecha, 11.5, 8);

  doc.setTextColor(0, 0, 0);
  return 34;
}

/** El pie con la fecha en que se generó y el número de página. */
function pieDePagina(doc) {
  const total = doc.internal.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    // La letra se dice, no se hereda. jsPDF se queda con la ultima que se haya
    // puesto, asi que el pie salia en la de lo ultimo que se hubiera pintado
    // -- y con las tarjetas, que terminan en maquina de escribir, el pie de
    // TODAS las hojas cambiaba de letra sin que nadie lo hubiera pedido.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Generado el ${fechaCorta(new Date().toISOString().slice(0, 10))}`, 14, alto - 8);
    doc.text(`Página ${i} de ${total}`, ancho - 14, alto - 8, { align: "right" });
  }
}

const estiloTabla = {
  theme: "grid",
  headStyles: { fillColor: MARCA, textColor: 255, fontStyle: "bold", fontSize: 9.5 },
  bodyStyles: { fontSize: 9.5, textColor: TINTA },
  alternateRowStyles: { fillColor: RAYA },
  styles: { cellPadding: 2.2, lineColor: [207, 219, 203], lineWidth: 0.15 },
  margin: { left: 14, right: 14 },

  // El encabezado SÍ se repite en cada hoja (si no, la hoja 2 son números sin
  // título); el pie NO. autoTable repite los dos por su cuenta, y un renglón
  // que dice "TOTAL A PAGAR $ 2.779.000" al pie de la hoja 1 de 3 se lee como
  // si esa hoja sumara eso -- o peor, alguien suma los tres totales y le da el
  // triple. El total va una vez, donde de verdad se acaba la cuenta.
  showFoot: "lastPage",
};

function guardar(doc, nombre) {
  doc.save(nombre);
}

// ---------------------------------------------------------------------------
//  Cuenta de cobro
// ---------------------------------------------------------------------------

export function pdfCuentaDeCobro(cuenta, acreedor) {
  const doc = nuevoDocumento();
  const { empresa, anio, mes, quincena, rango, personas, total, facturas, fechaCuenta } = cuenta;
  const periodo = `Del ${rango.desde} al ${rango.hasta} de ${nombreMes(mes).toLowerCase()} de ${anio}`;

  // Con el logo del restaurante en la franja. Si no alcanzo a cargar, la
  // cuenta se entrega igual: sin logo se cobra, sin cuenta no.
  // Si los días se escogieron a mano, el rótulo NO puede decir "Quincena 2":
  // el papel diría una cosa y cubriría otra, y quien lo recibe archiva por ese
  // rótulo. Cuando es la quincena de verdad, se sigue llamando por su nombre.
  const rotulo = cuenta.rangoEscogido
    ? `${nombreMes(mes)} ${anio} · Del ${rango.desde} al ${rango.hasta}`
    : `${nombreMes(mes)} ${anio} · Quincena ${quincena}`;
  let y = encabezado(doc, "CUENTA DE COBRO", rotulo, acreedor, true);

  // La fecha en que se pasa la cuenta, si ella la puso. No se inventa: un
  // documento con fecha inventada es peor que uno sin fecha.
  if (fechaCuenta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    const ciudad = acreedor && acreedor.ciudad ? acreedor.ciudad + ", " : "";
    doc.text(ciudad + fechaLarga(fechaCuenta), 196, y - 2, { align: "right" });
    y += 4;
  }

  // Quién le debe a quién. Es lo primero que mira el contador del cliente.
  //
  // Va primero el que DEBE y después a quién, para que se lea como la frase
  // que es: "BASARILI debe a VALENTINA SANCHEZ GUZMAN". Al reves -- que es como
  // estaba -- hay que armar la frase de memoria, y en un papel que se entrega
  // eso se presta para leerlo al contrario.
  //
  // En grande va la SEDE y no la razón social. Tres de las cuatro empresas se
  // llaman "BOTAS AGROINDUSTRIAL SAS", así que las cuentas de AGRO, BASARILI y
  // PUNTERAS salían EXACTAMENTE iguales en la parte de arriba: ella no sabía
  // cuál entregar y quien la recibía no sabía si era la suya. La razón social y
  // el NIT no se van -- son el deudor legal y el contador los necesita -- se
  // bajan al renglón de abajo.
  //
  // Los dos nombres salen del mismo tamano y lo mas grandes que quepan. Del
  // mismo tamano porque son la misma cosa vista de los dos lados: si uno sale
  // grande y el otro chiquito, el documento se ve mal armado.
  const quienDebe = sedeDeEmpresa(empresa);
  const debeA = acreedor.nombre || "-";

  // Lo chiquito de cada lado. Son dos renglones a lo sumo, y la cajita crece
  // para que quepan: antes cabía uno solo (el NIT) y ya.
  const pieIzq = [razonSocialDe(empresa), empresa.nit ? "NIT " + empresa.nit : null]
    .filter(Boolean);
  const pieDer = [acreedor.nit ? "NIT " + acreedor.nit : null, acreedor.ciudad || null]
    .filter(Boolean);
  const renglonesPie = Math.max(pieIzq.length, pieDer.length, 1);
  const utilCaja = 80;
  doc.setFont("helvetica", "bold");
  const mideIzq = medirAjustado(doc, quienDebe, utilCaja, 15, 9.5);
  const mideDer = medirAjustado(doc, debeA, utilCaja, 15, 9.5);
  const tamNombre = Math.min(mideIzq.tam, mideDer.tam);
  const renglonesNombre = Math.max(mideIzq.renglones.length, mideDer.renglones.length);

  // La cajita se hace del alto que pidan los nombres, no al reves. Antes era
  // de 26 mm fijos y por eso el nombre tenia que ser chiquito para caber.
  const baseNombre = y + 14;
  const baseNit = baseNombre + (renglonesNombre - 1) * tamNombre * ALTO_RENGLON + 8;
  const altoCaja = baseNit - y + 5 + (renglonesPie - 1) * 4.6;

  doc.setDrawColor(207, 219, 203);
  doc.setFillColor(251, 252, 250);
  doc.roundedRect(14, y, 88, altoCaja, 1.5, 1.5, "FD");
  doc.roundedRect(108, y, 88, altoCaja, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text("QUIEN DEBE", 18, y + 6);
  doc.text("DEBE A", 112, y + 6);

  doc.setTextColor(22, 33, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tamNombre);
  doc.text(doc.splitTextToSize(quienDebe, utilCaja), 18, baseNombre);
  doc.text(doc.splitTextToSize(debeA, utilCaja), 112, baseNombre);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  pieIzq.forEach((linea, i) =>
    escribirAjustado(doc, linea, 18, baseNit + i * 4.6, utilCaja, 8.5, 6.5));
  pieDer.forEach((linea, i) =>
    escribirAjustado(doc, linea, 112, baseNit + i * 4.6, utilCaja, 8.5, 6.5));
  doc.setTextColor(22, 33, 27);

  y += altoCaja + 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Concepto:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Almuerzos y bebidas suministrados. ${periodo}.`, 36, y);
  y += 8;

  // Cada persona, y debajo lo que pidió DÍA POR DÍA.
  //
  // El nombre y el total son para el contador, que descuenta por nómina. Los
  // renglones de abajo son para el otro momento: cuando el trabajador dice "el
  // 3 de agosto yo no pedí nada". Sin la fecha ese reclamo no se puede
  // contestar con el papel en la mano, que es justo para lo que sirve.
  //
  // La persona va en un renglón aparte, ancho y en beige, y sus pedidos debajo.
  // Es la misma forma que ya tiene el PDF de los pedidos del día, así que quien
  // recibe los dos papeles no tiene que aprender dos maneras de leer.
  const cuerpo = [];
  const esPersona = [];
  for (const p of personas) {
    esPersona[cuerpo.length] = true;
    cuerpo.push([{ content: `${p.persona}   ·   ${pesos(p.total)}`, colSpan: 4 }]);
    for (const r of p.renglones) {
      cuerpo.push([
        fechaCorta(r.fecha),
        r.producto,
        String(r.cantidad),
        pesos(r.total),
      ]);
    }
  }
  // Con 66 personas la cuenta se va a tres hojas, y una hoja suelta llena de
  // nombres y de plata que no dice de quién es ni de qué mes se archiva mal o
  // se le entrega a la empresa equivocada. Desde la segunda, cada una vuelve a
  // decirlo.
  let primeraHoja = true;
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    margin: { left: 14, right: 14, top: 34, bottom: 20 },
    head: [["Día", "Qué pidió", "Cant.", "Valor"]],
    body: cuerpo,
    // Los renglones de detalle van apretados: son muchos -- una quincena de
    // BASARILI son sesenta personas con sus días -- y cada milímetro que se
    // ahorra aquí es media hoja menos que imprimir. El renglón del nombre sí
    // respira, porque es el que separa a un trabajador del siguiente.
    bodyStyles: { fontSize: 9, cellPadding: { top: 1.3, bottom: 1.3, left: 2.2, right: 2.2 } },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 16 },
      3: { halign: "right", cellWidth: 30 },
    },
    // El total ocupa las tres primeras columnas: en la de "Día", que mide 26 mm,
    // "TOTAL A PAGAR" se partía en dos renglones.
    foot: [[{ content: "TOTAL A PAGAR", colSpan: 3 }, pesos(total)]],
    footStyles: { fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold", fontSize: 12, lineWidth: 0.4, lineColor: MARCA, halign: "right" },
    // Que el nombre no se quede solo al pie de una hoja con sus pedidos en la
    // siguiente: leído así, esos pedidos parecen de la persona de arriba.
    rowPageBreak: "avoid",
    didParseCell: (d) => {
      if (d.section === "foot") {
        if (d.column.index === 0) d.cell.styles.halign = "left";
        return;
      }
      if (d.section !== "body") return;
      if (esPersona[d.row.index]) {
        d.cell.styles.fillColor = BEIGE;
        d.cell.styles.textColor = TINTA;
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 10;
        d.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 2.2, right: 2.2 };
      }
    },
    didDrawPage: () => {
      if (primeraHoja) { primeraHoja = false; return; }
      encabezado(doc, "CUENTA DE COBRO", `${rotulo} · ${quienDebe}`, acreedor);
    },
  });

  let fin = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(
    `${personas.length} ${personas.length === 1 ? "persona" : "personas"} · ` +
    `${facturas} ${facturas === 1 ? "factura" : "facturas"}`,
    14, fin
  );

  fin += 26;
  const ancho = doc.internal.pageSize.getWidth();
  doc.setDrawColor(22, 33, 27);
  doc.line(14, fin, 90, fin);
  doc.setTextColor(22, 33, 27);
  doc.setFontSize(9);
  doc.text(acreedor.nombre || "", 14, fin + 5);
  if (acreedor.nit) doc.text("NIT " + acreedor.nit, 14, fin + 10);
  doc.line(ancho - 90, fin, ancho - 14, fin);
  doc.text("Recibido / Aprobado", ancho - 90, fin + 5);

  pieDePagina(doc);
  const cual = cuenta.rangoEscogido ? `${rango.desde}-al-${rango.hasta}` : `Q${quincena}`;
  guardar(doc, `cuenta-de-cobro-${empresa.codigo}-${anio}-${String(mes).padStart(2, "0")}-${cual}.pdf`);
}

// ---------------------------------------------------------------------------
//  Resumen del día
// ---------------------------------------------------------------------------

/**
 * EL RESUMEN DEL DÍA.
 *
 *  Antes esto era media hoja: la tabla de platos y nada más. Y no alcanzaba,
 *  porque lo que el cliente pide todos los días es el documento completo --
 *  hasta ahora ella lo armaba a mano, pegando OCHO pantallazos en un Word:
 *  por cada empresa, la tabla de platos y la lista de quién pidió qué.
 *
 *  Eso es lo que sale de aquí, de un solo botón:
 *
 *      por cada empresa      el nombre en grande
 *                            la tabla de platos, con su total y sus facturas
 *                            quién pidió qué, persona por persona
 *      al final              el día completo, sumando todas
 *
 *  Cada empresa empieza en hoja nueva. No es adorno: así se le puede mandar a
 *  una empresa su hoja sin que lleve la de las otras.
 *
 *  secciones = [{ codigo, razonSocial, informe, comandas }]
 *  combinado = el informe de todas juntas, o null si solo se pidió una empresa
 */
export function pdfResumenDia(secciones, fecha, acreedor, combinado = null) {
  const doc = nuevoDocumento();
  let primera = true;

  for (const sec of secciones) {
    if (!primera) doc.addPage();
    primera = false;

    const rotulo = () =>
      encabezado(doc, "RESUMEN DEL DÍA", `${fechaLarga(fecha)} · ${sec.codigo}`, acreedor);
    let y = rotulo();

    y = tituloDeEmpresa(
      doc, sec.codigo, sec.razonSocial,
      `${sec.informe.facturas} ${sec.informe.facturas === 1 ? "factura" : "facturas"}  ·  ${pesos(sec.informe.total)}`,
      y
    );

    y = tituloDeSeccion(doc, "Lo que se pidió", y + 2);
    y = tablaDePlatos(doc, sec.informe, y, rotulo);

    // Lo pagado de una se dice aparte: esa plata está en la caja y NO va en la
    // cuenta de la empresa. Si no se dijera, el supervisor sumaría de más.
    if (sec.informe.deContado > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRIS);
      doc.text(
        `A la empresa se le cobran ${pesos(sec.informe.aCredito)}. ` +
        `Los otros ${pesos(sec.informe.deContado)} ya se pagaron de una.`,
        14, y + 7
      );
      doc.setTextColor(0, 0, 0);
      y += 7;
    }

    if (sec.comandas.length) {
      const cuantas = sec.comandas.length;
      const suma = sec.comandas.reduce((a, c) => a + c.total, 0);
      // 52 mm es el título más una tarjeta de un solo plato: si no cabe eso,
      // no vale la pena empezar la sección en lo que queda de hoja.
      y = espacioPara(doc, y + 12, 52, rotulo);
      y = tituloDeSeccion(
        doc,
        `Quién pidió qué  ·  ${cuantas} ${cuantas === 1 ? "persona" : "personas"}`,
        y, pesos(suma)
      );
      tarjetasDeComandas(doc, sec.comandas, y, rotulo, sec.color);
    }
  }

  // El día completo, para ella. Es lo que traía el PDF viejo cuando estaba
  // puesto "Todas las empresas", así que no se pierde por meter lo nuevo.
  if (combinado && secciones.length > 1) {
    doc.addPage();
    const rotulo = () =>
      encabezado(doc, "RESUMEN DEL DÍA", `${fechaLarga(fecha)} · Todas las empresas`, acreedor);
    let y = rotulo();
    y = tituloDeEmpresa(
      doc, "EL DÍA COMPLETO", `Las ${secciones.length} empresas juntas`,
      `${combinado.facturas} facturas  ·  ${pesos(combinado.total)}`,
      y
    );
    y = tituloDeSeccion(doc, "Todo lo que se pidió", y + 2);
    tablaDePlatos(doc, combinado, y, rotulo);
  }

  pieDePagina(doc);
  const cual = secciones.length === 1 ? "-" + String(secciones[0].codigo).replace(/\s+/g, "-") : "";
  guardar(doc, `resumen-${fecha}${cual}.pdf`);
}

// ---------------------------------------------------------------------------
//  Los pedidos del día, uno por persona
//
//  Este es el papel que se le manda a la gente de la fábrica, no a la cocina.
//  Por eso NO va por plato ("47 almuerzos"): va por PERSONA, con lo que pidió
//  y lo que vale. Al otro lado cada quien busca su nombre y ve su pedido; el
//  supervisor cuadra la lista contra la asistencia.
//
//  Lo que la persona ya pagó de su bolsillo SÍ sale, con un aviso al lado y en
//  gris. Si no saliera, el supervisor vería un hueco en la lista y preguntaría
//  por qué esa persona no comió ese día.
// ---------------------------------------------------------------------------

/**
 * La tabla de "quién pidió qué", que usan dos documentos.
 *
 * Es UNA sola tabla corrida donde la persona es un renglón más, de ancho
 * completo y con fondo beige. Se intentó una tabla por persona y hay que
 * adivinar cuánto mide cada una para saber si cabe en lo que queda de hoja --
 * y la adivinada nunca da: un nombre largo o una nota parten un renglón en
 * dos y ya midió mal. autoTable sabe medir sus propios renglones, así que
 * empaqueta perfecto, repite el encabezado y no deja huecos.
 *
 * Devuelve dónde terminó, para poder seguir escribiendo debajo.
 */
function tablaDeComandas(doc, comandas, y, alCambiarDeHoja) {
  const cuerpo = [];
  const esPersona = [];
  const consumoDe = [];
  for (const com of comandas) {
    esPersona[cuerpo.length] = true;
    cuerpo.push([{
      content: com.persona + "   ·   " + pesos(com.total),
      colSpan: 4,
    }]);
    for (const c of com.platos) {
      consumoDe[cuerpo.length] = c;
      const forma = formaDe(c);
      cuerpo.push([
        c.producto +
          (forma === "contado" ? "  (pagó de una)" : "") +
          (forma === "cortesia" ? "  (cortesía)" : "") +
          (c.observacion ? "  — " + c.observacion : ""),
        String(c.cantidad),
        forma === "cortesia" ? "—" : pesos(c.precioUnitario),
        forma === "cortesia" ? "—" : pesos((Number(c.cantidad) || 0) * (Number(c.precioUnitario) || 0)),
      ]);
    }
  }

  const total = comandas.reduce((a, c) => a + c.total, 0);

  // La primera hoja ya trae su encabezado pintado por quien llamó; las de
  // continuación las pinta esto. No se puede mirar el número de página, porque
  // esta tabla no siempre empieza en la hoja 1: en el resumen de todas las
  // empresas cada empresa arranca donde termine la anterior.
  let primeraHoja = true;

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    margin: { left: 14, right: 14, top: 34, bottom: 20 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    head: [["Plato", "Cant.", "Valor unitario", "Total"]],
    body: cuerpo,
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 32 },
    },
    foot: [[`TOTAL · ${comandas.length} ${comandas.length === 1 ? "persona" : "personas"}`, "", "", pesos(total)]],
    footStyles: { fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold", fontSize: 11.5, lineWidth: 0.4, lineColor: MARCA, halign: "right" },
    didParseCell: (d) => {
      if (d.section === "foot" && d.column.index === 0) { d.cell.styles.halign = "left"; return; }
      if (d.section !== "body") return;
      if (esPersona[d.row.index]) {
        d.cell.styles.fillColor = BEIGE;
        d.cell.styles.textColor = TINTA;
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 10.5;
        d.cell.styles.cellPadding = 3;
        return;
      }
      const c = consumoDe[d.row.index];
      if (!c) return;
      const forma = formaDe(c);
      if (forma !== "empresa") d.cell.styles.textColor = GRIS;
      if (c.observacion && d.column.index === 0) d.cell.styles.fontStyle = "italic";
    },
    didDrawPage: () => {
      if (primeraHoja) { primeraHoja = false; return; }
      if (alCambiarDeHoja) alCambiarDeHoja();
    },
  });

  return doc.lastAutoTable.finalY;
}

// ---------------------------------------------------------------------------
//  "Quién pidió qué", en tarjetas
//
//  Aquí no se escogió el formato: se copió el que ella ya usaba.
//
//  El documento del día lo venía armando a mano en un Word ("28 AGOSTO.docx"):
//  por cada empresa pegaba DOS pantallazos, la tabla de platos y la cuadrícula
//  de comandas de la pantalla. Cuando este PDF empezó a sacar esa segunda
//  mitad como una tabla larga, ella siguió armando el Word igual -- porque lo
//  que el supervisor lee no es una lista de renglones, es un montón de
//  papelitos: de un vistazo ve cuántas personas son y quién es cada una, sin
//  ponerse a seguir el renglón con el dedo.
//
//  Así que aquí se dibujan las MISMAS tarjetas de la pantalla: la cinta de
//  color de la empresa arriba, el numerito, el nombre en grande, el troquel
//  punteado y el total abajo. Lo único que se queda por fuera son los botones
//  "×" y "Abrir", que en un papel no hacen nada.
//
//  Van TRES por fila y no cuatro como en la pantalla. La pantalla es ancha y
//  la hoja carta no: con cuatro, un plato como "ADICIONAL DE COSTILLA" obliga
//  a bajar la letra a un tamaño que quien recibe esto no alcanza a leer -- y
//  esa letra grande es justamente lo que se pidió.
// ---------------------------------------------------------------------------

/** Lo que dice la casilla de la plata en una tarjeta, igual que en pantalla. */
function valorDe(c) {
  const forma = formaDe(c);
  if (forma === "cortesia") return "cortesía";
  const plata = pesos(subtotalDe(c));
  return forma === "contado" ? "pagó " + plata : plata;
}

/**
 * Pinta las comandas como tarjetas y devuelve dónde terminó.
 *
 * alCambiarDeHoja vuelve a pintar el encabezado rojo cuando toca pasar de
 * hoja, y devuelve la altura en la que se puede seguir escribiendo.
 */
function tarjetasDeComandas(doc, comandas, y, alCambiarDeHoja, colorEmpresa) {
  const anchoHoja = doc.internal.pageSize.getWidth();
  const altoHoja = doc.internal.pageSize.getHeight();

  const COLS = 3;
  const HUECO = 5;    // el aire entre tarjeta y tarjeta
  const PAD = 2.6;    // el margen de adentro
  const CINTA = 1.4;  // la franja de color de la empresa, arriba
  const TOPE = 34;    // donde arranca el contenido en una hoja nueva
  const PIE = 18;     // lo que hay que dejarle al pie de página

  const T_NOMBRE = 10, T_PLATO = 8.5, T_VALOR = 8, T_CANT = 7.5, T_NUM = 7, T_TOTAL = 10.5;
  const T_NOTA = 7.5;
  const NUM_ANCHO = 6.6, NUM_ALTO = 4.4, CANT_ANCHO = 5.4, ALTO_PIE = 8.6;

  const ancho = (anchoHoja - 28 - (COLS - 1) * HUECO) / COLS;
  const cinta = aRGB(colorEmpresa, MARCA);
  const de = (tam) => tam * ALTO_RENGLON;

  // El ancho de la columna de la plata se MIDE, no se adivina: "pagó $ 12.000"
  // ocupa casi el doble que "$ 7.000". Con un ancho fijo, o el número se parte
  // en dos renglones o le come el sitio al nombre del plato -- y cuál de las
  // dos cosas pasa depende de lo que se haya pedido ese día, así que se ve
  // bien en la prueba y se daña en la entrega.
  doc.setFont("courier", "normal");
  doc.setFontSize(T_VALOR);
  let masAncho = "";
  for (const com of comandas) {
    for (const c of com.platos) {
      const t = valorDe(c);
      if (doc.getTextWidth(t) > doc.getTextWidth(masAncho)) masAncho = t;
    }
  }

  // A la plata no se le da más de la mitad de la tarjeta: lo que sobra es para
  // el nombre del plato, que es lo que de verdad hay que leer. Y si en ese
  // hueco no cabe -- "pagó $ 1.200.000" mide el doble que "$ 7.000" -- la
  // cifra se escribe más chiquita en vez de meterse encima del plato.
  let tamValor = T_VALOR;
  const hueco = ancho * 0.44;
  while (tamValor > 6) {
    doc.setFontSize(tamValor);
    if (doc.getTextWidth(masAncho) <= hueco) break;
    tamValor -= 0.5;
  }
  doc.setFontSize(tamValor);
  const anchoValor = Math.min(doc.getTextWidth(masAncho) + 0.6, hueco);

  const anchoNombre = ancho - PAD * 2 - NUM_ANCHO - 1.6;
  const anchoPlato = ancho - PAD * 2 - CANT_ANCHO - anchoValor - 1.4;

  // Primero se mide TODO y después se pinta. No se puede pintar sobre la
  // marcha: las tarjetas de una misma fila tienen que quedar del mismo alto
  // (si no, los totales quedan cada uno a su altura y la fila se ve rota), y
  // ese alto no se sabe hasta haber medido las tres.
  const medidas = comandas.map((com, i) => {
    doc.setFont("helvetica", "bold");
    const nombre = medirAjustado(doc, com.persona, anchoNombre, T_NOMBRE, 7.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(T_PLATO);
    const platos = com.platos.map((c) => {
      const lineas = doc.splitTextToSize(String(c.producto || "-"), anchoPlato);

      // La nota del renglón ("sin verduras", "para llevar").
      //
      // La tabla que había antes SÍ la sacaba, y al pasar a tarjetas se me
      // quedó por fuera: el papel dejó de decir algo que el registro sí sabe.
      // Se mide aquí, con la tarjeta, porque cambia el alto -- medirla después
      // dejaría la nota pisando el renglón de abajo.
      doc.setFontSize(T_NOTA);
      const nota = c.observacion
        ? doc.splitTextToSize(String(c.observacion), anchoPlato)
        : [];
      doc.setFontSize(T_PLATO);

      return {
        c, lineas, nota,
        alto: 1.2 + lineas.length * de(T_PLATO) + nota.length * de(T_NOTA) + 1.2,
      };
    });

    const cabeza = CINTA + PAD + Math.max(NUM_ALTO, nombre.alto) + PAD;
    const cuerpo = 1.6 + platos.reduce((a, p) => a + p.alto, 0) + 1.6;
    return {
      com, nombre, platos, cabeza,
      numero: String(i + 1).padStart(2, "0"),
      alto: cabeza + cuerpo + ALTO_PIE,
    };
  });

  /**
   * El troquel del talonario.
   *
   * Si esta versión de jsPDF no sabe de puntos, sale una raya seguida: se ve
   * casi igual y el documento no se cae por un adorno.
   */
  const punteada = (x1, x2, yr) => {
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.25);
    try { doc.setLineDashPattern([0.7, 0.7], 0); } catch { /* raya seguida */ }
    doc.line(x1, yr, x2, yr);
    try { doc.setLineDashPattern([], 0); } catch { /* nada */ }
  };

  function pintar(m, x, y0, altoFila) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.rect(x, y0, ancho, altoFila, "FD");

    // La cinta de color ES el borde de arriba, como en la pantalla: dice de
    // qué empresa es la tarjeta sin que haya que leer nada.
    doc.setFillColor(...cinta);
    doc.rect(x, y0, ancho, CINTA, "F");

    // El numerito se queda chiquito a propósito: es para contar, no para leer.
    const yc = y0 + CINTA + PAD;
    doc.setFillColor(...RAYA);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.rect(x + PAD, yc, NUM_ANCHO, NUM_ALTO, "FD");
    doc.setFont("courier", "bold");
    doc.setFontSize(T_NUM);
    doc.setTextColor(...GRIS);
    doc.text(m.numero, x + PAD + NUM_ANCHO / 2, yc + 3.1, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(m.nombre.tam);
    doc.setTextColor(...TINTA);
    doc.text(m.nombre.renglones, x + PAD + NUM_ANCHO + 1.6, yc + 3.3);

    punteada(x, x + ancho, y0 + m.cabeza);

    let yp = y0 + m.cabeza + 1.6;
    for (let i = 0; i < m.platos.length; i++) {
      const p = m.platos[i];
      if (i) punteada(x + PAD, x + ancho - PAD, yp);
      const forma = formaDe(p.c);
      const base = yp + 1.2 + de(T_PLATO) - 0.9;

      // Lo que NO se le cobra a la empresa va en gris, como en la pantalla: el
      // supervisor tiene que poder saltárselo al cuadrar la cuenta.
      doc.setTextColor(...(forma === "empresa" ? TINTA : GRIS));
      doc.setFont("courier", "normal");
      doc.setFontSize(T_CANT);
      doc.text(String(p.c.cantidad) + "×", x + PAD, base);

      doc.setFont("helvetica", forma === "cortesia" ? "italic" : "normal");
      doc.setFontSize(T_PLATO);
      doc.text(p.lineas, x + PAD + CANT_ANCHO, base);

      doc.setFont("courier", "normal");
      doc.setFontSize(tamValor);
      doc.text(valorDe(p.c), x + ancho - PAD, base, { align: "right" });

      // La nota, debajo del plato y en cursiva: es del plato, no otro plato.
      if (p.nota.length) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(T_NOTA);
        doc.setTextColor(...GRIS);
        doc.text(p.nota, x + PAD + CANT_ANCHO, base + de(T_PLATO) * p.lineas.length - de(T_PLATO) + de(T_NOTA));
      }

      yp += p.alto;
    }

    // El pie: el total de la persona, que es lo que se busca en la tarjeta.
    const yPie = y0 + altoFila - ALTO_PIE;
    doc.setFillColor(...HUESO);
    doc.rect(x + 0.25, yPie, ancho - 0.5, ALTO_PIE - 0.25, "F");
    punteada(x, x + ancho, yPie);
    doc.setFont("courier", "bold");
    doc.setTextColor(...TINTA);
    escribirAjustado(doc, pesos(m.com.total), x + ancho - PAD, yPie + 5.9,
                     ancho - PAD * 2, T_TOTAL, 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  let yFila = y;
  for (let i = 0; i < medidas.length; i += COLS) {
    const fila = medidas.slice(i, i + COLS);
    const altoFila = Math.max(...fila.map((m) => m.alto));
    // Se pasa de hoja SOLO si ya se pintó algo en esta. Una tarjeta más alta
    // que una hoja entera no debería existir (serían cuarenta platos para una
    // sola persona), pero si existiera, saltar de hoja no la haría caber: solo
    // dejaría hojas en blanco, una tras otra.
    if (yFila + altoFila > altoHoja - PIE && yFila > TOPE) {
      doc.addPage();
      yFila = alCambiarDeHoja ? alCambiarDeHoja() : TOPE;
    }
    for (let j = 0; j < fila.length; j++) pintar(fila[j], 14 + j * (ancho + HUECO), yFila, altoFila);
    yFila += altoFila + HUECO;
  }

  doc.setTextColor(0, 0, 0);
  return yFila - HUECO;
}

/** La tabla de platos del día: cuánto se preparó de cada cosa y a cómo. */
function tablaDePlatos(doc, informe, y, alCambiarDeHoja) {
  let primeraHoja = true;
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    margin: { left: 14, right: 14, top: 34, bottom: 20 },
    showHead: "everyPage",
    head: [["Plato", "Cantidad", "Valor unitario", "Total"]],
    body: informe.filas.map((f) => [
      f.producto +
        (f.forma === "contado" ? "  (pagó de una)" : "") +
        (f.forma === "cortesia" ? "  (cortesía)" : ""),
      String(f.cantidad),
      f.forma === "cortesia" ? "—" : pesos(f.precioUnitario),
      f.forma === "cortesia" ? "—" : pesos(f.total),
    ]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 24 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 34 },
    },
    foot: [[`TOTAL · ${informe.facturas} facturas`, "", "", pesos(informe.total)]],
    footStyles: { fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold", fontSize: 11.5, lineWidth: 0.4, lineColor: MARCA, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
    didDrawPage: () => {
      if (primeraHoja) { primeraHoja = false; return; }
      if (alCambiarDeHoja) alCambiarDeHoja();
    },
  });
  return doc.lastAutoTable.finalY;
}

/**
 * El nombre de la empresa en grande, como sale en la pantalla.
 *
 * Cuando el documento lleva las cuatro empresas seguidas, esto es lo que
 * separa una de otra de un vistazo. Va la SEDE en grande (que es lo que
 * conocen los trabajadores) y debajo la razón social, chiquita.
 */
function tituloDeEmpresa(doc, codigo, razonSocial, apunte, y) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...MARCA);
  doc.rect(14, y - 5, 3.5, 13, "F");

  doc.setTextColor(...MARCA_HONDA);
  doc.setFont("helvetica", "bold");
  const nombre = escribirAjustado(doc, codigo, 21, y + 5, ancho - 90, 20, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS);
  const abajo = [razonSocial, apunte].filter(Boolean).join("  ·  ");
  if (abajo) doc.text(abajo, 21, y + 11.5, { maxWidth: ancho - 40 });

  doc.setTextColor(0, 0, 0);
  return y + (abajo ? 18 : 13) + (nombre.renglones.length - 1) * nombre.tam * ALTO_RENGLON;
}

export function pdfComandasDelDia(comandas, fecha, nombreEmpresa, acreedor) {
  const doc = nuevoDocumento();
  const rotulo = () => encabezado(doc, "PEDIDOS DEL DÍA", `${fechaLarga(fecha)} · ${nombreEmpresa}`, acreedor);
  const y = rotulo();

  const fin = tablaDeComandas(doc, comandas, y, rotulo);

  // Si alguien pagó de una, se dice aparte: ese dinero está en la caja, no en
  // la cuenta de la empresa, y quien recibe el papel tiene que saberlo.
  const deContado = comandas.reduce((a, c) => a + c.deContado, 0);
  if (deContado > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    doc.text(
      `De ese total, ${pesos(deContado)} ya se pagó de una y NO va en la cuenta de la empresa.`,
      14, fin + 8
    );
  }

  pieDePagina(doc);
  guardar(doc, `pedidos-${fecha}-${String(nombreEmpresa).replace(/\s+/g, "-")}.pdf`);
}

// ---------------------------------------------------------------------------
//  Cocina
// ---------------------------------------------------------------------------

export function pdfCocina(filas, fecha, codigos, acreedor, notas = []) {
  const doc = nuevoDocumento();
  const y = encabezado(doc, "LO QUE HAY QUE PREPARAR", fechaLarga(fecha), acreedor);
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Plato", ...codigos, "TOTAL"]],
    body: filas.map((f) => [f.producto, ...codigos.map((c) => String(f.porEmpresa[c] || 0)), String(f.total)]),
    columnStyles: Object.fromEntries(
      codigos.map((_, i) => [i + 1, { halign: "right", cellWidth: 22 }]).concat([
        [codigos.length + 1, { halign: "right", cellWidth: 22, fontStyle: "bold" }],
      ])
    ),
    foot: [["TOTAL DE PLATOS", ...codigos.map((c) => String(filas.reduce((a, f) => a + (f.porEmpresa[c] || 0), 0))),
      String(filas.reduce((a, f) => a + f.total, 0))]],
    footStyles: { fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold", fontSize: 11, lineWidth: 0.4, lineColor: MARCA, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
  });
  // Las notas, despues de la tabla. Si no salieran aqui, la cocina nunca se
  // enteraria de que un almuerzo va sin verduras.
  if (notas.length) {
    const desdeY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 40) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(107, 71, 8);
    doc.text(`PLATOS CON NOTA (${notas.length})`, 14, desdeY);

    doc.autoTable({
      ...estiloTabla,
      startY: desdeY + 3,
      head: [["Empresa", "Persona", "Plato", "Cant.", "Nota"]],
      body: notas.map((n) => [n.empresa, n.persona, n.producto, String(n.cantidad), n.nota]),
      headStyles: { ...estiloTabla.headStyles, fillColor: [156, 106, 6] },
      columnStyles: { 3: { halign: "right", cellWidth: 16 } },
    });
  }

  pieDePagina(doc);
  guardar(doc, `cocina-${fecha}.pdf`);
}

// ---------------------------------------------------------------------------
//  Consumo por persona
// ---------------------------------------------------------------------------

/**
 * CONSUMO POR PERSONA.
 *
 * `que` dice qué columnas de plata lleva el papel:
 *
 *      "dia"       solo lo de ese día
 *      "quincena"  solo lo de la quincena que va corriendo
 *      "mes"       solo el mes
 *      "todo"      las tres
 *
 * No es un capricho: cada una responde una pregunta distinta. La del día es
 * para la portería ("¿cuánto llevo hoy?"), la de la quincena es lo que se va a
 * descontar, y la del mes es para cuadrar. Mandar las tres cuando solo hace
 * falta una es darle a alguien tres números para que lea el que no es.
 */
export function pdfPorPersona(filas, anio, mes, nombreEmpresa, acreedor, fechaDia = null, que = "todo", soloValor = false, hastaDia = null) {
  // El papel tiene que decir el MISMO periodo que la pantalla. Si ella mira del
  // 18 al 25 y el PDF rotula la columna "18/08", quien lo recibe suma ocho días
  // creyendo que es uno -- y el número que se ve es correcto, así que nadie se
  // da cuenta.
  const rotuloDia = hastaDia && hastaDia > fechaDia
    ? `${fechaCorta(fechaDia)} – ${fechaCorta(hastaDia)}`
    : fechaCorta(fechaDia);
  const conDia = Boolean(fechaDia) && (que === "todo" || que === "dia");
  const conQuincena = que === "todo" || que === "quincena";
  const conMes = que === "todo" || que === "mes";

  // Acostado solo cuando van las tres CON todo lo demás. Con una sola columna
  // de plata caben de pie sin apretar el nombre, y una hoja de pie se lee
  // mejor en el celular -- que es donde la abre quien la recibe.
  const doc = nuevoDocumento(que === "todo" && !soloValor ? "l" : "p");

  // De las dos quincenas va la que corre el día que se está mirando; la otra
  // ya se cobró. El 14 hay gente en las dos a la vez (MGP cierra el 13), y
  // solo ese día el rótulo lo dice y cada renglón lleva su Q1 o Q2.
  const quincenas = fechaDia ? [...new Set(filas.map((f) => f.quincenaActual))] : [];
  const mezcladas = quincenas.length > 1;
  const rotuloQuincena = !fechaDia ? "Quincena 1"
    : mezcladas ? "Quincena en curso"
    : `Quincena ${quincenas[0]}`;

  const deQue = que === "dia" ? `Solo ${hastaDia && hastaDia > fechaDia ? "del " + rotuloDia : "el " + rotuloDia}`
    : que === "quincena" ? `Solo la ${rotuloQuincena.toLowerCase()}`
    : que === "mes" ? "Solo el mes"
    : null;

  const y = encabezado(
    doc, "CONSUMO POR PERSONA",
    `${nombreMes(mes)} ${anio} · ${nombreEmpresa}` + (deQue ? ` · ${deQue}` : ""),
    acreedor
  );

  const enCursoDe = (f) => (fechaDia ? f.enCurso : f.q1);

  // La plata que va a mostrar esta hoja, para poder preguntar por ella antes
  // de armar las columnas.
  const montos = [];
  if (conDia) montos.push((f) => f.dia || 0);
  if (conQuincena) montos.push(enCursoDe);
  if (conMes) montos.push((f) => f.mes);

  // En la lista corta no sale quien no consumió nada.
  //
  // Es una lista de "quién y cuánto" para pasarle a la fábrica, y un renglón
  // que dice $ 0 no dice nada: solo hace que la gente que SÍ debe se pierda
  // entre los ceros -- de 83 nombres, la mitad no comieron esa quincena.
  // La plata no cambia, porque lo que se quita vale cero, y abajo se dice
  // cuántos se quedaron por fuera para que nadie crea que se perdieron.
  const visibles = soloValor ? filas.filter((f) => montos.some((m) => m(f) > 0)) : filas;
  const escondidas = filas.length - visibles.length;

  // Las columnas se arman en UNA lista y no a punta de "if" sueltos.
  //
  // De cada columna hay que cuadrar cuatro cosas -- el encabezado, el ancho,
  // lo que va en cada renglón y lo que va en el total -- y estando en cuatro
  // sitios distintos, agregar o quitar una desalinea las demás sin que nadie
  // lo note: la hoja sale, pero con la plata debajo del título equivocado.
  // Juntas, o entran las cuatro o no entra ninguna.
  const columnas = [
    { titulo: "Persona", ancho: { cellWidth: "auto" }, de: (f) => f.persona, pie: "TOTAL" },
  ];
  const suma = (dePlata) => pesos(visibles.reduce((a, f) => a + dePlata(f), 0));

  // "Solo nombre y valor" es una lista para pasarle a la fábrica: quién y
  // cuánto, nada más. La empresa y el número de facturas son para cuadrar, y
  // ahí estorban.
  if (!soloValor) {
    columnas.push({ titulo: "Empresa", ancho: { cellWidth: 24 }, de: (f) => f.empresa, pie: "" });
    columnas.push({
      titulo: "Facturas", ancho: { halign: "right", cellWidth: 20 },
      de: (f) => String(f.facturas),
      pie: String(visibles.reduce((a, f) => a + f.facturas, 0)),
    });
  }
  if (conDia) {
    columnas.push({
      titulo: rotuloDia, ancho: { halign: "right", cellWidth: 30 },
      de: (f) => (f.dia ? pesos(f.dia) : "—"),
      pie: suma((f) => f.dia || 0),
    });
  }
  if (conQuincena) {
    columnas.push({
      titulo: rotuloQuincena, ancho: { halign: "right", cellWidth: 34 },
      de: (f) => pesos(enCursoDe(f)) + (mezcladas ? "  Q" + f.quincenaActual : ""),
      pie: suma(enCursoDe),
    });
  }
  if (conMes) {
    columnas.push({
      titulo: "Mes", ancho: { halign: "right", cellWidth: 32 },
      de: (f) => pesos(f.mes),
      pie: suma((f) => f.mes),
    });
  }

  // La última columna de plata va en negrilla: es la que se busca.
  const ultima = columnas.length - 1;
  columnas[ultima].ancho = { ...columnas[ultima].ancho, fontStyle: "bold" };

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [columnas.map((c) => c.titulo)],
    body: visibles.map((f) => columnas.map((c) => c.de(f))),
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, c.ancho])),
    foot: [columnas.map((c) => c.pie)],
    footStyles: { fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold", fontSize: 10, lineWidth: 0.4, lineColor: MARCA, halign: "right" },
    didParseCell: (d) => { if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left"; },
  });

  // Quien no salió, se dice. Si no, quien reciba la lista y no encuentre a
  // alguien no sabe si es que no comió o si la lista está incompleta.
  if (escondidas > 0) {
    const yNota = espacioPara(doc, doc.lastAutoTable.finalY + 8, 6, null);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    doc.text(
      escondidas === 1
        ? "1 persona más no consumió nada en este periodo, así que no sale en la lista."
        : `${escondidas} personas más no consumieron nada en este periodo, así que no salen en la lista.`,
      14, yNota, { maxWidth: doc.internal.pageSize.getWidth() - 28 }
    );
    doc.setTextColor(0, 0, 0);
  }

  pieDePagina(doc);
  const sufijo = (que === "dia" ? (hastaDia && hastaDia > fechaDia ? `-del-${fechaDia}-al-${hastaDia}` : "-dia-" + fechaDia)
    : que === "quincena" ? "-quincena"
    : que === "mes" ? "-mes" : "") + (soloValor ? "-solo-valor" : "");
  guardar(doc, `consumo-por-persona-${anio}-${String(mes).padStart(2, "0")}${sufijo}.pdf`);
}

// ---------------------------------------------------------------------------
//  Cuadre de facturas
// ---------------------------------------------------------------------------

export function pdfCuadre(filas, anio, mes, acreedor) {
  const doc = nuevoDocumento();
  const y = encabezado(doc, "CUADRE DE FACTURAS", `${nombreMes(mes)} ${anio}`, acreedor);
  const conDato = filas.filter((f) => f.declarado !== null);
  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Día", "Dijo el trabajador", "Hay registradas", "Diferencia", "Estado"]],
    body: conDato.map((f) => [
      fechaCorta(f.fecha), String(f.declarado), String(f.registradas),
      f.diferencia > 0 ? "+" + f.diferencia : String(f.diferencia),
      f.estado === "cuadra" ? "Cuadra" : "NO cuadra",
    ]),
    columnStyles: {
      0: { cellWidth: 30 },
      1: { halign: "right", cellWidth: 38 },
      2: { halign: "right", cellWidth: 38 },
      3: { halign: "right", cellWidth: 28 },
      4: { cellWidth: "auto" },
    },
    didParseCell: (d) => {
      if (d.section === "body" && conDato[d.row.index] && conDato[d.row.index].estado === "no-cuadra") {
        d.cell.styles.textColor = ACHIOTE;
        if (d.column.index >= 3) d.cell.styles.fontStyle = "bold";
      }
    },
  });
  pieDePagina(doc);
  guardar(doc, `cuadre-${anio}-${String(mes).padStart(2, "0")}.pdf`);
}

// ---------------------------------------------------------------------------
//  INFORME COMPLETO DE UNA EMPRESA
//
//  Para que los trabajadores puedan ver la información sin meterse a la app.
//  Se pensaron tres formas:
//
//   - Darles usuario en la app: hay que manejar claves y cuidar que uno no vea
//     lo de la otra empresa. Mucho lío para una persona sola.
//   - El archivo de página web que ya existe: se ve muy bien, pero llega por
//     WhatsApp como un adjunto raro y en iPhone muchas veces ni abre.
//   - (Este) Un PDF. WhatsApp lo muestra en pantalla en cualquier teléfono,
//     se puede guardar, imprimir y buscar, y NO se puede editar.
//
//  Lleva adentro únicamente lo de esa empresa. No es que las otras estén
//  escondidas: es que no están.
// ---------------------------------------------------------------------------

/** El valor de un renglón. Igual que en calculos.js: aquí no entra el núcleo. */
function subtotalDe(consumo) {
  return (Number(consumo.cantidad) || 0) * (Number(consumo.precioUnitario) || 0);
}

/** La portada. Es lo único que ve el supervisor antes de decidir si lo abre. */
function portada(doc, informe) {
  const ancho = doc.internal.pageSize.getWidth();
  const { empresa, anio, mes, totales, acreedor } = informe;

  doc.setFillColor(...MARCA);
  doc.rect(0, 0, ancho, 78, "F");

  // El logo va en blanco sobre el rojo. Si no alcanzó a cargar, sale sin él y
  // el documento sirve igual: un informe sin logo se lee, uno que se queda
  // esperando una imagen no existe.
  ponerLogo(doc, ancho - 54, 16, 36, 36);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Almuerzos", 18, 30);
  doc.setFontSize(15);
  doc.text(nombreMes(mes) + " de " + anio, 18, 41);

  // De quien es este documento. Iba en 13, al lado de un "Almuerzos" de 26, y
  // parecia una nota al pie: el mes se leia mas que la empresa. Ahora sale con
  // la letra mas grande que quepa en el hueco que deja el logo.
  doc.setFont("helvetica", "bold");
  // La SEDE en grande. La razón social va debajo, en el renglón chiquito.
  const nombre = escribirAjustado(doc, sedeDeEmpresa(empresa), 18, 58, ancho - 76, 22, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Sede " + empresa.codigo, 18, 58 + (nombre.renglones.length - 1) * nombre.tam * ALTO_RENGLON + 7);

  // Las cuatro cifras grandes, como las tarjetas de la pantalla.
  const cifras = [
    ["Quincena 1", pesos(totales.q1), informe.rangos.q1.desde + " al " + informe.rangos.q1.hasta],
    ["Quincena 2", pesos(totales.q2), informe.rangos.q2.desde + " al " + informe.rangos.q2.hasta],
    ["Facturas del mes", String(totales.facturas), totales.platos + " platos"],
    ["TOTAL DEL MES", pesos(totales.mes), totales.renglones + " renglones"],
  ];
  const margen = 18;
  const anchoCaja = (ancho - margen * 2 - 6 * 3) / 4;
  let x = margen;
  for (const [titulo, valor, pie] of cifras) {
    const esTotal = titulo === "TOTAL DEL MES";
    doc.setFillColor(...(esTotal ? MARCA : BEIGE));
    doc.roundedRect(x, 88, anchoCaja, 31, 2, 2, "F");

    doc.setTextColor(...(esTotal ? [255, 255, 255] : GRIS));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(titulo.toUpperCase(), x + 4, 96, { maxWidth: anchoCaja - 8 });

    doc.setTextColor(...(esTotal ? [255, 255, 255] : TINTA));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(valor.length > 11 ? 10.5 : 12.5);
    doc.text(valor, x + 4, 106, { maxWidth: anchoCaja - 8 });

    doc.setTextColor(...(esTotal ? [255, 232, 230] : GRIS));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(pie, x + 4, 114, { maxWidth: anchoCaja - 8 });
    x += anchoCaja + 6;
  }

  // Qué trae adentro, para que no toque adivinar ni pasar hojas buscando.
  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Qué trae este documento", 18, 136);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 145;
  for (const linea of [
    "1.  Qué se consumió — cada plato, cuántos y a cómo.",
    "2.  Quién consumió — persona por persona, las dos quincenas.",
    "3.  Día por día — el detalle de cada día, con nombre y plato.",
  ]) { doc.text(linea, 22, y); y += 7; }

  doc.setDrawColor(...BEIGE);
  doc.setLineWidth(0.6);
  doc.line(18, y + 5, ancho - 18, y + 5);

  y += 14;
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  if (acreedor.nombre) {
    doc.text("Lo prepara: " + acreedor.nombre, 18, y); y += 5.5;
    if (acreedor.nit) { doc.text("NIT " + acreedor.nit, 18, y); y += 5.5; }
    if (acreedor.ciudad) { doc.text(acreedor.ciudad, 18, y); y += 5.5; }
  }

  y += 4;
  doc.setFontSize(8.5);
  doc.text(
    "Este documento trae únicamente la información de " +
    sedeDeEmpresa(empresa) +
    ". La de las otras empresas no está adentro.",
    18, y, { maxWidth: ancho - 36 }
  );
}

/**
 * El título de cada sección, con la rayita roja como en la app.
 *
 * "derecha" es la cifra que va al otro lado, como en la cintica de la pantalla
 * ("16 comandas ... $ 241.000"): quien recibe el papel busca ese número antes
 * que nada, y tenerlo que sumar de las tarjetas es justo lo que no debe hacer.
 */
function tituloDeSeccion(doc, texto, y, derecha) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...MARCA);
  doc.rect(14, y - 5, 3, 8, "F");

  // La cifra se pinta PRIMERO, para saber cuánto sitio le queda al título.
  // jsPDF no avisa cuando dos textos se pisan: los pinta uno encima del otro.
  let ocupa = 0;
  if (derecha) {
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TINTA);
    doc.text(String(derecha), ancho - 14, y + 1.5, { align: "right" });
    ocupa = doc.getTextWidth(String(derecha)) + 6;
  }

  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(texto, 20, y + 1.5, { maxWidth: ancho - 40 - ocupa });
  doc.setDrawColor(...BEIGE);
  doc.setLineWidth(0.5);
  doc.line(14, y + 6, ancho - 14, y + 6);
  return y + 13;
}

/**
 * Deja el cursor donde de verdad quepa lo que sigue.
 *
 * Un título pegado al borde de abajo, con su contenido en la hoja siguiente,
 * es de lo que más se ve en un PDF armado a pedazos: quien lo recibe pasa la
 * hoja y no sabe qué está mirando. Aquí se pregunta antes de escribirlo.
 */
function espacioPara(doc, y, alto, alCambiarDeHoja) {
  if (y + alto <= doc.internal.pageSize.getHeight() - 18) return y;
  doc.addPage();
  return alCambiarDeHoja ? alCambiarDeHoja() : 34;
}

const pieTotal = {
  fillColor: [255, 255, 255], textColor: MARCA, fontStyle: "bold",
  fontSize: 10.5, lineWidth: 0.4, lineColor: MARCA, halign: "right",
};
const totalALaIzquierda = (d) => {
  if (d.section === "foot" && d.column.index === 0) d.cell.styles.halign = "left";
};

export function pdfInformeCompleto(informe) {
  const doc = nuevoDocumento();
  const { empresa, anio, mes, totales, platos, personas, dias, acreedor } = informe;
  const quien = sedeDeEmpresa(empresa);
  const cuando = nombreMes(mes) + " " + anio + " · " + quien;

  portada(doc, informe);

  // --- 1. Qué se consumió --------------------------------------------------
  doc.addPage();
  let y = encabezado(doc, "QUÉ SE CONSUMIÓ", cuando, acreedor);
  y = tituloDeSeccion(doc, "Cada plato del mes", y);

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Plato", "Cantidad", "Valor unitario", "Total"]],
    body: platos.map((p) => [p.producto, String(p.cantidad), pesos(p.precio), pesos(p.total)]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 24 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 34, fontStyle: "bold" },
    },
    foot: [["TOTAL", String(totales.platos), "", pesos(totales.mes)]],
    footStyles: pieTotal,
    didParseCell: totalALaIzquierda,
  });

  // --- 2. Quién consumió ---------------------------------------------------
  doc.addPage();
  y = encabezado(doc, "QUIÉN CONSUMIÓ", cuando, acreedor);
  y = tituloDeSeccion(doc, personas.length + " personas", y);

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    head: [["Persona", "Facturas", "Quincena 1", "Quincena 2", "Mes"]],
    body: personas.map((p) => [
      p.persona, String(p.facturas), pesos(p.q1), pesos(p.q2), pesos(p.mes),
    ]),
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 22 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32, fontStyle: "bold" },
    },
    foot: [["TOTAL", String(personas.reduce((a, p) => a + p.facturas, 0)),
      pesos(totales.q1), pesos(totales.q2), pesos(totales.mes)]],
    footStyles: pieTotal,
    didParseCell: totalALaIzquierda,
  });

  // --- 3. Día por día ------------------------------------------------------
  //
  //  Aquí hubo que devolverse.
  //
  //  La primera versión hacía una tabla por día y decidía a mano si el día
  //  cabía en lo que quedaba de hoja. Para eso había que ADIVINAR cuánto iba a
  //  medir la tabla (tantos milímetros por renglón), y la adivinada nunca da:
  //  un plato de nombre largo o una nota parten el renglón en dos líneas y ya
  //  midió mal. Resultado medido sobre los datos de verdad: 19 días gastaban
  //  26 hojas, con títulos colgando al pie y días que se partían dejando dos
  //  renglones huérfanos al voltear.
  //
  //  Esta versión no adivina nada. Es UNA sola tabla corrida donde el día es
  //  un renglón más, ancho completo, con fondo beige. autoTable ya sabe medir
  //  sus propios renglones, así que empaqueta perfecto, repite el encabezado
  //  en cada hoja y no deja huecos.
  doc.addPage();
  y = encabezado(doc, "DÍA POR DÍA", cuando, acreedor);

  const cuerpo = [];
  const esDia = [];   // qué renglones del cuerpo son separadores de día
  for (const dia of dias) {
    esDia[cuerpo.length] = true;
    cuerpo.push([{
      content: fechaLarga(dia.fecha) + "   ·   " + dia.facturas + " facturas   ·   " +
               pesos(dia.total),
      colSpan: 4,
    }]);
    for (const c of dia.renglones) {
      // Lo que la persona pago de su bolsillo SI se muestra: el supervisor
      // necesita ver que ese dia comio. Pero en la columna del valor va un
      // guion, porque a la empresa no se le cobra.
      const forma = formaDe(c);
      cuerpo.push([
        c.persona,
        c.producto +
          (forma === "contado" ? "  (lo pagó él)" : "") +
          (forma === "cortesia" ? "  (cortesía)" : "") +
          (c.observacion ? "  — " + c.observacion : ""),
        String(c.cantidad),
        forma === "empresa" ? pesos(subtotalDe(c)) : "—",
      ]);
    }
  }

  // Para poder pintar de gris lo que no se cobra hay que saber, desde el
  // número de renglón de la tabla, cuál consumo era. Se guarda al armar.
  const consumoDe = [];
  let i = 0;
  for (const dia of dias) {
    i++; // el separador del día
    for (const c of dia.renglones) consumoDe[i++] = c;
  }

  doc.autoTable({
    ...estiloTabla,
    startY: y,
    margin: { left: 14, right: 14, top: 34, bottom: 20 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    head: [["Persona", "Plato", "Cant.", "Valor"]],
    body: cuerpo,
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 30 },
    },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      if (esDia[d.row.index]) {
        d.cell.styles.fillColor = BEIGE;
        d.cell.styles.textColor = TINTA;
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 10.5;
        d.cell.styles.cellPadding = 3;
        return;
      }
      const c = consumoDe[d.row.index];
      if (!c) return;
      // Lo que la empresa no paga se ve en gris: está, pero no suma.
      const forma = formaDe(c);
      if (forma !== "empresa") d.cell.styles.textColor = GRIS;
      if (c.observacion && d.column.index === 1) d.cell.styles.fontStyle = "italic";
    },
    // Las hojas de continuación llevan el mismo encabezado rojo, para que
    // ninguna quede como una tabla suelta sin saber de qué documento es.
    didDrawPage: (d) => {
      if (d.pageNumber > 1) encabezado(doc, "DÍA POR DÍA", cuando, acreedor);
    },
  });

  pieDePagina(doc);
  guardar(doc, ("almuerzos-" + empresa.codigo + "-" + anio + "-" +
    String(mes).padStart(2, "0") + ".pdf").replace(/\s+/g, "-").toLowerCase());
}
