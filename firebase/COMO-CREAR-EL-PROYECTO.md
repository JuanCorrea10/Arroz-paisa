# Cómo crear el proyecto en Firebase (lo hace Juan, una sola vez)

Toma unos 15 minutos. Hace falta una cuenta de Google. Todo lo de abajo es
gratis en el plan "Spark": no hay que meter tarjeta.

## 1. El proyecto

1. Entrar a https://console.firebase.google.com y **Crear un proyecto**.
2. Nombre: `arroz-paisa`. Google Analytics: **desactivar** (no hace falta).
3. Esperar a que lo cree y entrar.

## 2. La base de datos (Firestore)

1. En el menú de la izquierda: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `southamerica-east1` (São Paulo) o `us-east1`. No se puede cambiar después.
3. Modo: **producción** (empieza cerrada; las reglas de abajo la abren a quien debe).
4. Cuando abra, pestaña **Reglas**: borrar lo que hay, pegar el contenido de
   `firebase/firestore.rules` de este repositorio, y **Publicar**.

## 3. Las cuentas (Authentication)

1. **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method → Correo electrónico/contraseña → Habilitar** (solo
   la primera opción; el "vínculo por correo" no). Guardar.
3. Pestaña **Users → Agregar usuario**, una por computador:
   - la administradora: por ejemplo `mama@arrozpaisa.co` y una clave de 8 o más.
   - el personal: por ejemplo `lagos@arrozpaisa.co`.
   El correo no tiene que existir de verdad; es solo el nombre de la cuenta.
   Apuntar el **UID** que aparece en la lista (una tira de letras y números).

## 4. Decir quién es quién (el rol)

En **Firestore Database → Datos → Iniciar colección**:

- ID de la colección: `usuarios`
- ID del documento: el **UID** de la administradora (copiado del paso 3).
- Dos campos, cada uno con **Agregar campo** (escribir solo lo que va en la
  columna Valor, sin comillas ni comas):

  | Campo    | Tipo   | Valor                      |
  |----------|--------|----------------------------|
  | `rol`    | string | `administrador`            |
  | `nombre` | string | el nombre de ella          |

- Guardar. Después **Agregar documento** con el UID del personal, igual pero
  con `rol` = `personal` y `nombre` = `Lagos` (o como se llame el puesto).
- El valor de `rol` tiene que ser exactamente `administrador` o `personal`,
  en minúscula: cualquier otra cosa cuenta como personal.

Sin este documento la cuenta puede entrar pero no ve nada: así nadie queda
de administrador por accidente.

## 5. Las señas para la app

1. Rueda dentada arriba a la izquierda → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, el icono `</>` (Web). Apodo: `app`. Sin Hosting.
3. Sale un bloque `const firebaseConfig = { apiKey: "...", ... }`. Copiar ese
   objeto en `js/datos/nube-config.js` reemplazando el `null`:

   ```js
   export const CONFIG_NUBE = {
     apiKey: "...",
     authDomain: "arroz-paisa-xxxx.firebaseapp.com",
     projectId: "arroz-paisa-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

   Estas señas no son un secreto (identifican el proyecto, no abren nada);
   lo que protege los datos son las reglas y las cuentas.

4. En **Authentication → Settings → Dominios autorizados** tiene que estar
   `juancorrea10.github.io` (y `localhost` ya viene). Si no está, agregarlo.

## 6. Pasar los datos de su mamá

Con las señas puestas y publicadas, en el computador de ella:

1. Abrir la app y entrar con la cuenta de administradora.
2. La app ve que la nube está vacía y en **Datos y respaldos** ofrece
   **Subir los datos de este computador**. Tocar ese botón una sola vez.
3. En el otro computador, entrar con la cuenta de personal: los datos ya
   están.

## Si algo se daña

- Una cuenta que "no ve nada": le falta el documento en `usuarios` (paso 4).
- "No hay internet y este computador todavía no tiene copia": la primera vez
  en cada computador hace falta conexión; después no.
- Para quitarle el acceso a alguien: Authentication → Users → los tres
  puntos → Inhabilitar cuenta.
