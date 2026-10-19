# ============================================================================
#  servidor.py  -  Para abrir la app mientras se trabaja en ella.
#
#  ¿Por qué hace falta un servidor y no basta con doble clic en index.html?
#  Porque la app está partida en muchos archivos .js que se llaman entre ellos
#  ("módulos"). Por seguridad, los navegadores NO dejan que un archivo abierto
#  con doble clic (file://) cargue a otro. Con un servidor sí, porque entonces
#  todo llega por http://
#
#  Se usa así, desde la carpeta del proyecto:
#
#      py -3 servidor.py
#
#  y después se abre http://localhost:8000 en Chrome.
#  Para apagarlo: Ctrl + C.
#
#  Esto es SOLO para desarrollar. Tu mamá no va a correr esto nunca: a ella le
#  queda la app publicada en una dirección de internet, o el archivo de un solo
#  pedazo que sí se abre con doble clic.
# ============================================================================

import http.server
import mimetypes
import time
import os
import re
import socketserver
import sys
import webbrowser

PUERTO = 8000

# Un PNG de un pixel transparente: lo que contesta /espera.
PIXEL = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
         b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00"
         b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82")

# Python no conoce estos dos, y sin ellos el navegador rechaza los archivos:
#  - .mjs  son módulos de JavaScript. Si no llegan como JavaScript, Chrome los
#          bloquea con un error de "MIME type" y la app no arranca.
#  - .woff2 son las letras. Sin esto se ven, pero con avisos en la consola.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("font/woff2", ".woff2")


class Manejador(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        """
        /espera?ms=N contesta una imagen de un pixel DESPUÉS de N milisegundos.

        Es para sacarle foto a la app ENTERA con Chrome sin ventana. Chrome
        toma la foto (--screenshot) cuando la página termina de cargar, y
        --virtual-time-budget no espera a IndexedDB, así que la foto salía
        siempre antes de que la app arrancara. Una <img> apuntando aquí
        retrasa el "load" de la página los milisegundos que haga falta, y en
        ese rato la app arranca de verdad y la prueba hace lo suyo.
        Lo usan tests/foto-app.html y tests/probar-app.html.
        """
        if self.path.startswith("/espera"):
            from urllib.parse import urlparse, parse_qs
            ms = int(parse_qs(urlparse(self.path).query).get("ms", ["3000"])[0])
            time.sleep(min(ms, 120000) / 1000.0)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(PIXEL)))
            self.end_headers()
            self.wfile.write(PIXEL)
            return
        return super().do_GET()

    def do_POST(self):
        """
        Un buzón para la página de diagnóstico.

        Sirve para revisar la app sin ventana: se abre Chrome escondido, la
        página se prueba sola y deja aquí el resultado, que queda escrito en
        tests/ultimo-diagnostico.txt. Es una ayuda para desarrollar; la app
        que usa tu mamá no lo toca nunca.
        """
        BUZONES = {
            "/diagnostico": "tests/ultimo-diagnostico.txt",
            "/guardar-inicial": "datos/inicial.json",
            # Lo usa tests/sacar-logo.html, que le quita el fondo al logo.
            # Ahora mismo la app no necesita esa version, pero la herramienta
            # queda por si algun dia hace falta un logo sobre fondo de color.
            "/guardar-logo": "img/logo-blanco.png",
            # Los PDF que arma tests/probar-pdf.html. Se dejan en un archivo
            # porque un PDF hay que MIRARLO: que no reviente no quiere decir
            # que se vea bien, y eso no lo puede contestar ninguna prueba.
            "/guardar-pdf": "tests/salida/informe.pdf",
            "/guardar-resumen": "tests/salida/resumen-dia.pdf",
            "/guardar-raros": "tests/salida/resumen-casos-raros.pdf",
            "/guardar-persona": "tests/salida/consumo-por-persona.pdf",
            "/guardar-cobro": "tests/salida/cuenta-de-cobro.pdf",
            # El veredicto de tests/probar-app.html, que arranca la app entera
            # y hace lo que ella hace cada manana. La pagina ya lo mandaba aqui
            # y no habia buzon: el POST daba 404 y el resultado se perdia.
            "/veredicto": "tests/ultimo-veredicto.txt",
            # Lo que hizo tests/guion.html paso por paso (las manos del agente
            # "trabajador-de-prueba"). Va en tests/salida porque lleva el texto
            # de la pantalla, o sea nombres de personas: no sube a internet.
            "/guion": "tests/salida/ultimo-guion.txt",
        }
        destino = BUZONES.get(self.path)
        # /guion/<nombre>: cada guion deja su propio registro, para que dos
        # trabajadores de prueba corriendo a la vez no se pisen el archivo.
        # El nombre se limpia: nada de barras ni puntos que lo saquen de ahí.
        if destino is None and self.path.startswith("/guion/"):
            nombre = re.sub(r"[^A-Za-z0-9_-]", "", self.path[len("/guion/"):])[:60]
            if nombre:
                destino = f"tests/salida/guiones/{nombre}.registro.txt"
        if destino is None:
            self.send_error(404)
            return

        largo = int(self.headers.get("Content-Length", 0))
        cuerpo = self.rfile.read(largo).decode("utf-8", "replace")

        # Una imagen o un PDF llegan como texto en base64
        # ("data:image/png;base64,..."). Hay que devolverlos a bytes antes de
        # escribirlos, o el archivo queda siendo un texto que ningun navegador
        # puede abrir.
        if cuerpo.startswith("data:") and ";base64," in cuerpo[:64]:
            import base64
            crudo = base64.b64decode(cuerpo.split(",", 1)[1])
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino, "wb") as archivo:
                archivo.write(crudo)
            print(f"  guardado: {destino} ({len(crudo):,} bytes)")
            self.send_response(204)
            self.end_headers()
            return
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as archivo:
            archivo.write(cuerpo)
        print(f"  guardado: {destino} ({len(cuerpo):,} letras)")
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # Mientras se trabaja, que el navegador no se quede con la copia vieja
        # de los archivos. Si no, uno cambia el código y no ve el cambio.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, formato, *args):
        # Solo mostramos los errores. Si no, imprime una línea por cada
        # archivito y no se ve nada útil.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(formato, *args)


class Servidor(socketserver.ThreadingTCPServer):
    """Atiende varias peticiones a la vez.

    Era socketserver.TCPServer a secas, que atiende UNA a la vez. El navegador
    pide los 25 módulos de la app casi al tiempo, así que se le quedaban
    esperando en fila y la app arrancaba a medias o no arrancaba: la pantalla
    salía en blanco sin ningún error, que es la peor forma de fallar.

    daemon_threads deja que Ctrl+C apague de una, sin quedarse esperando a las
    peticiones a medio atender.
    """

    daemon_threads = True
    allow_reuse_address = True


def main():
    try:
        with Servidor(("127.0.0.1", PUERTO), Manejador) as servidor:
            print()
            print("  Arroz Paisa está andando.")
            print()
            print(f"    La app:      http://localhost:{PUERTO}/")
            print(f"    Las pruebas: http://localhost:{PUERTO}/tests/pruebas.html")
            print()
            print("  Para apagarlo: Ctrl + C")
            print()
            webbrowser.open(f"http://localhost:{PUERTO}/")
            servidor.serve_forever()
    except OSError as error:
        print(f"\n  No se pudo prender en el puerto {PUERTO}: {error}")
        print("  Puede que ya esté andando en otra ventana.\n")
        return 1
    except KeyboardInterrupt:
        print("\n  Apagado.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
