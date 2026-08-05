// matrix.js — álgebra lineal mínima para StataProfe.
// Matrices = number[][] (fila-mayor). Vectores = number[].
// Sin dependencias, sin DOM. Todo devuelve números crudos.

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

// Valida que A sea una matriz rectangular no vacía y devuelve [filas, columnas].
function dim(A, nombre = 'A') {
  if (!Array.isArray(A) || A.length === 0 || !Array.isArray(A[0])) {
    throw new Error(`${nombre} no es una matriz válida`);
  }
  const r = A.length;
  const c = A[0].length;
  for (let i = 0; i < r; i++) {
    if (!Array.isArray(A[i]) || A[i].length !== c) {
      throw new Error(`${nombre} tiene filas de distinto largo (fila ${i})`);
    }
  }
  return [r, c];
}

// Mayor valor absoluto de la matriz (escala de referencia para tolerancias).
function escalaMax(A) {
  let m = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[i].length; j++) {
      const v = Math.abs(A[i][j]);
      if (v > m) m = v;
    }
  }
  return m;
}

// Copia profunda de una matriz.
function copia(A) {
  return A.map((f) => f.slice());
}

// ---------------------------------------------------------------------------
// Construcción básica
// ---------------------------------------------------------------------------

// Matriz r x c de ceros.
export function zeros(r, c) {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) {
    throw new Error('zeros: dimensiones inválidas');
  }
  const M = new Array(r);
  for (let i = 0; i < r; i++) M[i] = new Array(c).fill(0);
  return M;
}

// Identidad n x n.
export function identity(n) {
  const M = zeros(n, n);
  for (let i = 0; i < n; i++) M[i][i] = 1;
  return M;
}

// Traspuesta.
export function transpose(A) {
  const [r, c] = dim(A, 'A');
  const T = zeros(c, r);
  for (let i = 0; i < r; i++) {
    const fila = A[i];
    for (let j = 0; j < c; j++) T[j][i] = fila[j];
  }
  return T;
}

// Producto matricial A (r x k) * B (k x c).
export function matmul(A, B) {
  const [ra, ca] = dim(A, 'A');
  const [rb, cb] = dim(B, 'B');
  if (ca !== rb) {
    throw new Error(`matmul: dimensiones incompatibles (${ra}x${ca} por ${rb}x${cb})`);
  }
  const C = zeros(ra, cb);
  for (let i = 0; i < ra; i++) {
    const fa = A[i];
    const fc = C[i];
    for (let k = 0; k < ca; k++) {
      const a = fa[k];
      if (a === 0) continue;
      const fb = B[k];
      for (let j = 0; j < cb; j++) fc[j] += a * fb[j];
    }
  }
  return C;
}

// A (r x c) * v (c) -> number[r].
export function matvec(A, v) {
  const [r, c] = dim(A, 'A');
  if (!Array.isArray(v) || v.length !== c) {
    throw new Error(`matvec: el vector debe tener ${c} elementos`);
  }
  const out = new Array(r).fill(0);
  for (let i = 0; i < r; i++) {
    const fila = A[i];
    let s = 0;
    for (let j = 0; j < c; j++) s += fila[j] * v[j];
    out[i] = s;
  }
  return out;
}

// v (r) * A (r x c) -> number[c].
export function vecmat(v, A) {
  const [r, c] = dim(A, 'A');
  if (!Array.isArray(v) || v.length !== r) {
    throw new Error(`vecmat: el vector debe tener ${r} elementos`);
  }
  const out = new Array(c).fill(0);
  for (let i = 0; i < r; i++) {
    const vi = v[i];
    if (vi === 0) continue;
    const fila = A[i];
    for (let j = 0; j < c; j++) out[j] += vi * fila[j];
  }
  return out;
}

// Suma elemento a elemento.
export function add(A, B) {
  const [r, c] = dim(A, 'A');
  const [rb, cb] = dim(B, 'B');
  if (r !== rb || c !== cb) throw new Error('add: dimensiones incompatibles');
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) C[i][j] = A[i][j] + B[i][j];
  return C;
}

// Resta elemento a elemento.
export function sub(A, B) {
  const [r, c] = dim(A, 'A');
  const [rb, cb] = dim(B, 'B');
  if (r !== rb || c !== cb) throw new Error('sub: dimensiones incompatibles');
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) C[i][j] = A[i][j] - B[i][j];
  return C;
}

// Multiplica toda la matriz por un escalar.
export function scale(A, k) {
  const [r, c] = dim(A, 'A');
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) C[i][j] = A[i][j] * k;
  return C;
}

// Diagonal principal como vector.
export function diag(A) {
  const [r, c] = dim(A, 'A');
  const n = Math.min(r, c);
  const d = new Array(n);
  for (let i = 0; i < n; i++) d[i] = A[i][i];
  return d;
}

// Producto punto de dos vectores.
export function dot(u, v) {
  if (!Array.isArray(u) || !Array.isArray(v) || u.length !== v.length) {
    throw new Error('dot: los vectores deben tener el mismo largo');
  }
  let s = 0;
  for (let i = 0; i < u.length; i++) s += u[i] * v[i];
  return s;
}

// Medias por columna.
export function colMeans(X) {
  const [r, c] = dim(X, 'X');
  const m = new Array(c).fill(0);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m[j] += X[i][j];
  for (let j = 0; j < c; j++) m[j] /= r;
  return m;
}

// X'X.
export function crossprod(X) {
  const [r, c] = dim(X, 'X');
  const C = zeros(c, c);
  for (let i = 0; i < r; i++) {
    const fila = X[i];
    for (let j = 0; j < c; j++) {
      const xj = fila[j];
      if (xj === 0) continue;
      for (let k = j; k < c; k++) C[j][k] += xj * fila[k];
    }
  }
  for (let j = 0; j < c; j++) for (let k = 0; k < j; k++) C[j][k] = C[k][j];
  return C;
}

// X'y.
export function crossprodXY(X, y) {
  const [r, c] = dim(X, 'X');
  if (!Array.isArray(y) || y.length !== r) {
    throw new Error(`crossprodXY: y debe tener ${r} elementos`);
  }
  const out = new Array(c).fill(0);
  for (let i = 0; i < r; i++) {
    const yi = y[i];
    if (yi === 0) continue;
    const fila = X[i];
    for (let j = 0; j < c; j++) out[j] += fila[j] * yi;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inversa y solución de sistemas
// ---------------------------------------------------------------------------

// Inversa por Gauss-Jordan con pivoteo parcial. Lanza Error('singular').
export function inverse(A) {
  const [n, c] = dim(A, 'A');
  if (n !== c) throw new Error('inverse: la matriz debe ser cuadrada');
  const M = copia(A);
  const I = identity(n);
  const tol = 1e-14 * Math.max(escalaMax(A), 1e-300);

  for (let col = 0; col < n; col++) {
    // Pivoteo parcial: la fila con mayor valor absoluto en la columna.
    let mejor = col;
    let mayor = Math.abs(M[col][col]);
    for (let i = col + 1; i < n; i++) {
      const v = Math.abs(M[i][col]);
      if (v > mayor) { mayor = v; mejor = i; }
    }
    if (!(mayor > tol)) throw new Error('singular');
    if (mejor !== col) {
      const t = M[col]; M[col] = M[mejor]; M[mejor] = t;
      const t2 = I[col]; I[col] = I[mejor]; I[mejor] = t2;
    }
    // Normaliza la fila del pivote.
    const piv = M[col][col];
    for (let j = 0; j < n; j++) { M[col][j] /= piv; I[col][j] /= piv; }
    M[col][col] = 1;
    // Elimina la columna en el resto de filas.
    for (let i = 0; i < n; i++) {
      if (i === col) continue;
      const f = M[i][col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) { M[i][j] -= f * M[col][j]; I[i][j] -= f * I[col][j]; }
      M[i][col] = 0;
    }
  }
  return I;
}

// Resuelve A x = b por eliminación gaussiana con pivoteo parcial.
export function solve(A, b) {
  const [n, c] = dim(A, 'A');
  if (n !== c) throw new Error('solve: la matriz debe ser cuadrada');
  if (!Array.isArray(b) || b.length !== n) throw new Error(`solve: b debe tener ${n} elementos`);
  const M = copia(A);
  const v = b.slice();
  const tol = 1e-14 * Math.max(escalaMax(A), 1e-300);

  for (let col = 0; col < n; col++) {
    let mejor = col;
    let mayor = Math.abs(M[col][col]);
    for (let i = col + 1; i < n; i++) {
      const t = Math.abs(M[i][col]);
      if (t > mayor) { mayor = t; mejor = i; }
    }
    if (!(mayor > tol)) throw new Error('singular');
    if (mejor !== col) {
      const t = M[col]; M[col] = M[mejor]; M[mejor] = t;
      const tb = v[col]; v[col] = v[mejor]; v[mejor] = tb;
    }
    const piv = M[col][col];
    for (let i = col + 1; i < n; i++) {
      const f = M[i][col] / piv;
      if (f === 0) continue;
      for (let j = col; j < n; j++) M[i][j] -= f * M[col][j];
      v[i] -= f * v[col];
    }
  }
  // Sustitución hacia atrás.
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = v[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

// Cholesky: devuelve L triangular inferior con A = L L', o null si no es def. positiva.
export function cholesky(A) {
  const [n, c] = dim(A, 'A');
  if (n !== c) return null;
  const L = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0) || !Number.isFinite(s)) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
        if (!Number.isFinite(L[i][j])) return null;
      }
    }
  }
  return L;
}

// Inversa de una matriz simétrica definida positiva vía Cholesky.
// Si falla el Cholesky cae en inverse().
export function invSPD(A) {
  const [n, c] = dim(A, 'A');
  if (n !== c) throw new Error('invSPD: la matriz debe ser cuadrada');
  const L = cholesky(A);
  if (L === null) return inverse(A);

  // Inversa de L (triangular inferior).
  const Li = zeros(n, n);
  for (let j = 0; j < n; j++) {
    Li[j][j] = 1 / L[j][j];
    for (let i = j + 1; i < n; i++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j];
      Li[i][j] = s / L[i][i];
    }
  }
  // A^-1 = (L^-1)' (L^-1).
  const Inv = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = Math.max(i, j); k < n; k++) s += Li[k][i] * Li[k][j];
      Inv[i][j] = s;
      Inv[j][i] = s;
    }
  }
  return Inv;
}

// ---------------------------------------------------------------------------
// QR con Householder y detección de colinealidad
// ---------------------------------------------------------------------------

// ¿La columna j es constante y distinta de cero? (candidata a ser _cons)
function esConstante(X, j) {
  const v0 = X[0][j];
  if (v0 === 0) return false;
  for (let i = 1; i < X.length; i++) {
    if (Math.abs(X[i][j] - v0) > 1e-12 * Math.abs(v0)) return false;
  }
  return true;
}

// Orden en que se procesan las columnas: si hay una única columna constante
// (la constante del modelo) se procesa primero, así nunca se descarta.
function ordenProceso(X, n) {
  const orden = [];
  for (let j = 0; j < n; j++) orden.push(j);
  let cons = -1;
  let cuantas = 0;
  for (let j = 0; j < n; j++) {
    if (esConstante(X, j)) { cuantas++; if (cons < 0) cons = j; }
  }
  if (cuantas === 1 && cons > 0) {
    orden.splice(cons, 1);
    orden.unshift(cons);
  }
  return orden;
}

// Núcleo QR: reflexiones de Householder columna por columna en el orden dado.
// Una columna cuya norma residual cae por debajo de tol * norma original se
// considera combinación lineal de las anteriores y se descarta.
function qrCore(X, y, tol) {
  const [m, n] = dim(X, 'X');
  if (y !== null && (!Array.isArray(y) || y.length !== m)) {
    throw new Error(`qrLeastSquares: y debe tener ${m} elementos`);
  }
  const R = copia(X);
  const qty = y === null ? null : y.slice();
  const orden = ordenProceso(X, n);

  // Norma original de cada columna (referencia de la tolerancia relativa).
  const norma0 = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += X[i][j] * X[i][j];
    norma0[j] = Math.sqrt(s);
  }

  const keep = [];     // columnas conservadas, en orden de proceso
  const dropped = [];
  let k = 0;           // fila pivote actual

  for (let idx = 0; idx < orden.length; idx++) {
    const j = orden[idx];
    if (k >= m || norma0[j] === 0) { dropped.push(j); continue; }

    let s = 0;
    for (let i = k; i < m; i++) s += R[i][j] * R[i][j];
    const nrm = Math.sqrt(s);
    if (!(nrm > tol * norma0[j])) { dropped.push(j); continue; }

    // Reflexión de Householder que anula R[k+1..m-1][j].
    const alpha = R[k][j] >= 0 ? -nrm : nrm;
    const v = new Array(m - k);
    for (let i = k; i < m; i++) v[i - k] = R[i][j];
    v[0] -= alpha;
    let vv = 0;
    for (let t = 0; t < m - k; t++) vv += v[t] * v[t];

    if (vv > 0) {
      // Aplica H = I - 2 v v'/(v'v) a todas las columnas y a y.
      for (let jj = 0; jj < n; jj++) {
        let p = 0;
        for (let i = k; i < m; i++) p += v[i - k] * R[i][jj];
        p = (2 * p) / vv;
        if (p === 0) continue;
        for (let i = k; i < m; i++) R[i][jj] -= p * v[i - k];
      }
      if (qty !== null) {
        let p = 0;
        for (let i = k; i < m; i++) p += v[i - k] * qty[i];
        p = (2 * p) / vv;
        for (let i = k; i < m; i++) qty[i] -= p * v[i - k];
      }
    }
    // Limpia el redondeo bajo la diagonal.
    R[k][j] = alpha;
    for (let i = k + 1; i < m; i++) R[i][j] = 0;

    keep.push(j);
    k++;
  }

  return { R, qty, keep, dropped, rank: keep.length, n };
}

// Índices de columnas linealmente independientes y descartadas.
// La constante (única columna constante) nunca se descarta.
export function detectCollinear(X, tol = 1e-9) {
  const { keep, dropped } = qrCore(X, null, tol);
  return {
    keep: keep.slice().sort((a, b) => a - b),
    dropped: dropped.slice().sort((a, b) => a - b),
  };
}

// Mínimos cuadrados por QR de Householder (no ecuaciones normales).
// Las columnas descartadas por colinealidad reciben beta = 0.
export function qrLeastSquares(X, y) {
  const TOL = 1e-10; // tolerancia relativa de colinealidad
  const { R, qty, keep, dropped, rank, n } = qrCore(X, y, TOL);

  // Sustitución hacia atrás sobre el bloque triangular de las columnas útiles.
  const bk = new Array(rank).fill(0);
  for (let s = rank - 1; s >= 0; s--) {
    let acc = qty[s];
    for (let t = s + 1; t < rank; t++) acc -= R[s][keep[t]] * bk[t];
    bk[s] = acc / R[s][keep[s]];
  }

  const beta = new Array(n).fill(0);
  for (let s = 0; s < rank; s++) beta[keep[s]] = bk[s];

  return { beta, rank, dropped: dropped.slice().sort((a, b) => a - b) };
}
