# Arroz Paisa

Control de almuerzos y cuentas de cobro para un restaurante de Ibagué, Colombia,
que le vende almuerzos a los empleados de cuatro empresas.

Reemplaza un Excel que se dañaba solo y en silencio. La usuaria es una señora
sin conocimientos técnicos, trabajando sola. **Ese requisito manda sobre todos
los demás:** si algo la hace más potente pero más difícil de entender, se
descarta.

---

## Cómo se abre

La app usa módulos de JavaScript, y por seguridad los navegadores no los cargan
cuando el archivo se abre con doble clic. Hace falta un servidor:

```
py -3 servidor.py
```

y queda en <http://localhost:8000>.

| Dirección | Qué es |
|-----------|--------|
| `/` | La app |
| `/tests/pruebas.html` | Las 170 pruebas |
| `/tests/generar-inicial.html` | Genera los datos con los que arranca la app |
| `/tests/revisar-diseno.html` | Mide el layout en computador y celular: cajas corridas y botones muy chicos |
| `/tests/diagnostico.html` | Abre la app con datos reales y recorre las 15 pantallas |
| `/ejercicios/` | Ejercicios de programación |
| `/docs/manual.html` | El manual para la usuaria |

### Que arranque con datos y no vacía

La app busca `datos/inicial.json` la primera vez que se abre. Si está, arranca
cargada; si no, abre vacía y manda a importar el Excel a mano.

Ese archivo se genera abriendo `/tests/generar-inicial.html`, que lee el Excel
de `tests/datos/` **con el mismo importador de la app** y se lo pasa al
servidor para que lo escriba. Se usa el importador de la app a propósito: si
hubiera dos maneras de leer el Excel, tarde o temprano darían resultados
distintos y nadie sabría cuál creer.

`datos/` está en el `.gitignore`. La versión publicada abre vacía, que es lo
correcto: son los nombres de 562 personas.

---

## Cómo se prueba

En el computador donde se hizo esto **no hay Node instalado**, así que las
pruebas corren en el navegador, abriendo `/tests/pruebas.html`. Son las mismas
pruebas: el día que haya Node también sirven con `npm run probar`.

### Ojo: la prueba de aceptación necesita un archivo que NO está aquí

`tests/datos/` está en el `.gitignore` a propósito. Ahí va el Excel real, con
los nombres de las personas, qué comió cada una y cuánto debe cada empresa.
**Eso no se publica.** El código es nuestro; los datos son de ellos.

Para que corran todas las pruebas hay que poner a mano, en `tests/datos/`:

- `ARROZ_PAISA_CONTROL.xlsx`
- `PEDIDOS_AUTOMATIZADOS.xlsx`

Sin esos archivos, las pruebas de `nombres` y `personal` corren igual (son
puras); las de `aceptacion` fallan diciendo que no encontró el archivo.

---

## Cómo está armado

```
js/nucleo/     Las cuentas. Archivos PUROS: reciben datos y devuelven datos.
               No tocan la pantalla ni guardan nada, por eso se pueden probar.
  formato.js     plata, fechas, limpiar texto
  modelo.js      la forma de los datos y cómo se crean
  calculos.js    quincenas, totales, facturas, cuadre, avisos
  importador.js  leer el Excel viejo
  nombres.js     nombres repetidos, parecidos y mal escritos
  personal.js    cruzar con las listas de empleados de las empresas
  sueltos.js     renglones que apuntan a alguien o algo que no existe
  habitos.js     lo que cada persona pide siempre, para no volver a escribirlo

js/datos/      Guardar y leer de verdad (IndexedDB, carpeta del PC, .xlsx)
js/ui/         Las pantallas
js/exportar/   PDF, Excel y el archivo que se le manda a cada empresa
```

La regla: **`js/nucleo/` no importa nada de `js/ui/` ni de `js/datos/`.**
Las flechas van en un solo sentido. Por eso el núcleo se puede probar sin
navegador.

---

## Las decisiones que valen la pena

**El nombre no identifica a la persona.** En el Excel de agosto hay 476 nombres
distintos repartidos en 562 fichas: 80 nombres existen en dos empresas a la vez. La llave real es
`(empresa donde come, nombre)`. Dos nombres solo se unen si están en la misma
empresa; entre empresas, jamás.

**El precio se congela en cada renglón.** Si mañana sube el almuerzo, lo ya
cobrado no cambia. En el Excel, tocar el catálogo alteraba cuentas de cobro ya
entregadas.

**Una factura = una persona que comió un día**, aunque haya pedido tres cosas.
Es el número que la señora cuadra contra lo que le dice el trabajador.

**Nada falla en silencio.** Todo renglón que no cuadre se ve en pantalla, en
español y en rojo, diciendo qué le pasa y cómo se arregla. El Excel fallaba
callado y por eso nadie se daba cuenta hasta fin de mes.

**Del documento se guardan solo los últimos 5 dígitos.** Alcanzan para
distinguir a dos personas del mismo nombre, que es para lo único que se
necesitan. No salen en las cuentas de cobro ni en lo que se manda a las
empresas.

---

## Publicar los cambios

Los cambios **no se suben solos**. Cada vez que se arregle algo:

```powershell
.\publicar.cmd "lo que cambio"
```

El `.\` del principio **no sobra**: PowerShell no busca programas en la carpeta
donde uno esta parado, a proposito, para que nadie corra por accidente algo que
le dejaron ahi. Sin el `.\` dice "no se reconoce como nombre de un cmdlet".

Se usa el `.cmd` y no el `.ps1` porque Windows no deja correr scripts de
PowerShell por defecto. El `.cmd` le dice "corre SOLO este, y solo esta vez",
que es lo mismo sin bajarle la guardia al computador entero.

Eso revisa que no se vaya ningun dato de las personas, guarda el cambio y lo
sube. Al minuto se ve en <https://juancorrea10.github.io/Arroz-paisa/>.

La revision de datos la hace el script y no uno a mano, porque es la clase de
cosa que se olvida justo el dia que importa.

## Publicar en GitHub Pages

La app queda en una dirección pública, pero **no publica ningún dato**: los
datos viven en el navegador de cada quien y en la carpeta del computador, nunca
en el repositorio. Quien abra el enlace sin ser ella ve una app vacía.

Antes de publicar, revisar siempre qué se está subiendo:

```
git status --ignored
```

`tests/datos/` y cualquier lista de personal tienen que aparecer como ignorados.
