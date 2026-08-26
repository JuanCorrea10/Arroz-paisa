// Corre todas las pruebas en Node.  Uso:  npm run probar
// (Si no hay Node instalado, se abre tests/pruebas.html en el navegador.)
import "./calculos.test.mjs";
import "./nombres.test.mjs";
import "./personal.test.mjs";
import "./sueltos.test.mjs";
import "./habitos.test.mjs";
import "./cantidad.test.mjs";
import "./cobro.test.mjs";
import "./informe.test.mjs";
import "./aceptacion.test.mjs";
import { correrTodo } from "./probar.mjs";
await correrTodo();
