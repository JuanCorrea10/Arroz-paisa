// ============================================================================
//  nube-config.js  -  Las señas del proyecto de Firebase, y el interruptor
//
//  Con la nube APAGADA la app trabaja como siempre: sola en este computador,
//  sin pedir cuenta y sin cargar ni un byte de Firebase.
//
//  Está apagada a propósito mientras no estén las dos cuentas (la de ella y la
//  de Lagos) y los datos subidos: prenderla le cambia la app a ella apenas
//  recarga -- le pide correo y clave. Para probar sin tocarle nada a nadie, se
//  abre la app con "?probar-nube" al final de la dirección: así se prende solo
//  en ESA pestaña.
//
//  Estas señas NO son un secreto: identifican el proyecto, no abren nada. Lo
//  que protege los datos son las reglas (firebase/firestore.rules) y las
//  cuentas. Por eso pueden ir aquí, en un archivo público.
// ============================================================================

/** El interruptor. Se pone en true el día que se pasa todo a la nube. */
const ENCENDIDA = false;

const SENAS = {
  apiKey: "AIzaSyBcVLZdOpvCcKtzf1Zc6YCKGcLfy7fc6b0",
  authDomain: "arros-paisa.firebaseapp.com",
  projectId: "arros-paisa",
  storageBucket: "arros-paisa.firebasestorage.app",
  messagingSenderId: "852537927134",
  appId: "1:852537927134:web:da83a3714f52f186d1e94f",
};

function seProbaraEnEstaPestana() {
  try {
    return typeof location !== "undefined" &&
      new URLSearchParams(location.search).has("probar-nube");
  } catch {
    return false;
  }
}

export const CONFIG_NUBE = ENCENDIDA || seProbaraEnEstaPestana() ? SENAS : null;
