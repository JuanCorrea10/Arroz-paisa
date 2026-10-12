// ============================================================================
//  nube-config.js  -  Las señas del proyecto de Firebase
//
//  Con esto en null la app trabaja como siempre: sola en este computador.
//  Con las señas puestas, pide cuenta al entrar y comparte los datos entre
//  los computadores del negocio (ver nube.js).
//
//  Estas señas NO son un secreto: identifican el proyecto, no abren nada. Lo
//  que protege los datos son las reglas del servidor (firebase/firestore.rules)
//  y las cuentas. Por eso pueden ir aquí, en un archivo público.
//
//  Se sacan de la consola de Firebase: Configuración del proyecto > Tus apps >
//  la app web > "Configuración del SDK". Ver firebase/COMO-CREAR-EL-PROYECTO.md.
// ============================================================================

export const CONFIG_NUBE = null;

// Así se ve cuando está puesta:
// export const CONFIG_NUBE = {
//   apiKey: "AIza...",
//   authDomain: "arroz-paisa.firebaseapp.com",
//   projectId: "arroz-paisa",
//   storageBucket: "arroz-paisa.appspot.com",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abcdef",
// };
