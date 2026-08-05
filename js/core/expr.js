// Evaluador de expresiones de Stata: tokeniza, arma el árbol y lo evalúa fila por fila.
// Respeta las reglas raras de Stata a propósito (sobre todo: el faltante "." es más grande
// que cualquier número al comparar), porque son parte de lo que hay que aprender.

import { ErrorStata } from './dataset.js';
import { esNulo, mulberry32, normalDe, masParecido } from './util.js';

const FUNCIONES = {
  // matemáticas
  abs: 1, exp: 1, ln: 1, log: 1, log10: 1, log2: 1, sqrt: 1, int: 1, round: [1, 2],
  ceil: 1, floor: 1, trunc: 1, mod: 2, sign: 1, max: -1, min: -1, sum: 1,
  comb: 2, digamma: 1, lngamma: 1, exp10: 1,
  // lógicas / faltantes
  cond: [3, 4], missing: -1, mi: -1, inlist: -1, inrange: 3, autocode: 4, recode: -1,
  // estadísticas de distribución
  normal: 1, normalden: [1, 2, 3], invnormal: 1, ttail: 2, invttail: 2,
  chi2tail: 2, invchi2tail: 2, Ftail: 3, invFtail: 3, binomial: 3, logistic: 1,
  // aleatorias
  runiform: [0, 2], rnormal: [0, 2], rbinomial: 2, rpoisson: 1, rchi2: 1,
  // texto
  strlen: 1, length: 1, substr: 3, strpos: 2, upper: 1, lower: 1, proper: 1,
  trim: 1, ltrim: 1, rtrim: 1, strtrim: 1, subinstr: [3, 4], string: [1, 2],
  real: 1, word: 2, wordcount: 1, strofreal: [1, 2], abbrev: 2, itrim: 1,
  regexm: 2, regexr: 3, strmatch: 2, char: 1, indexnot: 2, reverse: 1,
  // fecha (mínimas)
  year: 1, month: 1, day: 1,
};

const PALABRAS_RESERVADAS = new Set(['_n', '_N', '_pi', '_rc']);

function esLetra(c) { return /[A-Za-z_]/.test(c); }
function esDigito(c) { return /[0-9]/.test(c); }

export function tokenizar(s) {
  const t = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '"') {
      let j = i + 1, buf = '';
      while (j < s.length && s[j] !== '"') { buf += s[j]; j++; }
      if (j >= s.length) throw new ErrorStata('faltan comillas de cierre', 198,
        'Abriste unas comillas <code>"</code> y no las cerraste.');
      t.push({ tipo: 'str', valor: buf });
      i = j + 1; continue;
    }
    if (esDigito(c) || (c === '.' && esDigito(s[i + 1] || ''))) {
      let j = i, buf = '';
      while (j < s.length && (esDigito(s[j]) || s[j] === '.')) { buf += s[j]; j++; }
      if (j < s.length && (s[j] === 'e' || s[j] === 'E') && /[0-9+\-]/.test(s[j + 1] || '')) {
        buf += s[j]; j++;
        if (s[j] === '+' || s[j] === '-') { buf += s[j]; j++; }
        while (j < s.length && esDigito(s[j])) { buf += s[j]; j++; }
      }
      t.push({ tipo: 'num', valor: parseFloat(buf) });
      i = j; continue;
    }
    if (c === '.') {
      // faltante "." o extendido ".a" .. ".z"
      if (/[a-z]/.test(s[i + 1] || '') && !esLetra(s[i + 2] || '')) { t.push({ tipo: 'miss' }); i += 2; continue; }
      t.push({ tipo: 'miss' }); i++; continue;
    }
    if (esLetra(c)) {
      let j = i, buf = '';
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) { buf += s[j]; j++; }
      t.push({ tipo: 'id', valor: buf });
      i = j; continue;
    }
    const dobles = ['==', '!=', '~=', '<=', '>='];
    const dos = s.slice(i, i + 2);
    if (dobles.includes(dos)) { t.push({ tipo: 'op', valor: dos === '~=' ? '!=' : dos }); i += 2; continue; }
    if ('+-*/^<>&|!~(),'.includes(c)) {
      t.push({ tipo: 'op', valor: c === '~' ? '!' : c });
      i++; continue;
    }
    if (c === '=') {
      throw new ErrorStata('operador = inválido dentro de una expresión', 198,
        'Para comparar en Stata se usan <strong>dos</strong> iguales: <code>==</code>. Un solo <code>=</code> sirve solo para asignar en <code>generate</code> y <code>replace</code>.');
    }
    throw new ErrorStata(`carácter no válido: ${c}`, 198, null);
  }
  return t;
}

const PREC = { '|': 1, '&': 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '^': 7 };

class Parser {
  constructor(tokens, ds) { this.t = tokens; this.i = 0; this.ds = ds; }
  ver() { return this.t[this.i] || null; }
  comer() { return this.t[this.i++]; }
  esperar(v) {
    const tk = this.comer();
    if (!tk || tk.tipo !== 'op' || tk.valor !== v) {
      throw new ErrorStata(`se esperaba "${v}"`, 198,
        v === ')' ? 'Te falta cerrar un paréntesis.' : null);
    }
  }
  expr(min = 0) {
    let izq = this.unario();
    for (;;) {
      const tk = this.ver();
      if (!tk || tk.tipo !== 'op' || !(tk.valor in PREC)) break;
      const p = PREC[tk.valor];
      if (p < min) break;
      this.comer();
      const der = tk.valor === '^' ? this.expr(p) : this.expr(p + 1);
      izq = { k: 'bin', op: tk.valor, a: izq, b: der };
    }
    return izq;
  }
  unario() {
    const tk = this.ver();
    if (tk && tk.tipo === 'op' && (tk.valor === '-' || tk.valor === '+' || tk.valor === '!')) {
      this.comer();
      return { k: 'un', op: tk.valor, a: this.unario() };
    }
    return this.primario();
  }
  primario() {
    const tk = this.comer();
    if (!tk) throw new ErrorStata('expresión incompleta', 198, 'La expresión se cortó antes de terminar.');
    if (tk.tipo === 'num') return { k: 'num', v: tk.valor };
    if (tk.tipo === 'str') return { k: 'str', v: tk.valor };
    if (tk.tipo === 'miss') return { k: 'miss' };
    if (tk.tipo === 'op' && tk.valor === '(') {
      const e = this.expr(0);
      this.esperar(')');
      return e;
    }
    if (tk.tipo === 'id') {
      const nombre = tk.valor;
      const sig = this.ver();
      if (sig && sig.tipo === 'op' && sig.valor === '(') {
        this.comer();
        const args = [];
        if (!(this.ver() && this.ver().tipo === 'op' && this.ver().valor === ')')) {
          for (;;) {
            args.push(this.expr(0));
            const s2 = this.ver();
            if (s2 && s2.tipo === 'op' && s2.valor === ',') { this.comer(); continue; }
            break;
          }
        }
        this.esperar(')');
        this.validarFuncion(nombre, args.length);
        return { k: 'fun', nombre, args };
      }
      if (PALABRAS_RESERVADAS.has(nombre)) return { k: 'sys', nombre };
      if (this.ds && !this.ds.existe(nombre)) {
        // ¿parece una función mal escrita?
        const fsug = masParecido(nombre, Object.keys(FUNCIONES));
        if (fsug && !this.ds.existe(nombre)) {
          const vsug = masParecido(nombre, this.ds.nombres());
          if (!vsug) {
            throw new ErrorStata(`variable ${nombre} no encontrada`, 111,
              `Si querías usar la función <code>${fsug}()</code>, acuérdate de los paréntesis: <code>${fsug}(...)</code>.`);
          }
        }
        throw this.ds.errorVariable(nombre);
      }
      return { k: 'var', nombre };
    }
    throw new ErrorStata('expresión inválida', 198, null);
  }
  validarFuncion(nombre, n) {
    if (!(nombre in FUNCIONES)) {
      const sug = masParecido(nombre, Object.keys(FUNCIONES));
      throw new ErrorStata(`función ${nombre}() desconocida`, 133,
        sug ? `¿Quisiste decir <code>${sug}()</code>?` : 'Escribe <code>ayuda funciones</code> para ver la lista.');
    }
    const esp = FUNCIONES[nombre];
    if (esp === -1) return;
    const ok = Array.isArray(esp) ? (n >= esp[0] && n <= esp[esp.length - 1]) : n === esp;
    if (!ok) {
      const q = Array.isArray(esp) ? `entre ${esp[0]} y ${esp[esp.length - 1]}` : String(esp);
      throw new ErrorStata(`${nombre}() recibe ${q} argumento(s), le diste ${n}`, 130, null);
    }
  }
}

// ---------- evaluación ----------

function aBool(v) {
  if (esNulo(v)) return false;   // en un "if", el faltante NO cuenta
  return v !== 0 && v !== '';
}

/** Para comparar, Stata trata el faltante como el número más grande que existe. */
function paraComparar(v) {
  if (esNulo(v)) return 8.98846567431158e307;
  return v;
}

class Evaluador {
  constructor(ds, ctx) {
    this.ds = ds;
    this.ctx = ctx || {};
    this.rng = this.ctx.rng || mulberry32(12345);
    this.acumulados = new Map();   // para sum()
  }

  ev(nodo, i) {
    switch (nodo.k) {
      case 'num': return nodo.v;
      case 'str': return nodo.v;
      case 'miss': return null;
      case 'sys':
        if (nodo.nombre === '_n') return i + 1;
        if (nodo.nombre === '_N') return this.ds.n;
        if (nodo.nombre === '_pi') return Math.PI;
        if (nodo.nombre === '_rc') return this.ctx.rc || 0;
        return null;
      case 'var': {
        const v = this.ds.cols[nodo.nombre][i];
        if (this.ds.esString(nodo.nombre)) return v == null ? '' : v;
        return esNulo(v) ? null : v;
      }
      case 'un': {
        const a = this.ev(nodo.a, i);
        if (nodo.op === '!') return esNulo(a) ? null : (aBool(a) ? 0 : 1);
        if (esNulo(a)) return null;
        if (typeof a === 'string') throw new ErrorStata('no se puede aplicar un signo a un texto', 109, null);
        return nodo.op === '-' ? -a : a;
      }
      case 'bin': return this.binario(nodo, i);
      case 'fun': return this.funcion(nodo, i);
      default: return null;
    }
  }

  binario(nodo, i) {
    const op = nodo.op;
    const a = this.ev(nodo.a, i);
    // & y | evalúan los dos lados (Stata no hace cortocircuito con faltantes)
    const b = this.ev(nodo.b, i);

    if (op === '&' || op === '|') {
      if (esNulo(a) || esNulo(b)) return null;
      const x = aBool(a), y = aBool(b);
      return (op === '&' ? (x && y) : (x || y)) ? 1 : 0;
    }

    const esTexto = typeof a === 'string' || typeof b === 'string';

    if (['<', '<=', '>', '>=', '==', '!='].includes(op)) {
      if (esTexto) {
        const x = typeof a === 'string' ? a : (a == null ? '' : String(a));
        const y = typeof b === 'string' ? b : (b == null ? '' : String(b));
        switch (op) {
          case '<': return x < y ? 1 : 0;
          case '<=': return x <= y ? 1 : 0;
          case '>': return x > y ? 1 : 0;
          case '>=': return x >= y ? 1 : 0;
          case '==': return x === y ? 1 : 0;
          case '!=': return x !== y ? 1 : 0;
        }
      }
      const x = paraComparar(a), y = paraComparar(b);
      switch (op) {
        case '<': return x < y ? 1 : 0;
        case '<=': return x <= y ? 1 : 0;
        case '>': return x > y ? 1 : 0;
        case '>=': return x >= y ? 1 : 0;
        case '==': return x === y ? 1 : 0;
        case '!=': return x !== y ? 1 : 0;
      }
    }

    if (op === '+' && esTexto) {
      const x = typeof a === 'string' ? a : (a == null ? '' : String(a));
      const y = typeof b === 'string' ? b : (b == null ? '' : String(b));
      return x + y;
    }
    if (esTexto) {
      throw new ErrorStata(`no se puede usar ${op} con texto`, 109,
        'Una variable alfanumérica (texto) no entra en cuentas. Conviértela antes con <code>destring</code> o <code>encode</code>.');
    }
    if (esNulo(a) || esNulo(b)) return null;   // el faltante se contagia en aritmética
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      case '^': {
        const r = Math.pow(a, b);
        return isFinite(r) ? r : null;
      }
    }
    return null;
  }

  funcion(nodo, i) {
    const nm = nodo.nombre;
    const A = nodo.args.map((x) => this.ev(x, i));
    const num = (k) => (esNulo(A[k]) ? null : (typeof A[k] === 'string' ? null : A[k]));
    const txt = (k) => (A[k] == null ? '' : String(A[k]));
    const nn = (f, ...ks) => { for (const k of ks) if (esNulo(A[k]) || typeof A[k] === 'string') return null; return f(); };

    switch (nm) {
      case 'abs': return nn(() => Math.abs(A[0]), 0);
      case 'exp': return nn(() => { const r = Math.exp(A[0]); return isFinite(r) ? r : null; }, 0);
      case 'ln': case 'log': return nn(() => (A[0] > 0 ? Math.log(A[0]) : null), 0);
      case 'log10': return nn(() => (A[0] > 0 ? Math.log10(A[0]) : null), 0);
      case 'log2': return nn(() => (A[0] > 0 ? Math.log2(A[0]) : null), 0);
      case 'exp10': return nn(() => Math.pow(10, A[0]), 0);
      case 'sqrt': return nn(() => (A[0] >= 0 ? Math.sqrt(A[0]) : null), 0);
      case 'int': case 'trunc': return nn(() => Math.trunc(A[0]), 0);
      case 'ceil': return nn(() => Math.ceil(A[0]), 0);
      case 'floor': return nn(() => Math.floor(A[0]), 0);
      case 'sign': return nn(() => Math.sign(A[0]), 0);
      case 'round': return nn(() => {
        const u = A.length > 1 ? A[1] : 1;
        if (!u) return A[0];
        return Math.round(A[0] / u) * u;
      }, 0);
      case 'mod': return nn(() => A[0] - A[1] * Math.floor(A[0] / A[1]), 0, 1);
      case 'lngamma': return nn(() => lnGammaLocal(A[0]), 0);
      case 'comb': return nn(() => Math.round(Math.exp(lnGammaLocal(A[0] + 1) - lnGammaLocal(A[1] + 1) - lnGammaLocal(A[0] - A[1] + 1))), 0, 1);
      case 'max': {
        const v = A.filter((x) => !esNulo(x));
        return v.length ? Math.max(...v) : null;
      }
      case 'min': {
        const v = A.filter((x) => !esNulo(x));
        return v.length ? Math.min(...v) : null;
      }
      case 'sum': {
        // suma acumulada: guarda el estado por nodo
        let est = this.acumulados.get(nodo);
        if (est === undefined || i === 0) { est = 0; }
        if (!esNulo(A[0])) est += A[0];
        this.acumulados.set(nodo, est);
        return est;
      }
      case 'missing': case 'mi':
        // Stata acepta varias a la vez: vale 1 si CUALQUIERA está vacía
        for (const v of A) if (esNulo(v) || v === '') return 1;
        return 0;
      case 'cond': {
        if (esNulo(A[0])) return A.length > 3 ? A[3] : null;
        return aBool(A[0]) ? A[1] : A[2];
      }
      case 'inlist': {
        if (esNulo(A[0])) return 0;
        for (let k = 1; k < A.length; k++) if (A[k] === A[0]) return 1;
        return 0;
      }
      case 'inrange': return nn(() => (A[0] >= A[1] && A[0] <= A[2] ? 1 : 0), 0, 1, 2);
      case 'autocode': return nn(() => {
        const [x, nq, x0, x1] = A;
        const w = (x1 - x0) / nq;
        let k = Math.ceil((x - x0) / w);
        k = Math.max(1, Math.min(nq, k));
        return x0 + k * w;
      }, 0, 1, 2, 3);
      case 'recode': {
        if (esNulo(A[0])) return null;
        for (let k = 1; k < A.length; k++) if (A[0] <= A[k]) return A[k];
        return A[A.length - 1];
      }
      case 'normal': return nn(() => normalCdfLocal(A[0]), 0);
      case 'logistic': return nn(() => 1 / (1 + Math.exp(-A[0])), 0);
      case 'normalden': return nn(() => {
        if (A.length === 1) return Math.exp(-0.5 * A[0] * A[0]) / Math.sqrt(2 * Math.PI);
        const m = A.length === 3 ? A[1] : 0, s = A[A.length - 1];
        const z = (A[0] - m) / s;
        return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
      }, 0);
      case 'invnormal': return nn(() => normalInvLocal(A[0]), 0);
      case 'runiform': return this.rng();
      case 'rnormal': {
        const z = normalDe(this.rng);
        if (A.length === 2) return A[0] + A[1] * z;
        if (A.length === 1) return A[0] + z;
        return z;
      }
      case 'rbinomial': return nn(() => {
        let k = 0;
        for (let j = 0; j < A[0]; j++) if (this.rng() < A[1]) k++;
        return k;
      }, 0, 1);
      case 'rpoisson': return nn(() => {
        const L = Math.exp(-A[0]);
        let k = 0, p = 1;
        do { k++; p *= this.rng(); } while (p > L);
        return k - 1;
      }, 0);
      case 'rchi2': return nn(() => {
        let s = 0;
        for (let j = 0; j < A[0]; j++) { const z = normalDe(this.rng); s += z * z; }
        return s;
      }, 0);
      // texto
      case 'strlen': case 'length': return txt(0).length;
      case 'substr': {
        const s = txt(0);
        let ini = A[1], largo = A[2];
        if (esNulo(ini)) return '';
        if (ini < 0) ini = s.length + ini + 1;
        const desde = Math.max(0, ini - 1);
        if (esNulo(largo) || largo < 0) return s.slice(desde);
        return s.substr(desde, largo);
      }
      case 'strpos': return txt(0).indexOf(txt(1)) + 1;
      case 'indexnot': {
        const s = txt(0), c = txt(1);
        for (let k = 0; k < s.length; k++) if (!c.includes(s[k])) return k + 1;
        return 0;
      }
      case 'upper': return txt(0).toUpperCase();
      case 'lower': return txt(0).toLowerCase();
      case 'proper': return txt(0).toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
      case 'trim': case 'strtrim': return txt(0).trim();
      case 'ltrim': return txt(0).replace(/^\s+/, '');
      case 'rtrim': return txt(0).replace(/\s+$/, '');
      case 'itrim': return txt(0).replace(/\s+/g, ' ');
      case 'reverse': return txt(0).split('').reverse().join('');
      case 'subinstr': {
        const s = txt(0), de = txt(1), a = txt(2);
        const cuantas = A.length > 3 && !esNulo(A[3]) ? A[3] : Infinity;
        if (de === '') return s;
        let out = '', resto = s, k = 0;
        while (k < cuantas) {
          const p = resto.indexOf(de);
          if (p < 0) break;
          out += resto.slice(0, p) + a;
          resto = resto.slice(p + de.length);
          k++;
        }
        return out + resto;
      }
      case 'string': case 'strofreal': {
        if (esNulo(A[0])) return '';
        if (A.length > 1) {
          const f = String(A[1]);
          const m = f.match(/%(\d+)\.(\d+)f/);
          if (m) return A[0].toFixed(parseInt(m[2], 10));
        }
        return String(A[0]);
      }
      case 'real': {
        const s = txt(0).trim();
        if (s === '') return null;
        const v = Number(s);
        return isNaN(v) ? null : v;
      }
      case 'word': {
        const w = txt(0).trim().split(/\s+/).filter(Boolean);
        const k = A[1];
        if (esNulo(k) || k === 0) return '';
        const j = k > 0 ? k - 1 : w.length + k;
        return w[j] === undefined ? '' : w[j];
      }
      case 'wordcount': return txt(0).trim() ? txt(0).trim().split(/\s+/).length : 0;
      case 'abbrev': {
        const s = txt(0), k = A[1];
        return s.length <= k ? s : s.slice(0, k - 1) + '~';
      }
      case 'char': return String.fromCharCode(A[0]);
      case 'regexm': { try { return new RegExp(txt(1)).test(txt(0)) ? 1 : 0; } catch { return 0; } }
      case 'regexr': { try { return txt(0).replace(new RegExp(txt(1)), txt(2)); } catch { return txt(0); } }
      case 'strmatch': {
        const pat = '^' + txt(1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
        try { return new RegExp(pat).test(txt(0)) ? 1 : 0; } catch { return 0; }
      }
      default:
        throw new ErrorStata(`la función ${nm}() todavía no está disponible en el simulador`, 133,
          'Este simulador cubre las funciones más usadas. Si la necesitas de verdad, avísale a tu profe.');
    }
  }
}

// Funciones auxiliares mínimas (para no depender de dist.js en el evaluador)
function lnGammaLocal(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function normalCdfLocal(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
function normalInvLocal(p) {
  if (p <= 0 || p >= 1) return null;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Compila una expresión y devuelve {ast, evaluar(i), tipo} */
export function compilar(texto, ds, ctx) {
  const toks = tokenizar(texto);
  if (!toks.length) throw new ErrorStata('expresión vacía', 198, null);
  const p = new Parser(toks, ds);
  const ast = p.expr(0);
  if (p.i < p.t.length) {
    const sobra = p.t[p.i];
    throw new ErrorStata('la expresión tiene algo de más', 198,
      sobra.tipo === 'id'
        ? `Sobra <code>${sobra.valor}</code>. Si son varias condiciones, únelas con <code>&</code> (y) o <code>|</code> (o).`
        : 'Revisa los paréntesis y los operadores.');
  }
  const ev = new Evaluador(ds, ctx);
  return {
    ast,
    evaluar: (i) => ev.ev(ast, i),
    esTexto: () => detectaTexto(ast, ds),
  };
}

function detectaTexto(nodo, ds) {
  switch (nodo.k) {
    case 'str': return true;
    case 'var': return ds.esString(nodo.nombre);
    case 'bin': return nodo.op === '+' && (detectaTexto(nodo.a, ds) || detectaTexto(nodo.b, ds));
    case 'fun': return ['substr', 'upper', 'lower', 'proper', 'trim', 'ltrim', 'rtrim', 'strtrim',
      'itrim', 'subinstr', 'string', 'strofreal', 'word', 'abbrev', 'char', 'regexr', 'reverse'].includes(nodo.nombre);
    case 'un': return false;
    default: return false;
  }
}

/** Evalúa una expresión sobre todas las filas. Devuelve un array. */
export function evaluarTodo(texto, ds, ctx) {
  const c = compilar(texto, ds, ctx);
  const out = new Array(ds.n);
  for (let i = 0; i < ds.n; i++) out[i] = c.evaluar(i);
  return { valores: out, esTexto: c.esTexto() };
}

/** Evalúa una condición y devuelve una máscara booleana. */
export function mascara(texto, ds, ctx) {
  if (!texto) return new Array(ds.n).fill(true);
  const c = compilar(texto, ds, ctx);
  const m = new Array(ds.n);
  for (let i = 0; i < ds.n; i++) {
    const v = c.evaluar(i);
    m[i] = !esNulo(v) && v !== 0 && v !== '';
  }
  return m;
}

export { FUNCIONES };
