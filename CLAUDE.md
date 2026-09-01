# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Qué es esto y para quién

Control de **pedidos y empleados** para el negocio de **Arroz Paisa** (Ibagué,
Colombia), que es de la **mamá de Juan**. El restaurante le vende almuerzos a
los empleados de cuatro empresas (AGRO, BASARILI, MGP, PUNTERAS) y a fin de
quincena le pasa a cada una una cuenta de cobro.

**La usuaria es ella, no un programador.** Trabaja sola, no ve bien de cerca y
usa esto en una cocina a las seis de la mañana. Ese requisito manda sobre todos
los demás: si algo la hace más potente pero más difícil de entender, se
descarta. Antes de proponer cualquier cosa, preguntarse si ella la entendería
sin que nadie se la explique.

Esto reemplaza un Excel que fallaba **en silencio**. Por eso la regla que más
pesa: **nada puede fallar callado, y menos si mueve plata.**

---

## Comandos

```bash
node tests/correr.mjs        # todas las pruebas del núcleo (rápido, es lo primero)
node --check <archivo.js>    # revisar sintaxis de un archivo suelto
py -3 servidor.py            # levanta la app en http://localhost:8000
.\publicar.cmd "que cambio"  # revisa que no se vaya nada privado, guarda y sube
```

**No hay linter ni formateador configurado** en este proyecto (ni ESLint ni
Prettier). La verificación real después de cada cambio es: `node --check` de lo
que se tocó, `node tests/correr.mjs`, y — si se tocó UI o PDF — mirarlo en el
navegador. Si algún día se agrega un linter, actualizar esta sección.

### Correr una sola prueba

`tests/correr.mjs` importa todos los `*.test.mjs`. Para correr uno solo:

```bash
node -e "import('./tests/cobro.test.mjs').then(()=>import('./tests/probar.mjs')).then(m=>m.correrTodo())"
```

Las pruebas de `aceptacion` necesitan los Excel reales en `tests/datos/`, que
está en `.gitignore`. Sin ellos esas fallan; las demás corren igual.

### Probar la UI y los PDF (esto no lo cubren las pruebas del núcleo)

- `tests/ver-pantalla.html?p=<pantalla>` pinta UNA pantalla con datos reales sin
  base de datos. Acepta `&forzar=<caso>` para fabricar situaciones que no están
  en los datos (rangos raros, renglones sin precio, cosas "dejadas así", teclear
  en un buscador). Es el sitio donde se agregan casos nuevos para poder MIRARLOS.
- `tests/probar-pdf.html` arma los PDF de verdad, los revisa y los deja en
  `tests/salida/` (ignorado por git: lleva nombres de personas).
- Chrome sin ventana:
  `chrome --headless=new --virtual-time-budget=25000 --dump-dom <url>` y sacar
  el texto de `<pre id="salida">`. Ojo: `--virtual-time-budget` no espera a
  IndexedDB, así que sirve para pruebas puras, no para la app entera
  (`tests/diagnostico.html` hay que correrla a velocidad normal).
- **Para ver un PDF como imagen** no hay poppler ni ImageMagick, y Chrome no
  rasteriza un PDF con `--screenshot`. Lo que funciona: `npm i pdfjs-dist` en el
  scratchpad, una páginita que dibuje cada hoja en un canvas y la mande por POST
  como PNG, y lanzar Chrome **sin** `--dump-dom` ni `--screenshot` (esos dos
  matan el proceso antes de que termine) esperando a que aparezcan los archivos.
  El servidor tiene que mandar los `.mjs` como `text/javascript` o Chrome
  bloquea el módulo sin decir nada.

---

## Arquitectura

```
js/nucleo/     Las cuentas. PURO: recibe datos y devuelve datos.
js/datos/      Guardar de verdad: IndexedDB + carpeta del PC + .xlsx
js/ui/         Las pantallas (DOM a mano, sin framework)
js/exportar/   PDF (jsPDF), Excel y el reporte que se le manda a cada empresa
```

**La regla que no se rompe: `js/nucleo/` no importa nada de `js/ui/` ni de
`js/datos/`.** Las flechas van en un solo sentido. Por eso el núcleo corre en
Node sin navegador, y por eso toda lógica que mueva plata **va en el núcleo, no
en una pantalla** — si está en el núcleo se puede probar; en una pantalla, no.

Cuando hagas algo nuevo que calcule plata: la cuenta va en `js/nucleo/`, con su
prueba; la pantalla solo la llama y la pinta.

### Cómo fluye

- `js/ui/estado.js` guarda el estado vivo (`estado.datos`, fecha, empresa, mes).
  Después de tocar los datos **hay que llamar `cambio()`**: guarda y repinta. Si
  una pantalla se olvida, el cambio se ve pero no se guarda.
- `js/app.js` tiene el mapa de pantallas y el ruteo por `#hash`.
- `js/ui/componentes.js` trae `el()` (crear DOM), `tabla()`, `ventana()`,
  `pedirDatos()`, `confirmar()`, `mensaje()`. No inventar widgets nuevos si ya
  hay uno.

### Los módulos del núcleo

| Archivo | Qué resuelve |
|---|---|
| `formato.js` | plata, fechas, `normalizar`, `coincide` (buscar sin tildes) |
| `modelo.js` | la forma de los datos, cómo nacen y cómo se corrigen |
| `calculos.js` | quincenas, totales, facturas, cuenta de cobro, informes, avisos |
| `importador.js` | leer el Excel viejo |
| `nombres.js` | nombres repetidos, parecidos y mal escritos |
| `personal.js` | cruzar con las listas de empleados de las empresas |
| `sueltos.js` | renglones que apuntan a alguien o algo que no existe |
| `habitos.js` | lo que cada persona pide siempre |

---

## Las reglas del dominio (romper una de estas es cobrar mal)

- **El nombre NO identifica a la persona.** La llave es `(empresa, nombre)`
  (`clavePersona`). Hay 80 nombres que existen en dos empresas a la vez y son
  personas distintas. Dos nombres solo se unen dentro de la misma empresa.
- **El precio se congela en cada renglón** (`consumo.precioUnitario`). Cambiar
  el catálogo NO puede cambiar una cuenta ya entregada. El precio en blanco no
  es lo mismo que cero: sin precio la app avisa, en cero cobraría $ 0 callada.
- **Una factura = una persona que comió un día**, aunque pida tres cosas
  (`claveFactura`). Es el número que ella cuadra con el trabajador.
- **Tres formas de cobro** (`calculos.js`): a crédito (la paga la empresa), de
  contado (ya la pagó la persona) y cortesía (no la paga nadie). Meter lo de
  contado en la cuenta de cobro es cobrarlo **dos veces**; dejarlo fuera de las
  ventas es descuadrar la caja. Están separadas a propósito: `sumar`,
  `sumarLoDeLaEmpresa`, `sumarLoDeContado`.
- **La quincena la parte `ultimoDiaQ1`, y cada empresa corta distinto** (MGP el
  13, las demás el 14). Los cuatro días del periodo (`primerDiaQ1`,
  `ultimoDiaQ1`, `primerDiaQ2`, `ultimoDiaQ2`) dicen qué se ESCRIBE en el papel;
  el corte sigue siendo `ultimoDiaQ1`, para que ningún renglón se quede sin
  quincena. Una cuenta suelta puede llevar su propio rango
  (`rangoDeCobro`/`ponerRangoDeCobro`) sin tocarle la regla a la empresa.
- **Nada falla en silencio.** Todo renglón que no cuadre sale en pantalla, en
  español y en rojo, diciendo qué le pasa **y cómo se arregla**. Si agregas un
  estado del que no se pueda salir, es un bug (ya pasó con "Déjelo así").
- **Del documento se guardan solo los últimos 5 dígitos.** Nunca salen en las
  cuentas de cobro ni en lo que se le manda a las empresas.

---

## Convenciones

- **Todo en español**: nombres de funciones, variables, comentarios y textos.
  `pintarCobro`, `cuentaDeCobro`, `renglones`, `plata`. No mezclar inglés.
- **Los comentarios explican el PORQUÉ, no el qué.** Este código está lleno de
  comentarios que cuentan qué pasó cuando se hizo de la otra forma. Al cambiar
  algo, si el comentario de al lado queda mintiendo, hay que arreglarlo — un
  comentario falso es peor que ninguno.
- Los textos que ve la usuaria van en su idioma, sin palabras técnicas, y
  diciendo qué hacer ("Póngale precio", no "Error: precio inválido").
- Sin framework y sin paso de compilación: módulos ES nativos que el navegador
  carga directo. `vendor/` trae jsPDF, autoTable y SheetJS ya bajados.

---

## Privacidad

`datos/`, `tests/datos/` y `tests/salida/` están en `.gitignore` y **tienen que
seguir así**: son los nombres de 562 personas, qué comió cada una y cuánto debe
cada empresa. `publicar.cmd` corta la subida si detecta un `.xlsx`, un `.pdf` o
algo de `tests/salida/`. La app publicada abre vacía a propósito.

---

# Normas de Criterio y Comportamiento de Claude

## Criterio Técnico y Proactividad (¡OBLIGATORIO!)

* **Proponer mejoras**: Si mi petición es ineficiente o anticuada, debes
  proponer una alternativa más limpia, moderna o escalable antes de escribir
  código.
* **Cuestionar al usuario**: Si detectas que mi propuesta introduce deuda
  técnica, bugs potenciales o rompe la arquitectura, detente y explícamelo. No
  asientas en silencio.
* **Pensamiento crítico**: Evalúa los impactos secundarios en otros módulos del
  proyecto antes de modificar cualquier archivo.
* **Honestidad ante la duda**: Si una solución no es 100% segura, admite la
  incertidumbre y plantea los pros y contras de las opciones disponibles.

## Flujo de Trabajo Estricto

* **Explicación previa**: Antes de programar, resume en una frase qué vas a
  hacer y por qué elegiste ese camino.
* **Verificación automática**: Es obligatorio ejecutar el linter y los tests del
  proyecto después de cada cambio para asegurar que nada se rompió.
  *(En este proyecto no hay linter: el equivalente es `node --check` de lo que
  se tocó más `node tests/correr.mjs`, y mirar la pantalla o el PDF si se tocó
  eso. Ver la sección Comandos.)*
* **Validación de errores**: Si una ejecución falla, no asumas la solución;
  analiza el log de error real antes de intentar arreglarlo.
## Filosofía de Desarrollo y Sentido Común
* **Visión de Producto**: Diseña pensando en el usuario final. Las pantallas de gestión (tablas, listas) DEBEN incluir por defecto buscadores, paginación y filtros lógicos sin que el usuario los pida.
* **Principio KISS (Mantenerlo Simple)**: Prohibido sobre-ingenierizar. Si un error se puede arreglar con 3 líneas de código limpias, no reescribas un módulo entero ni añadas dependencias.
* **Eliminación de Código Muerto**: Si detectas funciones, variables o archivos que no aportan valor, "no cuadran" o complican el flujo, propón su eliminación inmediata.
* **Freno de Emergencia**: Si arreglar un bug requiere cambiar más de 2 archivos, detente, explica el problema estructural y pide confirmación.
* **Siempre deployar**: despues de cada cambio deployar a github, pero eso si, tener copias de respaldo por si algo se daña
