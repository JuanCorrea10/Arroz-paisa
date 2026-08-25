# Ejercicio 1 — Un dato puede tener dos formas, y confundirlas es un bug

> Este ejercicio no es inventado. Salió de un error de verdad que cometí hoy
> escribiendo esta app, y que encontraron las pruebas. Lo mejor que te puede
> pasar es entender POR QUÉ pasó, porque este error lo vas a volver a ver toda
> tu vida de programador, disfrazado de mil formas.

---

## Lo que pasó

En la app hay una función que limpia nombres:

```js
limpiarNombre("JUAN.PEREZ")   // -> "JUAN PEREZ"
limpiarNombre("  juan perez") // -> "JUAN PEREZ"
```

Y hay una función que une dos personas repetidas en una sola. Yo la escribí
así (versión resumida):

```js
function unir(datos, nombreBueno, nombresMalos) {
  const bueno = limpiarNombre(nombreBueno);
  const malos = nombresMalos
    .map(limpiarNombre)
    .filter((n) => n !== bueno);   // <-- aquí está el bug

  for (const renglon of datos.renglones) {
    if (malos.includes(limpiarNombre(renglon.persona))) {
      renglon.persona = bueno;
    }
  }
}
```

Se ve razonable. Léela otra vez antes de seguir.

Ahora corramos el caso real. En la lista hay dos fichas:

| Ficha | Nombre guardado |
|-------|-----------------|
| 1     | `JUAN PEREZ`    |
| 2     | `JUAN.PEREZ`    |

Y llamamos `unir(datos, "JUAN PEREZ", ["JUAN.PEREZ"])`.

Sigue el código con el dedo:

1. `bueno = limpiarNombre("JUAN PEREZ")` → `"JUAN PEREZ"`
2. `malos = ["JUAN.PEREZ"].map(limpiarNombre)` → `["JUAN PEREZ"]`
3. `.filter(n => n !== bueno)` → `[]` ← **se vació**

El filtro estaba para evitar que alguien se uniera consigo mismo. Pero como
limpié los dos nombres *antes* de compararlos, quedaron idénticos, y el filtro
creyó que eran el mismo y lo botó. La función terminó sin mover ni un renglón,
sin dar error, sin avisar nada.

**Silenciosamente no hizo nada.** Que es la peor clase de bug que existe.

---

## El concepto: forma guardada vs. forma limpia

Aquí `"JUAN.PEREZ"` tenía **dos formas** y las dos son válidas, pero sirven
para cosas distintas:

| Forma | Cuál es | Para qué sirve |
|-------|---------|----------------|
| **Guardada** | `"JUAN.PEREZ"` | **Encontrar** el dato. Es como está escrito hoy en los renglones. |
| **Limpia** | `"JUAN PEREZ"` | **Guardar** el dato. Es como queremos que quede. |

La regla que se me olvidó:

> **Para BUSCAR se usa la forma guardada. Para GUARDAR se usa la forma limpia.**

Si buscas con la forma limpia, dos cosas distintas te van a parecer la misma.

Este mismo error aparece en todas partes:

- Buscar un correo por `minusculas(correo)` cuando en la base está como lo escribieron.
- Comparar `"5"` con `5` (texto contra número).
- Buscar una fecha por su forma bonita `"25/08/2026"` en vez de `"2026-08-25"`.
- Comparar rutas de archivos con `/` cuando el sistema las guardó con `\`.

Siempre es lo mismo: **dos formas del mismo dato, y alguien usó la que no era.**

---

## Tu turno

Abre `01-dos-formas-del-mismo-dato.js`. Ahí hay una función `unir()` con
exactamente este bug, y unas pruebas que la vigilan.

Para verlas correr, con el servidor prendido (`py -3 servidor.py`), abre:

    http://localhost:8000/ejercicios/

Vas a ver **3 pruebas en rojo**. Tu trabajo es ponerlas verdes.

### Pistas, de menos a más

<details>
<summary>Pista 1 — dónde mirar</summary>

El problema no está en el `for`. Está en las tres líneas de arriba, donde se
arman `bueno` y `malos`.

</details>

<details>
<summary>Pista 2 — qué preguntarte</summary>

Cuando la función busca un renglón, ¿con qué lo tiene que comparar: con el
nombre limpio o con el nombre tal como está escrito en el renglón?

</details>

<details>
<summary>Pista 3 — casi la respuesta</summary>

Vas a necesitar **dos** variables para el nombre bueno, no una:
una para buscar (la forma guardada) y otra para escribir (la forma limpia).

</details>

---

## Cuando lo tengas

Compara tu solución con la de verdad, que está en
[`js/nucleo/nombres.js`](../js/nucleo/nombres.js), en la función `simularUnion`.
Busca el comentario que dice *"Hay que distinguir DOS formas del mismo nombre"*.

Y fíjate en algo: yo no encontré ese bug leyendo el código. Lo encontraron
**las pruebas**. Escribí una prueba que decía "unir tiene que mover 1 renglón",
la corrí, y dijo que había movido 0.

Por eso se escriben pruebas. No es para demostrar que el código sirve: es para
que el computador te avise cuando te equivocaste, porque leyendo uno no se da
cuenta. Yo llevo el código entero en la cabeza y aun así lo escribí mal.
