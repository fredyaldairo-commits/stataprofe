// Contenedor de datos en memoria, equivalente a lo que Stata tiene "cargado".
// Orientado a columnas: this.cols[nombre] = array con un valor por observación.

import { esNulo, masParecido, parecidos } from './util.js';

export class ErrorStata extends Error {
  constructor(mensaje, codigo = 198, sugerencia = null) {
    super(mensaje);
    this.codigo = codigo;
    this.sugerencia = sugerencia;
    this.esStata = true;
  }
}

export class Dataset {
  constructor() {
    this.nombre = null;
    this.vars = [];            // [{name, type:'numeric'|'string', label, vallab, format}]
    this.cols = {};            // {name: []}
    this.valueLabels = {};     // {nombreEtiqueta: {codigo: texto}}
    this.n = 0;
    this.modificado = false;
    this.notas = [];
    this.rutaOrigen = null;
  }

  get cargado() { return this.vars.length > 0; }

  /** Carga desde el formato crudo de js/data/datasets.js */
  static desdeCrudo(raw) {
    const d = new Dataset();
    d.nombre = raw.nombre;
    d.n = raw.n;
    d.vars = raw.vars.map((v) => ({
      name: v.name,
      type: v.type || 'numeric',
      label: v.label || '',
      vallab: v.vallab || null,
      format: v.format || (v.type === 'string' ? '%9s' : '%9.0g'),
    }));
    for (const v of d.vars) {
      const col = raw.data[v.name];
      d.cols[v.name] = col ? col.slice() : new Array(d.n).fill(v.type === 'string' ? '' : null);
    }
    d.valueLabels = JSON.parse(JSON.stringify(raw.valueLabels || {}));
    d.notas = raw.notas ? [raw.notas] : [];
    d.modificado = false;
    return d;
  }

  limpiar() {
    this.nombre = null;
    this.vars = [];
    this.cols = {};
    this.valueLabels = {};
    this.n = 0;
    this.modificado = false;
    this.notas = [];
  }

  nombres() { return this.vars.map((v) => v.name); }

  existe(nombre) { return this.vars.some((v) => v.name === nombre); }

  meta(nombre) { return this.vars.find((v) => v.name === nombre) || null; }

  col(nombre) {
    if (!this.existe(nombre)) throw this.errorVariable(nombre);
    return this.cols[nombre];
  }

  esString(nombre) {
    const m = this.meta(nombre);
    return !!m && m.type === 'string';
  }

  errorVariable(nombre) {
    const sug = masParecido(nombre, this.nombres());
    let extra = null;
    if (sug) {
      extra = `¿Quisiste escribir <code>${sug}</code>? Los nombres en Stata distinguen mayúsculas de minúsculas.`;
    } else if (this.cargado) {
      const cerca = parecidos(nombre, this.nombres(), 4);
      extra = cerca.length
        ? `Variables parecidas en esta base: ${cerca.map((c) => `<code>${c}</code>`).join(', ')}. Escribe <code>describe</code> para ver la lista completa.`
        : 'Escribe <code>describe</code> para ver la lista completa de variables de esta base.';
    } else {
      extra = 'No hay ninguna base abierta. Empieza con <code>use enemdu_eloro_2024, clear</code>.';
    }
    return new ErrorStata(`variable ${nombre} no encontrada`, 111, extra);
  }

  /**
   * Expande una lista de variables con comodines y rangos.
   * Acepta: nombres, ing*, *eso, ing?so, educ-mujer (rango por posición), _all
   */
  expandir(lista, { permitirNuevas = false } = {}) {
    const out = [];
    const todos = this.nombres();
    for (let tok of lista) {
      if (!tok) continue;
      if (tok === '_all' || tok === '*') { out.push(...todos); continue; }
      if (tok.includes('-') && !tok.startsWith('-')) {
        const [a, b] = tok.split('-');
        if (this.existe(a) && this.existe(b)) {
          const i = todos.indexOf(a), j = todos.indexOf(b);
          const [lo, hi] = i <= j ? [i, j] : [j, i];
          out.push(...todos.slice(lo, hi + 1));
          continue;
        }
      }
      if (tok.includes('*') || tok.includes('?')) {
        const re = new RegExp('^' + tok.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        const hits = todos.filter((v) => re.test(v));
        if (!hits.length) throw new ErrorStata(`ninguna variable coincide con ${tok}`, 111,
          'Revisa el patrón. Por ejemplo <code>ln*</code> toma todas las que empiezan con "ln".');
        out.push(...hits);
        continue;
      }
      if (!this.existe(tok)) {
        if (permitirNuevas) { out.push(tok); continue; }
        throw this.errorVariable(tok);
      }
      out.push(tok);
    }
    // sin duplicados, conservando el orden
    return out.filter((v, i) => out.indexOf(v) === i);
  }

  /** Crea o reemplaza una variable. */
  poner(nombre, valores, { type = 'numeric', label = '', vallab = null, format = null } = {}) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) {
      throw new ErrorStata(`${nombre} no es un nombre válido de variable`, 198,
        'Un nombre de variable empieza con letra o guion bajo y solo lleva letras, números y guion bajo. Nada de espacios, tildes ni ñ.');
    }
    if (nombre.length > 32) {
      throw new ErrorStata(`${nombre} es demasiado largo`, 198, 'Máximo 32 caracteres.');
    }
    if (!this.existe(nombre)) {
      this.vars.push({ name: nombre, type, label, vallab, format: format || (type === 'string' ? '%9s' : '%9.0g') });
    } else {
      const m = this.meta(nombre);
      m.type = type;
      if (label) m.label = label;
      if (vallab !== null) m.vallab = vallab;
      if (format) m.format = format;
    }
    this.cols[nombre] = valores;
    if (this.n === 0) this.n = valores.length;
    this.modificado = true;
  }

  eliminar(nombres) {
    for (const nm of nombres) {
      const i = this.vars.findIndex((v) => v.name === nm);
      if (i >= 0) { this.vars.splice(i, 1); delete this.cols[nm]; }
    }
    if (!this.vars.length) this.n = 0;
    this.modificado = true;
  }

  conservar(nombres) {
    const fuera = this.nombres().filter((v) => !nombres.includes(v));
    this.eliminar(fuera);
    // reordena según lo pedido
    this.vars.sort((a, b) => nombres.indexOf(a.name) - nombres.indexOf(b.name));
  }

  renombrar(viejo, nuevo) {
    if (!this.existe(viejo)) throw this.errorVariable(viejo);
    if (this.existe(nuevo)) {
      throw new ErrorStata(`${nuevo} ya existe`, 110, 'Elige otro nombre o borra primero la variable con <code>drop</code>.');
    }
    const m = this.meta(viejo);
    m.name = nuevo;
    this.cols[nuevo] = this.cols[viejo];
    delete this.cols[viejo];
    this.modificado = true;
  }

  /** Deja solo las observaciones donde mascara[i] es verdadero. */
  filtrar(mascara) {
    const idx = [];
    for (let i = 0; i < this.n; i++) if (mascara[i]) idx.push(i);
    for (const v of this.vars) {
      const c = this.cols[v.name];
      this.cols[v.name] = idx.map((i) => c[i]);
    }
    const borradas = this.n - idx.length;
    this.n = idx.length;
    this.modificado = true;
    return borradas;
  }

  /** Ordena las observaciones por una lista de variables (faltantes al final). */
  ordenarPor(nombres, descendente = false) {
    const idx = Array.from({ length: this.n }, (_, i) => i);
    const cols = nombres.map((nm) => this.col(nm));
    const tipos = nombres.map((nm) => this.esString(nm));
    idx.sort((a, b) => {
      for (let k = 0; k < cols.length; k++) {
        let x = cols[k][a], y = cols[k][b];
        if (tipos[k]) {
          x = x == null ? '' : x; y = y == null ? '' : y;
          if (x < y) return descendente ? 1 : -1;
          if (x > y) return descendente ? -1 : 1;
        } else {
          const xn = esNulo(x), yn = esNulo(y);
          if (xn && yn) continue;
          if (xn) return 1;      // los faltantes siempre al final
          if (yn) return -1;
          if (x < y) return descendente ? 1 : -1;
          if (x > y) return descendente ? -1 : 1;
        }
      }
      return a - b;
    });
    for (const v of this.vars) {
      const c = this.cols[v.name];
      this.cols[v.name] = idx.map((i) => c[i]);
    }
    this.modificado = true;
  }

  /** Reordena las columnas dejando primero las indicadas. */
  ordenarColumnas(nombres, { alFinal = false } = {}) {
    const resto = this.vars.filter((v) => !nombres.includes(v.name));
    const puestas = nombres.map((nm) => this.meta(nm)).filter(Boolean);
    this.vars = alFinal ? [...resto, ...puestas] : [...puestas, ...resto];
    this.modificado = true;
  }

  /** Etiqueta de valor aplicada, o el número si no hay. */
  etiquetaDe(nombre, valor) {
    const m = this.meta(nombre);
    if (!m || !m.vallab) return null;
    const tabla = this.valueLabels[m.vallab];
    if (!tabla) return null;
    const k = String(valor);
    return Object.prototype.hasOwnProperty.call(tabla, k) ? tabla[k] : null;
  }

  /** Valores distintos de una variable, ordenados, sin faltantes. */
  niveles(nombre) {
    const c = this.col(nombre);
    const s = new Set();
    for (const v of c) if (!esNulo(v) && v !== '') s.add(v);
    const arr = [...s];
    if (this.esString(nombre)) arr.sort();
    else arr.sort((a, b) => a - b);
    return arr;
  }

  /** ¿Parece categórica? (pocos enteros distintos) */
  pareceCategorica(nombre) {
    if (this.esString(nombre)) return true;
    const m = this.meta(nombre);
    if (m && m.vallab) return true;
    const c = this.col(nombre);
    const s = new Set();
    for (const v of c) {
      if (esNulo(v)) continue;
      if (!Number.isInteger(v)) return false;
      s.add(v);
      if (s.size > 20) return false;
    }
    return s.size >= 2 && s.size <= 20;
  }

  /** ¿Es binaria 0/1? */
  esBinaria(nombre) {
    const niv = this.niveles(nombre);
    return niv.length === 2 && niv[0] === 0 && niv[1] === 1;
  }

  contarFaltantes(nombre) {
    const c = this.col(nombre);
    const esS = this.esString(nombre);
    let k = 0;
    for (const v of c) if (esS ? v === '' || v == null : esNulo(v)) k++;
    return k;
  }

  copia() {
    const d = new Dataset();
    d.nombre = this.nombre;
    d.n = this.n;
    d.vars = this.vars.map((v) => ({ ...v }));
    for (const v of this.vars) d.cols[v.name] = this.cols[v.name].slice();
    d.valueLabels = JSON.parse(JSON.stringify(this.valueLabels));
    d.notas = this.notas.slice();
    d.modificado = this.modificado;
    return d;
  }

  /** Matriz de filas completas (sin faltantes) para una lista de variables. */
  filasCompletas(nombres) {
    const cols = nombres.map((nm) => this.col(nm));
    const idx = [];
    for (let i = 0; i < this.n; i++) {
      let ok = true;
      for (const c of cols) { if (esNulo(c[i]) || c[i] === '') { ok = false; break; } }
      if (ok) idx.push(i);
    }
    return idx;
  }
}
