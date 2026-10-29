# Cómo pasar la app a Cloudflare (lo hace Juan, una sola vez)

Hoy la app vive en `juancorrea10.github.io/Arroz-paisa`. Con Cloudflare Pages
queda en una dirección más corta, por ejemplo `arroz-paisa.pages.dev`, gratis.
Si además se compra un dominio propio (por ejemplo `arroz-paisa.com`, que el
29 de octubre de 2026 estaba libre), queda en esa dirección.

Nada cambia en cómo se trabaja: `publicar.cmd` sigue subiendo a GitHub, y
Cloudflare toma de ahí cada cambio solo, en un minuto.

## 1. La cuenta y el proyecto (gratis)

1. Entrar a https://dash.cloudflare.com y crear una cuenta (o entrar).
2. En el menú: **Workers & Pages** → **Create** (Crear).
3. Escoger la pestaña **Pages** → **Connect to Git** (Conectar con Git).
   Si solo ofrece "Workers", buscar el enlace "Pages" en esa misma página.
4. Conectar la cuenta de GitHub (`JuanCorrea10`) y escoger el repositorio
   **Arroz-paisa**.
5. La configuración, así:
   - **Project name** (nombre del proyecto): `arroz-paisa`. Ese nombre es la
     dirección: `arroz-paisa.pages.dev`. Si está ocupado, Cloudflare propone
     otro.
   - **Production branch** (rama): `main`.
   - **Framework preset**: `None` (ninguno).
   - **Build command** (comando de construcción): vacío. La app no se
     construye: los archivos se sirven tal cual.
   - **Build output directory** (carpeta de salida): `/`.
6. **Save and Deploy** (Guardar y publicar). En un minuto abre la dirección.

La primera vez la app abre **vacía**. Es normal: ver el paso 4.

## 2. Avisarle a Firebase de la dirección nueva

Si no, la cuenta de la nube no deja entrar desde ahí.

Firebase → **Authentication** → **Settings** (Configuración) → **Authorized
domains** (Dominios autorizados) → **Add domain** (Agregar dominio):
`arroz-paisa.pages.dev` (y el dominio propio, si se compra).

## 3. El dominio propio (opcional, cuesta)

Un `.com` cuesta unos 10 dólares al año en Cloudflare (lo cobran a precio de
costo). Hace falta una tarjeta: es decisión de su mamá.

1. Cloudflare → **Domain Registration** (Registro de dominios) → **Register
   Domains** → buscar `arroz-paisa.com` → comprarlo.
2. En el proyecto de Pages → **Custom domains** (Dominios propios) → **Set up
   a custom domain** → escribir `arroz-paisa.com` → seguir los pasos. Como el
   dominio está en la misma cuenta, Cloudflare hace solo lo de los DNS.
3. Agregarlo también en Firebase (paso 2).

## 4. Pasar los datos de su mamá (lo importante)

El navegador guarda los datos **por dirección**: en la dirección nueva la app
arranca vacía aunque nada se haya perdido. Los datos siguen en la dirección
vieja y en la carpeta del computador. Hay dos caminos; cualquiera sirve.

**Camino A, con la carpeta (el más fácil):** en la dirección nueva, entrar a
**Inicio → Datos y respaldos → Elegir la carpeta** y escoger la MISMA carpeta
de siempre. La app ve que ahí hay datos y pregunta: tocar **Traer los de la
carpeta**.

**Camino B, con un respaldo:**
1. En la dirección VIEJA: **Datos y respaldos → Bajar un respaldo ahora**.
2. En la dirección NUEVA: **Datos y respaldos → Devolver un respaldo** →
   escoger ese archivo.

Después, revisar que en **Datos y respaldos** los "Renglones guardados" sean
los mismos que en la dirección vieja. La clave de administrador y los platos
de hoy viajan con los datos.

**Desde ese día se usa SOLO la dirección nueva.** Guardarla en favoritos en
cada computador. Si alguien sigue anotando en la vieja, quedan dos juegos de
datos distintos. (Con la nube prendida esto deja de importar: los datos viven
allá y no en el navegador.)

## 5. Cuando ya esté andando

Avisarle a Claude la dirección final, para:
- que `publicar.cmd` diga la dirección nueva al terminar;
- poner en la dirección vieja un aviso de "la app se mudó", con el botón para
  ir a la nueva (sin redirigir sola, para que nadie llegue a una app vacía sin
  entender por qué).
