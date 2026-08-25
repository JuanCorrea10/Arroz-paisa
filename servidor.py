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
import socketserver
import sys
import webbrowser

PUERTO = 8000

# Python no conoce estos dos, y sin ellos el navegador rechaza los archivos:
#  - .mjs  son módulos de JavaScript. Si no llegan como JavaScript, Chrome los
#          bloquea con un error de "MIME type" y la app no arranca.
#  - .woff2 son las letras. Sin esto se ven, pero con avisos en la consola.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("font/woff2", ".woff2")


class Manejador(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        """
        Un buzón para la página de diagnóstico.

        Sirve para revisar la app sin ventana: se abre Chrome escondido, la
        página se prueba sola y deja aquí el resultado, que queda escrito en
        tests/ultimo-diagnostico.txt. Es una ayuda para desarrollar; la app
        que usa tu mamá no lo toca nunca.
        """
        if self.path != "/diagnostico":
            self.send_error(404)
            return
        largo = int(self.headers.get("Content-Length", 0))
        cuerpo = self.rfile.read(largo).decode("utf-8", "replace")
        with open("tests/ultimo-diagnostico.txt", "w", encoding="utf-8") as archivo:
            archivo.write(cuerpo)
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


def main():
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("127.0.0.1", PUERTO), Manejador) as servidor:
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
