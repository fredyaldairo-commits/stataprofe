// Sesión: guarda el estado (datos, último modelo, registro) y arma la salida
// que después dibuja la interfaz. También construye la matriz del modelo
// interpretando i.variable, c.variable e interacciones con #.

import { Dataset, ErrorStata } from './dataset.js';
import { mascara } from './expr.js';
import { mulberry32, esNulo } from './util.js';
import { parsear } from './parser.js';
import { resolverIn } from './parser.js';

export class Sesion {
  constructor() {
    this.ds = new Dataset();
    this.salida = [];          // bloques de la corrida actual
    this.registro = [];        // todo lo que ha pasado en la sesión
    this.ultimoModelo = null;
    this.modelosGuardados = {};
    this.pila = [];
    this.semilla = 12345;
    this.rng = mulberry32(this.semilla);
    this.archivosSubidos = {};
    this.r = {};               // resultados guardados (r())
    this.e = {};               // resultados de estimación (e())
    this.ganchos = {};         // callbacks que pone la interfaz
    this.silencioso = false;
  }

  // ---------------------------------------------------------------- salida
  emitir(bloque) {
    if (this.silencioso && bloque.t !== 'err') return;
    this.salida.push(bloque);
  }
  txt(s) { this.emitir({ t: 'txt', s: String(s) }); }
  ok(s) { this.emitir({ t: 'ok', s }); }
  aviso(s) { this.emitir({ t: 'aviso', s }); }
  error(e) {
    this.salida.push({
      t: 'err',
      codigo: e.codigo || 198,
      mensaje: e.message,
      sugerencia: e.sugerencia || null,
    });
  }
  svg(svg, titulo) { this.emitir({ t: 'svg', svg, titulo: titulo || '' }); }
  /** Bloque de HTML propio (tablas visuales, esquemas). */
  html(h, titulo) { this.emitir({ t: 'html', html: h, titulo: titulo || '' }); }
  profe(bloque) { this.emitir({ t: 'profe', bloque }); }
  profeTexto(titulo, items) { this.profe({ titulo, items }); }
  /** Tabla de coeficientes que la interfaz vuelve clickeable. */
  coef(fit, opciones) { this.emitir({ t: 'coef', fit, opciones: opciones || {} }); }

  guardarR(obj) { Object.assign(this.r, obj); }
  guardarE(obj) { Object.assign(this.e, obj); }

  ctxExpr() { return { rng: this.rng, rc: this.rc || 0 }; }
  reiniciarRng() { this.rng = mulberry32(this.semilla); }

  trasCargar() {
    this.ultimoModelo = null;
    if (this.ganchos.alCargar) this.ganchos.alCargar();
  }
  abrirTabla(vars) { if (this.ganchos.abrirTabla) this.ganchos.abrirTabla(vars); }
  abrirEditor() { if (this.ganchos.abrirEditor) this.ganchos.abrirEditor(); }
  guardarLocal(nombre) { if (this.ganchos.guardarLocal) this.ganchos.guardarLocal(nombre); }
  exportarCSV() { if (this.ganchos.exportarCSV) this.ganchos.exportarCSV(); }

  // ---------------------------------------------------------------- muestra activa
  /** Índices de las observaciones que cumplen if / in. */
  muestra(p) {
    const ds = this.ds;
    let m = p.ifExp ? mascara(p.ifExp, ds, this.ctxExpr()) : new Array(ds.n).fill(true);
    if (p.inRango) {
      const [a, b] = resolverIn(p.inRango, ds.n);
      m = m.map((v, i) => v && i >= a && i <= b);
    }
    const idx = [];
    for (let i = 0; i < ds.n; i++) if (m[i]) idx.push(i);
    return idx;
  }

  /**
   * Construye la matriz del modelo a partir de una lista de términos de Stata.
   * Entiende:  educ | i.tamano | c.educ | i.tamano#c.educ | i.a#i.b | ib2.tamano
   * Devuelve { X, nombres, idxFactor, filas, avisos, terminos }
   */
  matrizModelo(terminos, idxBase, { constante = true } = {}) {
    const ds = this.ds;
    const avisos = [];
    const piezas = [];      // {tipo:'cont'|'dummies', nombre, cols:[{nombre, valores}]}

    const columnaDe = (spec) => {
      // spec: "i.tamano" | "c.educ" | "educ" | "ib3.tamano"
      let m = spec.match(/^(i|c)b?(\d+)?\.(.+)$/i);
      let tipo = null, base = null, nombre = spec;
      if (m) { tipo = m[1].toLowerCase(); base = m[2] ? Number(m[2]) : null; nombre = m[3]; }
      else {
        const mb = spec.match(/^ib(\d+)\.(.+)$/i);
        if (mb) { tipo = 'i'; base = Number(mb[1]); nombre = mb[2]; }
      }
      if (!ds.existe(nombre)) throw ds.errorVariable(nombre);
      if (ds.esString(nombre)) {
        throw new ErrorStata(`${nombre} es de texto y no entra en un modelo`, 109,
          `Conviértela primero:<br>· si son categorías: <code>encode ${nombre}, gen(${nombre}_n)</code><br>· si son números escritos como texto: <code>destring ${nombre}, replace</code>`);
      }
      const col = ds.col(nombre);
      if (tipo === 'i') {
        const niveles = [...new Set(idxBase.map((i) => col[i]).filter((v) => !esNulo(v)))].sort((a, b) => a - b);
        if (niveles.length > 40) {
          throw new ErrorStata(`${nombre} tiene ${niveles.length} categorías distintas`, 198,
            `Con tantas categorías el modelo se vuelve imposible de leer. ¿Seguro que <code>${nombre}</code> es un grupo y no una cantidad? Si es cantidad, escríbela sin la <code>i.</code>`);
        }
        const nBase = base !== null && niveles.includes(base) ? base : niveles[0];
        const cols = niveles.filter((v) => v !== nBase).map((v) => ({
          nombre: `${v}.${nombre}`,
          valores: col.map((x) => (esNulo(x) ? null : (x === v ? 1 : 0))),
          esFactor: true,
        }));
        return { tipo: 'dummies', nombre, base: nBase, niveles, cols };
      }
      if (tipo === null && ds.pareceCategorica(nombre) && !ds.esBinaria(nombre)) {
        avisos.push({
          tono: 'ojo',
          texto: `<code>${nombre}</code> tiene ${ds.niveles(nombre).length} valores distintos y parece un grupo, no una cantidad. La estás metiendo como número: el modelo va a suponer que pasar de una categoría a la siguiente vale siempre lo mismo. Si son grupos, escríbela <code>i.${nombre}</code>.`,
        });
      }
      return { tipo: 'cont', nombre, cols: [{ nombre, valores: col.slice(), esFactor: false }] };
    };

    // a##b es atajo de "a b a#b" (factorial completo). Se expande antes de nada.
    const expandidos = [];
    for (const t of terminos) {
      if (t.includes('##')) {
        const partes = t.split('##').map((s) => s.trim()).filter(Boolean);
        // todos los subconjuntos no vacíos, en orden de tamaño
        const combos = [];
        for (let mask = 1; mask < (1 << partes.length); mask++) {
          const grupo = partes.filter((_, k) => mask & (1 << k));
          combos.push({ n: grupo.length, txt: grupo.join('#') });
        }
        combos.sort((a, b) => a.n - b.n);
        for (const c of combos) if (!expandidos.includes(c.txt)) expandidos.push(c.txt);
      } else expandidos.push(t);
    }
    terminos = expandidos;

    for (const t of terminos) {
      if (t.includes('#')) {
        const partes = t.split('#').map((s) => s.trim());
        const bloques = partes.map(columnaDe);
        const combinadas = [];
        const recorrer = (k, nombreAcum, valAcum, esF) => {
          if (k === bloques.length) {
            combinadas.push({ nombre: nombreAcum, valores: valAcum, esFactor: esF });
            return;
          }
          for (const c of bloques[k].cols) {
            const nuevo = nombreAcum ? `${nombreAcum}#${c.nombre}` : c.nombre;
            const val = valAcum
              ? valAcum.map((v, i) => (esNulo(v) || esNulo(c.valores[i]) ? null : v * c.valores[i]))
              : c.valores.slice();
            recorrer(k + 1, nuevo, val, esF && c.esFactor);
          }
        };
        recorrer(0, '', null, true);
        piezas.push({ tipo: 'interaccion', nombre: t, cols: combinadas });
      } else {
        piezas.push(columnaDe(t));
      }
    }

    const cols = piezas.flatMap((p) => p.cols);
    // filas utilizables: sin faltantes en ninguna columna
    const filas = idxBase.filter((i) => cols.every((c) => !esNulo(c.valores[i])));
    const X = filas.map((i) => {
      const f = cols.map((c) => c.valores[i]);
      if (constante) f.push(1);
      return f;
    });
    const nombres = cols.map((c) => c.nombre);
    if (constante) nombres.push('_cons');
    const idxFactor = [];
    cols.forEach((c, j) => { if (c.esFactor) idxFactor.push(j); });

    return { X, nombres, idxFactor, filas, avisos, piezas };
  }

  /** Vector de la dependiente en las filas dadas. */
  vectorY(nombre, filas) {
    const c = this.ds.col(nombre);
    return filas.map((i) => c[i]);
  }
}

/** Registro global de comandos: cada archivo cmd_*.js se registra aquí. */
export const REGISTRO = {};
export function registrarComando(nombre, fn) { REGISTRO[nombre] = fn; }

/** Ejecuta una línea completa. Devuelve los bloques de salida. */
export function ejecutarLinea(linea, ses) {
  ses.salida = [];
  let p;
  try {
    p = parsear(linea, ses.ds.cargado ? ses.ds : null);
  } catch (e) {
    if (e.esStata) { ses.error(e); return ses.salida; }
    throw e;
  }
  if (!p) return ses.salida;

  const fn = REGISTRO[p.cmd];
  if (!fn) {
    ses.error(new ErrorStata(`el comando ${p.cmd} todavía no está en el simulador`, 199,
      'Este simulador cubre los comandos del curso de econometría. Escribe <code>ayuda</code> para ver la lista completa.'));
    return ses.salida;
  }

  const silencioAntes = ses.silencioso;
  if (p.prefijos.quietly) ses.silencioso = true;
  try {
    fn(p, ses);
    ses.rc = 0;
    for (const a of p.avisos || []) ses.aviso(a.texto);
  } catch (e) {
    ses.rc = e.codigo || 1;
    if (p.prefijos.capture) {
      ses.silencioso = silencioAntes;
      return ses.salida;
    }
    if (e.esStata) ses.error(e);
    else ses.error(new ErrorStata(e.message || 'error inesperado', 1,
      'Si esto se repite, cambia un poco el comando o avísale a tu profe.'));
  }
  ses.silencioso = silencioAntes;
  return ses.salida;
}

/** Ejecuta varias líneas (un do-file). */
export function ejecutarDoFile(texto, ses) {
  const lineas = texto.split(/\r?\n/);
  const resultado = [];
  // une las líneas partidas con ///
  const juntas = [];
  let acumulado = '';
  for (const l of lineas) {
    const m = l.match(/^(.*?)\s*\/\/\/\s*$/);
    if (m) { acumulado += m[1] + ' '; continue; }
    juntas.push(acumulado + l);
    acumulado = '';
  }
  if (acumulado) juntas.push(acumulado);

  for (let i = 0; i < juntas.length; i++) {
    const linea = juntas[i];
    if (!linea.trim()) continue;
    const bloques = ejecutarLinea(linea, ses);
    resultado.push({ linea: linea.trim(), numero: i + 1, bloques });
    ses.registro.push({ linea: linea.trim(), bloques });
    const hayError = bloques.some((b) => b.t === 'err');
    if (hayError) {
      resultado.push({ detenido: true, numero: i + 1 });
      break;
    }
  }
  return resultado;
}
