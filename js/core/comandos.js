// Junta todos los comandos en un solo registro. Importar este archivo basta
// para que la sesión sepa ejecutar cualquier comando.

import { REGISTRO, registrarComando } from './session.js';
import { COMANDOS_DATOS } from './cmd_data.js';
import './cmd_stats.js';
import './cmd_est.js';

// cmd_data.js lleva su propio registro interno; se vuelca aquí.
for (const [nombre, fn] of Object.entries(COMANDOS_DATOS)) {
  registrarComando(nombre, fn);
}

// alias que Stata acepta y que apuntan al mismo comando
const ALIAS = {
  browse: 'browse', edit: 'browse',
};
for (const [a, b] of Object.entries(ALIAS)) {
  if (!REGISTRO[a] && REGISTRO[b]) registrarComando(a, REGISTRO[b]);
}

export { REGISTRO };
export { ejecutarLinea, ejecutarDoFile, Sesion } from './session.js';
