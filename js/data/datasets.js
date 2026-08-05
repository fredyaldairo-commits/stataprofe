// Bases de datos del simulador. Se generan con semilla fija: siempre salen idénticas,
// en cualquier dispositivo. Los parámetros están calibrados para que los resultados
// coincidan con los del documento "Econometría sin tecnicismos".

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function elegir(rng, probs) {
  const u = rng();
  let acum = 0;
  for (let i = 0; i < probs.length; i++) { acum += probs[i]; if (u < acum) return i; }
  return probs.length - 1;
}
function limitar(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function red(x, d = 2) { const f = Math.pow(10, d); return Math.round(x * f) / f; }

// ---------------------------------------------------------------------------
// Parámetros calibrados (ver test/t_datasets.mjs)
// ---------------------------------------------------------------------------
const P = {
  N: 3412,
  semilla: 20240815,
  // ecuación del ingreso, en logaritmos
  a0: 0.545,
  gEduc: 0.0614,
  gExper: 0.011925,
  gExper2: -0.0002089,
  gMujer: -0.10903,
  gHoras: 0.612,          // elasticidad Cobb-Douglas (horas)
  gK: 0.271,              // elasticidad Cobb-Douglas (capital)
  dTamano: [0, 0.1208, 0.2306, 0.3656],
  sigma: 0.27,
  sdLnK: 0.78,            // dispersión del capital: mueve el R² de la regresión principal
  // ecuación multinomial de la situación laboral (base = 1, formal)
  mInformal: { cons: 2.61, educ: -0.214, exper: -0.0150, mujer: 0.193 },
  mCuenta: { cons: 0.774, educ: -0.169, exper: 0.0210, mujer: 0.445 },
  // ecuación ordenada de la satisfacción: los cortes se fijan solos para repartir
  // la muestra en estas proporciones (así no dependen de la escala del ingreso)
  sSatisf: { lningreso: 0.62, educ: 0.035, mujer: -0.08, repartos: [0.09, 0.18, 0.30, 0.26, 0.17] },
};

// ---------------------------------------------------------------------------
// Base principal
// ---------------------------------------------------------------------------
function generarEnemdu(params = P) {
  const p = { ...P, ...params };
  const rng = mulberry32(p.semilla);
  const N = p.N;
  const col = {
    id: [], edad: [], educ: [], exper: [], exper2: [], mujer: [], horas: [], k: [],
    tamano: [], sector: [], urbano: [], casado: [], hijos: [], provincia: [],
    ingreso: [], formal: [], situacion: [], satisf: [],
  };
  const latentes = [];

  for (let i = 0; i < N; i++) {
    const mujer = rng() < 0.442 ? 1 : 0;
    // edad concentrada en jóvenes-adultos
    const edad = Math.round(limitar(18 + 47 * Math.pow(rng(), 1.35), 18, 65));
    // años de estudio: mezcla de tres perfiles educativos
    let educ;
    const perfil = rng();
    if (perfil < 0.28) educ = Math.round(limitar(normal(rng) * 2.4 + 7.2, 0, 22));
    else if (perfil < 0.74) educ = Math.round(limitar(normal(rng) * 2.1 + 12.1, 0, 22));
    else educ = Math.round(limitar(normal(rng) * 2.0 + 16.3, 0, 22));
    educ = Math.min(educ, Math.max(0, edad - 5));
    const exper = Math.max(0, Math.min(edad - educ - 6, edad - 15) + Math.round(normal(rng) * 1.5));
    const exper2 = exper * exper;
    const horas = Math.round(limitar(normal(rng) * 44 + 168, 8, 340));
    const k = red(Math.exp(normal(rng) * p.sdLnK + 7.15), 2);
    const tamano = elegir(rng, [0.46, 0.26, 0.18, 0.10]) + 1;
    const sector = elegir(rng, [0.19, 0.13, 0.28, 0.24, 0.16]) + 1;
    const urbano = rng() < 0.663 ? 1 : 0;
    const casado = rng() < (edad > 30 ? 0.62 : 0.31) ? 1 : 0;
    const hijos = Math.min(6, Math.round(Math.max(0, normal(rng) * 1.25 + (casado ? 1.9 : 0.6))));
    const provincia = ['El Oro', 'El Oro', 'El Oro', 'El Oro', 'Guayas', 'Loja', 'Azuay'][Math.floor(rng() * 7)];

    // ingreso: Cobb-Douglas en horas y capital + capital humano
    const lnY = p.a0
      + p.gEduc * educ + p.gExper * exper + p.gExper2 * exper2 + p.gMujer * mujer
      + p.gHoras * Math.log(horas) + p.gK * Math.log(k)
      + p.dTamano[tamano - 1]
      + normal(rng) * p.sigma;
    const ingreso = red(Math.exp(lnY), 2);

    // situación laboral (logit multinomial, base = formal)
    const v2 = p.mInformal.cons + p.mInformal.educ * educ + p.mInformal.exper * exper + p.mInformal.mujer * mujer;
    const v3 = p.mCuenta.cons + p.mCuenta.educ * educ + p.mCuenta.exper * exper + p.mCuenta.mujer * mujer;
    const e1 = 1, e2 = Math.exp(v2), e3 = Math.exp(v3);
    const s = e1 + e2 + e3;
    const u = rng();
    let situacion;
    if (u < e1 / s) situacion = 1;
    else if (u < (e1 + e2) / s) situacion = 2;
    else situacion = 3;
    const formal = situacion === 1 ? 1 : 0;

    // satisfacción con la vida: se guarda el índice latente y los cortes se ponen después
    const vs = p.sSatisf.lningreso * lnY + p.sSatisf.educ * educ + p.sSatisf.mujer * mujer;
    const uu = rng();
    latentes.push(vs + Math.log(uu / (1 - uu)));

    col.id.push(i + 1);
    col.edad.push(edad); col.educ.push(educ); col.exper.push(exper); col.exper2.push(exper2);
    col.mujer.push(mujer); col.horas.push(horas); col.k.push(k); col.tamano.push(tamano);
    col.sector.push(sector); col.urbano.push(urbano); col.casado.push(casado); col.hijos.push(hijos);
    col.provincia.push(provincia); col.ingreso.push(ingreso); col.formal.push(formal);
    col.situacion.push(situacion);
  }

  // cortes de la satisfacción: se toman de los cuantiles del índice latente, de modo que
  // el reparto entre los 5 niveles sea el buscado sin depender de la escala del ingreso
  const orden = latentes.slice().sort((x, z) => x - z);
  const cortes = [];
  let acumulado = 0;
  for (let j = 0; j < p.sSatisf.repartos.length - 1; j++) {
    acumulado += p.sSatisf.repartos[j];
    cortes.push(orden[Math.min(N - 1, Math.floor(acumulado * N))]);
  }
  for (let i = 0; i < N; i++) {
    const lat = latentes[i];
    let s = p.sSatisf.repartos.length;
    for (let j = 0; j < cortes.length; j++) if (lat <= cortes[j]) { s = j + 1; break; }
    col.satisf.push(s);
  }
  return col;
}

const ETIQ_ENEMDU = {
  id: 'Número de la persona encuestada',
  ingreso: 'Ingreso mensual del trabajo (USD)',
  educ: 'Años de estudio aprobados',
  exper: 'Años de experiencia laboral',
  exper2: 'Experiencia al cuadrado',
  edad: 'Edad en años cumplidos',
  mujer: 'Sexo (1 = mujer, 0 = hombre)',
  horas: 'Horas trabajadas al mes',
  formal: 'Tiene empleo formal (contrato y seguro)',
  tamano: 'Tamaño de la empresa donde trabaja',
  situacion: 'Situación laboral',
  satisf: 'Satisfacción con la vida (5 niveles)',
  k: 'Capital o herramientas de trabajo (USD)',
  sector: 'Rama de actividad',
  urbano: 'Vive en zona urbana',
  casado: 'Tiene pareja estable',
  hijos: 'Número de hijos en el hogar',
  provincia: 'Provincia de residencia',
};

const VALLAB_ENEMDU = {
  lbl_si_no: { 0: 'No', 1: 'Sí' },
  lbl_sexo: { 0: 'Hombre', 1: 'Mujer' },
  lbl_tamano: { 1: 'Microempresa', 2: 'Empresa pequeña', 3: 'Empresa mediana', 4: 'Empresa grande' },
  lbl_situacion: { 1: 'Asalariado formal', 2: 'Asalariado informal', 3: 'Cuenta propia' },
  lbl_satisf: { 1: 'Muy triste', 2: 'Triste', 3: 'Normal', 4: 'Feliz', 5: 'Muy feliz' },
  lbl_sector: { 1: 'Agricultura y banano', 2: 'Minería', 3: 'Comercio', 4: 'Servicios', 5: 'Construcción' },
};

function varsEnemdu() {
  const vl = {
    mujer: 'lbl_sexo', formal: 'lbl_si_no', urbano: 'lbl_si_no', casado: 'lbl_si_no',
    tamano: 'lbl_tamano', situacion: 'lbl_situacion', satisf: 'lbl_satisf', sector: 'lbl_sector',
  };
  const orden = ['id', 'ingreso', 'educ', 'exper', 'exper2', 'edad', 'mujer', 'horas',
    'formal', 'situacion', 'tamano', 'sector', 'satisf', 'k', 'urbano', 'casado', 'hijos', 'provincia'];
  return orden.map((nm) => ({
    name: nm,
    type: nm === 'provincia' ? 'string' : 'numeric',
    label: ETIQ_ENEMDU[nm] || '',
    vallab: vl[nm] || null,
    format: nm === 'provincia' ? '%12s' : (nm === 'ingreso' || nm === 'k' ? '%9.2f' : '%9.0g'),
  }));
}

function enemduLimpia() {
  const col = generarEnemdu();
  return {
    nombre: 'enemdu_eloro_2024',
    n: P.N,
    vars: varsEnemdu(),
    data: col,
    valueLabels: JSON.parse(JSON.stringify(VALLAB_ENEMDU)),
    notas: 'Encuesta de empleo simulada, El Oro 2024. Base ya depurada: sin faltantes ni repetidos.',
  };
}

// ---------------------------------------------------------------------------
// La misma base, pero sucia (para las lecciones de depuración)
// ---------------------------------------------------------------------------
function enemduCruda() {
  const base = generarEnemdu();
  const rng = mulberry32(777001);
  const N = P.N;

  const ingreso_txt = [], sexo_txt = [], satisf_txt = [], provincia = [];
  const edad = base.edad.slice(), educ = base.educ.slice(), horas = base.horas.slice();
  const exper = base.exper.slice(), k = base.k.slice();
  const formal = base.formal.slice(), situacion = base.situacion.slice();
  const tamano = base.tamano.slice(), sector = base.sector.slice();
  const urbano = base.urbano.slice(), casado = base.casado.slice(), hijos = base.hijos.slice();
  const id = base.id.slice();

  const PALABRAS = { 1: 'Muy triste', 2: 'Triste', 3: 'Normal', 4: 'Feliz', 5: 'Muy feliz' };
  const FORMAS_H = ['Hombre', 'hombre', 'HOMBRE', 'H', 'Hombre '];
  const FORMAS_M = ['Mujer', 'mujer', 'MUJER ', 'M', ' Mujer'];
  const FORMAS_PROV = { 'El Oro': ['El Oro', 'EL ORO', 'el oro', ' El Oro', 'El  Oro'], Guayas: ['Guayas', 'GUAYAS', 'guayas'], Loja: ['Loja', 'LOJA', ' Loja'], Azuay: ['Azuay', 'AZUAY'] };

  for (let i = 0; i < N; i++) {
    // ingreso guardado como texto, con formatos mezclados
    const v = base.ingreso[i];
    const r = rng();
    if (r < 0.026) ingreso_txt.push('NA');
    else if (r < 0.042) ingreso_txt.push('s/i');
    else if (r < 0.060) ingreso_txt.push('');
    else if (r < 0.42) {
      // formato con punto de miles y coma decimal: 1.234,50
      const ent = Math.floor(v), dec = Math.round((v - ent) * 100);
      ingreso_txt.push(String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(dec).padStart(2, '0'));
    } else if (r < 0.55) ingreso_txt.push('  ' + v.toFixed(0));
    else ingreso_txt.push(v.toFixed(2));

    sexo_txt.push(base.mujer[i] ? FORMAS_M[Math.floor(rng() * FORMAS_M.length)] : FORMAS_H[Math.floor(rng() * FORMAS_H.length)]);
    satisf_txt.push(PALABRAS[base.satisf[i]]);
    const pr = base.provincia[i];
    const formas = FORMAS_PROV[pr] || [pr];
    provincia.push(formas[Math.floor(rng() * formas.length)]);

    // códigos de no respuesta
    if (rng() < 0.021) edad[i] = 99;
    if (rng() < 0.024) educ[i] = 99;
    if (rng() < 0.019) horas[i] = 999;
    // faltantes de verdad
    if (rng() < 0.012) exper[i] = null;
    if (rng() < 0.010) k[i] = null;
    if (rng() < 0.008) hijos[i] = null;
  }

  // 6 vacíos más en sexo_txt
  for (let t = 0; t < 6; t++) sexo_txt[Math.floor(rng() * N)] = '';

  // 9 valores absurdos
  const absurdos = [];
  for (let t = 0; t < 5; t++) { const i = Math.floor(rng() * N); ingreso_txt[i] = '999999'; absurdos.push(i); }
  for (let t = 0; t < 4; t++) { const i = Math.floor(rng() * N); edad[i] = 250; absurdos.push(i); }

  const cols = { id, ingreso_txt, sexo_txt, edad, educ, exper, horas, k, formal, situacion,
    tamano, sector, satisf_txt, urbano, casado, hijos, provincia };

  // 14 filas repetidas exactas, insertadas al final
  const nombres = Object.keys(cols);
  for (let t = 0; t < 14; t++) {
    const i = Math.floor(rng() * N);
    for (const nm of nombres) cols[nm].push(cols[nm][i]);
  }

  const etiquetas = {
    id: 'Número de la persona encuestada',
    ingreso_txt: 'Ingreso mensual TAL COMO LO DIGITARON (texto)',
    sexo_txt: 'Sexo escrito a mano (texto)',
    satisf_txt: 'Satisfacción con la vida, en palabras (texto)',
    edad: 'Edad (99 = no responde)',
    educ: 'Años de estudio (99 = no responde)',
    horas: 'Horas al mes (999 = no responde)',
    exper: 'Años de experiencia',
    k: 'Capital de trabajo (USD)',
    formal: 'Tiene empleo formal',
    situacion: 'Situación laboral',
    tamano: 'Tamaño de la empresa',
    sector: 'Rama de actividad',
    urbano: 'Vive en zona urbana',
    casado: 'Tiene pareja estable',
    hijos: 'Número de hijos',
    provincia: 'Provincia (texto sin normalizar)',
  };
  const vl = { formal: 'lbl_si_no', urbano: 'lbl_si_no', casado: 'lbl_si_no',
    tamano: 'lbl_tamano', situacion: 'lbl_situacion', sector: 'lbl_sector' };

  return {
    nombre: 'enemdu_eloro_2024_crudo',
    n: N + 14,
    vars: Object.keys(cols).map((nm) => ({
      name: nm,
      type: ['ingreso_txt', 'sexo_txt', 'satisf_txt', 'provincia'].includes(nm) ? 'string' : 'numeric',
      label: etiquetas[nm] || '',
      vallab: vl[nm] || null,
      format: ['ingreso_txt', 'sexo_txt', 'satisf_txt', 'provincia'].includes(nm) ? '%14s' : '%9.0g',
    })),
    data: cols,
    valueLabels: JSON.parse(JSON.stringify(VALLAB_ENEMDU)),
    notas: 'Base SIN DEPURAR, tal como sale del operativo de campo. Tiene textos mal escritos, códigos 99 y 999, celdas vacías, filas repetidas y valores absurdos. Depurarla es el ejercicio.',
  };
}

// ---------------------------------------------------------------------------
// Empresas: Cobb-Douglas
// ---------------------------------------------------------------------------
function produccion() {
  const rng = mulberry32(505050);
  const N = 480;
  const d = { empresa: [], produccion: [], trabajo: [], capital: [], sector: [], exporta: [] };
  const nombres = ['Bananera', 'Camaronera', 'Comercial', 'Transportes', 'Agrícola', 'Minera', 'Pesquera', 'Constructora'];
  for (let i = 0; i < N; i++) {
    const trabajo = red(Math.exp(normal(rng) * 0.85 + 3.05), 1);       // trabajadores
    const capital = red(Math.exp(normal(rng) * 1.15 + 10.4), 0);       // dólares
    const sector = elegir(rng, [0.34, 0.18, 0.27, 0.21]) + 1;
    const exporta = rng() < 0.29 ? 1 : 0;
    const lnQ = 3.05 + 0.62 * Math.log(trabajo) + 0.33 * Math.log(capital)
      + 0.14 * exporta + normal(rng) * 0.33;
    d.empresa.push(`${nombres[Math.floor(rng() * nombres.length)]} ${String(i + 1).padStart(3, '0')}`);
    d.produccion.push(red(Math.exp(lnQ), 0));
    d.trabajo.push(trabajo);
    d.capital.push(capital);
    d.sector.push(sector);
    d.exporta.push(exporta);
  }
  return {
    nombre: 'produccion_eloro',
    n: N,
    vars: [
      { name: 'empresa', type: 'string', label: 'Nombre de la empresa', vallab: null, format: '%18s' },
      { name: 'produccion', type: 'numeric', label: 'Valor de la producción anual (USD)', vallab: null, format: '%12.0f' },
      { name: 'trabajo', type: 'numeric', label: 'Trabajadores equivalentes a tiempo completo', vallab: null, format: '%9.1f' },
      { name: 'capital', type: 'numeric', label: 'Capital instalado (USD)', vallab: null, format: '%12.0f' },
      { name: 'sector', type: 'numeric', label: 'Rama de actividad', vallab: 'lbl_sec_emp', format: '%9.0g' },
      { name: 'exporta', type: 'numeric', label: 'La empresa exporta', vallab: 'lbl_si_no', format: '%9.0g' },
    ],
    data: d,
    valueLabels: {
      lbl_si_no: { 0: 'No', 1: 'Sí' },
      lbl_sec_emp: { 1: 'Banano', 2: 'Camarón', 3: 'Comercio', 4: 'Servicios' },
    },
    notas: 'Empresas de El Oro, 2024. Sirve para estimar una función de producción Cobb-Douglas.',
  };
}

// ---------------------------------------------------------------------------
// Hogares: satisfacción ordenada
// ---------------------------------------------------------------------------
function hogares() {
  const rng = mulberry32(909090);
  const N = 900;
  const d = { hogar: [], satisfaccion: [], ingreso_hogar: [], educ_jefe: [], miembros: [], urbano: [], desempleo: [] };
  for (let i = 0; i < N; i++) {
    const educ_jefe = Math.round(limitar(normal(rng) * 4.1 + 11.3, 0, 22));
    const miembros = Math.max(1, Math.round(normal(rng) * 1.5 + 3.7));
    const urbano = rng() < 0.68 ? 1 : 0;
    const desempleo = rng() < 0.17 ? 1 : 0;
    const ingreso_hogar = red(Math.exp(normal(rng) * 0.52 + 6.42 + 0.045 * educ_jefe - 0.42 * desempleo), 2);
    const lat = 0.78 * Math.log(ingreso_hogar) + 0.031 * educ_jefe - 0.55 * desempleo
      - 0.09 * miembros + 0.14 * urbano;
    const u = rng();
    const y = lat + Math.log(u / (1 - u));
    const c = [4.55, 5.62, 6.55, 7.45];
    let sat = 5;
    if (y <= c[0]) sat = 1; else if (y <= c[1]) sat = 2; else if (y <= c[2]) sat = 3; else if (y <= c[3]) sat = 4;
    d.hogar.push(i + 1);
    d.satisfaccion.push(sat);
    d.ingreso_hogar.push(ingreso_hogar);
    d.educ_jefe.push(educ_jefe);
    d.miembros.push(miembros);
    d.urbano.push(urbano);
    d.desempleo.push(desempleo);
  }
  return {
    nombre: 'hogares_satisfaccion',
    n: N,
    vars: [
      { name: 'hogar', type: 'numeric', label: 'Número de hogar', vallab: null, format: '%9.0g' },
      { name: 'satisfaccion', type: 'numeric', label: 'Satisfacción con la vida (1 a 5, ordenada)', vallab: 'lbl_sat5', format: '%9.0g' },
      { name: 'ingreso_hogar', type: 'numeric', label: 'Ingreso total del hogar (USD)', vallab: null, format: '%9.2f' },
      { name: 'educ_jefe', type: 'numeric', label: 'Años de estudio del jefe de hogar', vallab: null, format: '%9.0g' },
      { name: 'miembros', type: 'numeric', label: 'Personas que viven en el hogar', vallab: null, format: '%9.0g' },
      { name: 'urbano', type: 'numeric', label: 'Hogar urbano', vallab: 'lbl_si_no', format: '%9.0g' },
      { name: 'desempleo', type: 'numeric', label: 'Hay alguien desempleado en el hogar', vallab: 'lbl_si_no', format: '%9.0g' },
    ],
    data: d,
    valueLabels: {
      lbl_si_no: { 0: 'No', 1: 'Sí' },
      lbl_sat5: { 1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Ni una cosa ni otra', 4: 'Satisfecho', 5: 'Muy satisfecho' },
    },
    notas: 'Hogares de El Oro. La satisfacción SÍ tiene orden: aquí va ologit u oprobit, no mlogit.',
  };
}

// ---------------------------------------------------------------------------
// Autos (base corta para ejemplos rápidos)
// ---------------------------------------------------------------------------
function autos() {
  const rng = mulberry32(747474);
  const N = 74;
  const marcas = ['Chevrolet', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Mazda', 'Renault',
    'Volkswagen', 'Suzuki', 'Great Wall', 'Chery', 'Ford'];
  const d = { marca: [], precio: [], rendimiento: [], peso: [], largo: [], extranjero: [] };
  for (let i = 0; i < N; i++) {
    const extranjero = rng() < 0.31 ? 1 : 0;
    const peso = Math.round(limitar(normal(rng) * 260 + 1310 + extranjero * 90, 850, 2200));
    const largo = Math.round(limitar(peso * 0.0021 + normal(rng) * 0.12 + 1.35, 3.4, 5.4) * 100) / 100;
    const rendimiento = red(limitar(46 - peso * 0.014 + normal(rng) * 2.1, 8, 42), 1);
    const precio = Math.round(limitar(4200 + peso * 8.9 + extranjero * 4800 + normal(rng) * 2100, 8500, 46000) / 10) * 10;
    d.marca.push(`${marcas[Math.floor(rng() * marcas.length)]} ${['Sail', 'Rio', 'Accent', 'Yaris', 'Versa', 'CX-3', 'Logan', 'Gol', 'Swift', 'Haval', 'Tiggo', 'Fiesta'][Math.floor(rng() * 12)]}`);
    d.precio.push(precio);
    d.rendimiento.push(rendimiento);
    d.peso.push(peso);
    d.largo.push(largo);
    d.extranjero.push(extranjero);
  }
  return {
    nombre: 'auto_ec',
    n: N,
    vars: [
      { name: 'marca', type: 'string', label: 'Marca y modelo', vallab: null, format: '%18s' },
      { name: 'precio', type: 'numeric', label: 'Precio de venta (USD)', vallab: null, format: '%9.0f' },
      { name: 'rendimiento', type: 'numeric', label: 'Rendimiento (km por galón)', vallab: null, format: '%9.1f' },
      { name: 'peso', type: 'numeric', label: 'Peso (kg)', vallab: null, format: '%9.0g' },
      { name: 'largo', type: 'numeric', label: 'Largo (metros)', vallab: null, format: '%9.2f' },
      { name: 'extranjero', type: 'numeric', label: 'Importado de fuera de la región', vallab: 'lbl_origen', format: '%9.0g' },
    ],
    data: d,
    valueLabels: { lbl_origen: { 0: 'Ensamblado aquí', 1: 'Importado' } },
    notas: 'Base corta (74 autos) para practicar comandos sin esperar.',
  };
}

// ---------------------------------------------------------------------------

export const CATALOGO = [
  { nombre: 'enemdu_eloro_2024', titulo: 'Empleo El Oro 2024 (limpia)', obs: P.N, limpio: true,
    desc: 'Encuesta de empleo ya depurada. Es la que usa toda la guía.' },
  { nombre: 'enemdu_eloro_2024_crudo', titulo: 'Empleo El Oro 2024 (sin depurar)', obs: P.N + 14, limpio: false,
    desc: 'La misma, pero sucia: textos, códigos 99, vacíos, repetidos y atípicos.' },
  { nombre: 'produccion_eloro', titulo: 'Empresas de El Oro', obs: 480, limpio: true,
    desc: 'Producción, trabajo y capital. Para Cobb-Douglas y elasticidades.' },
  { nombre: 'hogares_satisfaccion', titulo: 'Satisfacción de los hogares', obs: 900, limpio: true,
    desc: 'Satisfacción de 1 a 5 CON orden. Para ologit y oprobit.' },
  { nombre: 'auto_ec', titulo: 'Autos', obs: 74, limpio: true,
    desc: 'Base chiquita de 74 autos para probar comandos rápido.' },
];

const FABRICAS = {
  enemdu_eloro_2024: enemduLimpia,
  enemdu_eloro_2024_crudo: enemduCruda,
  produccion_eloro: produccion,
  hogares_satisfaccion: hogares,
  auto_ec: autos,
};

const CACHE = {};

export function cargar(nombre) {
  if (!FABRICAS[nombre]) throw new Error(`base desconocida: ${nombre}`);
  if (!CACHE[nombre]) CACHE[nombre] = FABRICAS[nombre]();
  // se devuelve una copia para que el usuario pueda modificarla sin dañar el original
  const b = CACHE[nombre];
  return {
    nombre: b.nombre,
    n: b.n,
    vars: b.vars.map((v) => ({ ...v })),
    data: Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, v.slice()])),
    valueLabels: JSON.parse(JSON.stringify(b.valueLabels)),
    notas: b.notas,
  };
}

// se exporta para el script de calibración
export const PARAMS = P;
export { generarEnemdu };
