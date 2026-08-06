// Interfaz de StataProfe: conecta el motor con la pantalla.

import { Sesion, ejecutarLinea, ejecutarDoFile } from './core/comandos.js';
import { COMANDOS } from './core/parser.js';
import { CATALOGO } from './data/datasets.js';
import { MODULOS, NIVELES, INSIGNIAS, totalLecciones, nivelDe, buscarLeccion } from './curriculum.js';
import { MODELOS_CATALOGO, PRIMOS, NIVELES_DIF, REGLA, SUPUESTOS_MCO } from './modelos.js';
import { DOFILES, FAMILIAS_DO, textoCompleto } from './dofiles.js';
import { clasificarY, sugerirX, armarPlan } from './guia.js';
import { preguntarGemini, tieneClave, guardarClave, borrarClave, probarClave, modeloElegido, listarModelos } from './gemini.js';
import { esNulo, fmtG, fmtP, padI, corta } from './core/util.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ses = new Sesion();
let historial = [];
let posHist = -1;
let vistaActual = 'consola';

// ─────────────────────────────────────────────── almacenamiento local
const K = {
  progreso: 'stataprofe.progreso',
  dofile: 'stataprofe.dofile',
  tema: 'stataprofe.tema',
  grande: 'stataprofe.grande',
  verProfe: 'stataprofe.verProfe',
  subidos: 'stataprofe.subidos',
  guardadas: 'stataprofe.guardadas',
  hist: 'stataprofe.hist',
  paneles: 'stataprofe.paneles',
  doActivo: 'stataprofe.doActivo',
};
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };

let progreso = leer(K.progreso, { hechas: [], xp: 0, leccionActual: null, insignias: [] });
let verProfe = leer(K.verProfe, true);

// ─────────────────────────────────────────────── ganchos de la sesión
ses.ganchos = {
  alCargar: () => { pintarEstado(); pintarDatos(); pintarVarsLateral(); },
  abrirTabla: () => cambiarVista('datos'),
  abrirEditor: () => cambiarVista('dofile'),
  guardarLocal: (nombre) => {
    const g = leer(K.guardadas, {});
    g[nombre] = serializar(ses.ds);
    escribir(K.guardadas, g);
  },
  exportarCSV: () => descargarCSV(),
};

function serializar(ds) {
  return {
    nombre: ds.nombre, n: ds.n,
    vars: ds.vars.map((v) => ({ ...v })),
    data: Object.fromEntries(ds.vars.map((v) => [v.name, ds.cols[v.name]])),
    valueLabels: ds.valueLabels, notas: (ds.notas || []).join('\n'),
  };
}
// bases guardadas y subidas quedan disponibles para "use"
ses.archivosSubidos = Object.assign({}, leer(K.guardadas, {}), leer(K.subidos, {}));

// ─────────────────────────────────────────────── render de bloques
function render(bloques, destino) {
  for (const b of bloques) destino.appendChild(nodoDe(b));
}

function nodoDe(b) {
  const d = document.createElement('div');
  if (b.t === 'txt') { d.className = 'bloque-txt'; d.textContent = b.s; return d; }
  if (b.t === 'ok') { d.className = 'bloque-ok'; d.innerHTML = b.s; return d; }
  if (b.t === 'aviso') { d.className = 'bloque-aviso'; d.innerHTML = b.s; return d; }
  if (b.t === 'err') {
    d.className = 'bloque-err';
    d.innerHTML = `<div class="err-cab">Error r(${b.codigo})</div>
      <div class="err-msg">${esc(b.mensaje)}</div>
      ${b.sugerencia ? `<div class="err-sug">${b.sugerencia}</div>` : ''}`;
    return d;
  }
  if (b.t === 'svg') { d.className = 'grafico'; d.innerHTML = b.svg; return d; }
  if (b.t === 'profe') { return nodoProfe(b.bloque); }
  if (b.t === 'coef') { return nodoCoef(b.fit, b.opciones); }
  d.textContent = '';
  return d;
}

function nodoProfe(bl) {
  const d = document.createElement('div');
  d.className = 'profe';
  if (!verProfe) { d.style.display = 'none'; }
  const items = (bl.items || []).map((i) => `<div class="profe-item ${i.tono || 'info'}">${i.texto}</div>`).join('');
  const sig = (bl.siguientes || []).length
    ? `<div class="profe-sig"><span class="et">Qué correr después</span>${
      bl.siguientes.map((s) => `<button class="sug" data-cmd="${esc(s)}">${esc(s)}</button>`).join('')}</div>`
    : '';
  const frases = (bl.frases || []).length
    ? `<div class="profe-frases"><span class="et">Frases listas para tu informe</span><ul>${
      bl.frases.map((f) => `<li>${f}</li>`).join('')}</ul></div>`
    : '';
  d.innerHTML = `<div class="profe-cab">${esc(bl.titulo || 'El profe dice')}</div>
    <div class="profe-cuerpo">
      ${bl.resumen ? `<div class="profe-resumen">${bl.resumen}</div>` : ''}
      ${items}${sig}${frases}
    </div>`;
  return d;
}

function nodoCoef(fit, op = {}) {
  const d = document.createElement('div');
  d.className = 'coef';
  const est = fit.statName === 't' ? 't' : 'z';
  const pt = fit.statName === 't' ? 'P>|t|' : 'P>|z|';
  const etq = op.etiquetaCoef || 'Coef.';
  const filas = fit.names.map((nm, i) => {
    const omitida = fit.omitted && fit.omitted.includes(nm);
    const p = fit.p[i];
    let cls = 'info', ver = '—';
    if (!omitida && !isNaN(p)) {
      if (p < 0.01) { cls = 'ok'; ver = 'Sí importa'; }
      else if (p < 0.05) { cls = 'ok'; ver = 'Sí importa'; }
      else if (p < 0.10) { cls = 'ojo'; ver = 'Al límite'; }
      else { cls = 'mal'; ver = 'Sin evidencia'; }
    }
    if (omitida) { cls = 'info'; ver = 'Omitida'; }
    const ci = fit.ci && fit.ci[i] ? fit.ci[i] : [NaN, NaN];
    return `<div class="coef-f ${cls}" data-i="${i}" role="button" tabindex="0" aria-expanded="false">
        <span class="nm">${esc(nm)}</span>
        <span>${omitida ? '0' : fmtG(fit.b[i], 6)}</span>
        <span>${omitida ? '—' : fmtG(fit.se[i], 5)}</span>
        <span>${omitida || isNaN(fit.stat[i]) ? '—' : fit.stat[i].toFixed(2)}</span>
        <span>${omitida ? '—' : fmtP(p)}</span>
        <span class="ver">${ver}</span>
      </div>
      <div class="coef-nota" data-nota="${i}"><div class="in"><span class="k">Cómo se lee</span><span data-txt="${i}"></span></div></div>`;
  }).join('');

  // algunas tablas (nlcom, lincom, ecuaciones sueltas de mlogit) no traen N ni R²
  const partesCab = [esc(fit.depvar || '')];
  if (fit.N !== undefined && fit.N !== null) partesCab.push(`${fit.N} observaciones`);
  if (fit.r2 !== undefined && !isNaN(fit.r2)) partesCab.push(`R² ${(fit.r2 * 100).toFixed(1)}%`);
  d.innerHTML = `<div class="coef-cab">
      <span>${partesCab.filter(Boolean).join(' · ')}</span>
      <span class="pista">↓ toca una fila para que te la explique</span>
    </div>
    <div class="coef-scroll"><div class="coef-tabla">
      <div class="coef-h"><span>Variable</span><span>${esc(etq)}</span><span>Err. est.</span><span>${est}</span><span>${pt}</span><span>¿Qué dice?</span></div>
      ${filas}
    </div></div>`;

  // explicaciones al tocar
  d.querySelectorAll('.coef-f').forEach((f) => {
    const abrir = () => {
      const i = Number(f.dataset.i);
      const nota = d.querySelector(`[data-nota="${i}"]`);
      const abierta = nota.classList.contains('abierta');
      d.querySelectorAll('.coef-nota.abierta').forEach((n) => n.classList.remove('abierta'));
      d.querySelectorAll('.coef-f[aria-expanded="true"]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
      if (abierta) return;
      const destino = nota.querySelector(`[data-txt="${i}"]`);
      if (!destino.dataset.listo) {
        destino.innerHTML = textoDeFila(fit, i, op);
        destino.dataset.listo = '1';
      }
      nota.classList.add('abierta');
      f.setAttribute('aria-expanded', 'true');
    };
    f.addEventListener('click', abrir);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  });
  return d;
}

// el texto de cada fila lo produce el profesor, con el contexto del modelo
import * as Prof from './professor.js';
function textoDeFila(fit, i, op) {
  try {
    const media = fit.y ? fit.y.reduce((a, b) => a + b, 0) / fit.y.length : null;
    const r = Prof.interpretarCoeficiente(fit.names[i], fit.b[i], fit.p[i], {
      ds: ses.ds, depvar: fit.depvar, mediaDep: media, fit,
      unidad: fit.depvar === 'ingreso' || fit.depvar === 'precio' ? 'dólares' : 'unidades',
    });
    let extra = '';
    if (op.esOR) extra = ' <em>Recuerda: aquí el valor neutro es el 1, no el 0.</em>';
    if (op.esMargins) extra = ` <em>Este número ya está en ${op.link === 'identity' ? 'unidades de la dependiente' : 'puntos de probabilidad'}: es el que se reporta.</em>`;
    return r.texto + extra;
  } catch (e) {
    return 'No pude armar la explicación de esta fila.';
  }
}

// ─────────────────────────────────────────────── correr comandos
function correr(linea, destino = $('#salida'), { eco = true } = {}) {
  if (eco) {
    const e = document.createElement('div');
    e.className = 'entrada-eco';
    e.textContent = linea;
    destino.appendChild(e);
  }
  let bloques;
  try {
    bloques = ejecutarLinea(linea, ses);
  } catch (err) {
    bloques = [{ t: 'err', codigo: 1, mensaje: err.message || 'error inesperado', sugerencia: null }];
  }
  render(bloques, destino);
  destino.scrollTop = destino.scrollHeight;
  ses.registro.push({ linea, bloques });
  anotarRevision(linea, bloques);
  revisarLeccion(linea, bloques);
  pintarEstado();
  pintarVarsLateral();
  if (vistaActual === 'datos') pintarDatos();
  return bloques;
}

// ─────────────────────────────────────────────── ventana de revisión (izquierda)
const revision = [];   // {n, linea, error}

function anotarRevision(linea, bloques) {
  revision.push({ n: revision.length + 1, linea, error: bloques.some((b) => b.t === 'err') });
  pintarRevision();
}

function pintarRevision() {
  const cont = $('#listaRevision');
  if (!cont) return;
  const f = ($('#filtroRev').value || '').toLowerCase();
  const lista = revision.filter((r) => !f || r.linea.toLowerCase().includes(f));
  if (!lista.length) {
    cont.innerHTML = `<div class="panel-vacio">${revision.length ? 'Ningún comando coincide' : 'No hay elementos para mostrar'}</div>`;
    return;
  }
  cont.innerHTML = lista.slice(-300).map((r) =>
    `<div class="rev-item ${r.error ? 'malo' : ''}" data-linea="${esc(r.linea)}" title="${esc(r.linea)}${r.error ? '  (dio error)' : ''}">
      <span class="rn">${r.n}</span><span class="rc">${esc(r.linea)}</span></div>`).join('');
  cont.querySelectorAll('.rev-item').forEach((el) => {
    el.addEventListener('click', () => {
      cambiarVista('consola');
      $('#entrada').value = el.dataset.linea;
      $('#entrada').focus();
    });
    el.addEventListener('dblclick', () => {
      const b = $('.bienvenida'); if (b) b.remove();
      correr(el.dataset.linea, $('#salida'));
    });
  });
  cont.scrollTop = cont.scrollHeight;
}

// ─────────────────────────────────────────────── panel de variables (derecha)
function pintarVarsLateral() {
  const cont = $('#varsLateral');
  if (!cont) return;
  if (!ses.ds.cargado) {
    cont.innerHTML = '<div class="panel-vacio">No hay elementos para mostrar</div>';
    return;
  }
  const f = ($('#filtroVarLat').value || '').toLowerCase();
  const lista = ses.ds.vars.filter((v) => !f || v.name.toLowerCase().includes(f) || (v.label || '').toLowerCase().includes(f));
  if (!lista.length) { cont.innerHTML = '<div class="panel-vacio">Ninguna variable coincide</div>'; return; }
  cont.innerHTML = lista.map((v) =>
    `<div class="var-lat ${v.type === 'string' ? 'texto' : ''}" data-v="${esc(v.name)}" title="${esc(v.name)}${v.label ? ' — ' + esc(v.label) : ''}${v.type === 'string' ? '  (texto: no entra en modelos)' : ''}">
      <span class="vn">${esc(v.name)}</span><span class="ve">${esc(v.label || '')}</span></div>`).join('');
  cont.querySelectorAll('.var-lat').forEach((el) => el.addEventListener('click', () => {
    const inp = $('#entrada');
    inp.value = (inp.value.trim() ? inp.value.replace(/\s+$/, '') + ' ' : '') + el.dataset.v;
    inp.focus();
  }));
}

// ─────────────────────────────────────────────── menús desplegables
const MENUS = {
  graficos: [
    { grupo: 'Una variable' },
    { t: 'Histograma', c: 'histogram ingreso, normal', d: 'forma de la distribución' },
    { t: 'Densidad suavizada', c: 'kdensity ingreso', d: 'versión suave del histograma' },
    { t: 'Normalidad (Q-Q)', c: 'qnorm', d: 'residuos del último modelo' },
    { grupo: 'Dos variables' },
    { t: 'Nube de puntos', c: 'scatter ingreso educ', d: '' },
    { t: 'Nube con recta ajustada', c: 'twoway (scatter ingreso educ) (lfit ingreso educ)', d: 'la recta es la regresión' },
    { grupo: 'Por grupos' },
    { t: 'Cajas por grupo', c: 'graph box ingreso, over(tamano)', d: 'mediana, cuartiles y atípicos' },
    { t: 'Barras de promedios', c: 'graph bar (mean) ingreso, over(tamano)', d: 'con barras de error' },
    { grupo: 'Después de un modelo' },
    { t: 'Residuos vs ajustados', c: 'rvfplot', d: 'detecta heterocedasticidad' },
    { t: 'Curva ROC', c: 'lroc', d: 'después de logit o probit' },
    { t: 'Sensibilidad / especificidad', c: 'lsens', d: 'elegir el punto de corte' },
    { t: 'Gráfico de efectos marginales', c: 'marginsplot', d: 'después de margins' },
  ],
  estadisticas: [
    { grupo: 'Descriptivas' },
    { t: 'Resumen', c: 'summarize ingreso educ exper', d: 'media, desviación, mín y máx' },
    { t: 'Resumen detallado', c: 'summarize ingreso, detail', d: 'con percentiles y asimetría' },
    { t: 'Tabla de frecuencias', c: 'tab tamano', d: '' },
    { t: 'Tabla cruzada con chi²', c: 'tab tamano formal, row chi2', d: '' },
    { t: 'Estadísticos por grupo', c: 'tabstat ingreso, by(tamano) stats(n mean sd)', d: '' },
    { t: 'Correlaciones', c: 'correlate ingreso educ exper horas', d: '' },
    { grupo: 'Pruebas de medias' },
    { t: 'Prueba t entre dos grupos', c: 'ttest ingreso, by(mujer)', d: '' },
    { t: 'ANOVA de una vía', c: 'oneway ingreso tamano, tabulate bonferroni', d: 'con comparaciones post-hoc' },
    { t: 'Igualdad de varianzas', c: 'robvar ingreso, by(tamano)', d: 'prueba de Levene' },
    { grupo: 'Normalidad' },
    { t: 'Shapiro-Wilk', c: 'swilk u', d: 'antes: predict u, resid' },
    { t: 'Asimetría y curtosis', c: 'sktest u', d: 'antes: predict u, resid' },
    { grupo: 'Supuestos del modelo' },
    { t: 'Multicolinealidad (VIF)', c: 'estat vif', d: '' },
    { t: 'Heterocedasticidad', c: 'estat hettest', d: 'Breusch-Pagan' },
    { t: 'Prueba de White', c: 'estat imtest, white', d: '' },
    { t: 'Forma funcional (RESET)', c: 'estat ovtest', d: '' },
    { t: 'Especificación', c: 'linktest', d: '_hatsq no debe ser significativa' },
    { grupo: 'Después de un modelo' },
    { t: 'Efectos marginales', c: 'margins, dydx(*)', d: 'obligatorio tras logit/probit' },
    { t: 'Medias ajustadas por grupo', c: 'margins tamano', d: '' },
    { t: 'Combinación no lineal', c: 'nlcom -_b[exper]/(2*_b[exper2])', d: 'punto de giro de un cuadrático' },
    { t: 'Comparaciones por pares', c: 'pwcompare tamano, mcompare(bonferroni)', d: '' },
    { t: 'Clasificación', c: 'estat classification', d: 'sensibilidad y especificidad' },
    { t: 'Bondad de ajuste', c: 'estat gof, group(10)', d: 'Hosmer-Lemeshow' },
    { t: 'Supuesto IIA', c: 'mlogtest, hausman', d: 'después de mlogit' },
  ],
  ventana: [
    { grupo: 'Paneles' },
    { t: 'Ventana de revisión', accion: () => alternarPanel('panelRevision'), d: 'historial de comandos' },
    { t: 'Panel de variables', accion: () => alternarPanel('panelVariables'), d: 'lista de columnas' },
    { grupo: 'Sesión' },
    { t: 'Limpiar la consola', accion: () => { $('#salida').innerHTML = ''; }, d: '' },
    { t: 'Descargar el log', accion: () => descargarTexto('sesion_stataprofe.txt', logCompleto()), d: '' },
    { t: 'Exportar los datos a CSV', accion: () => descargarCSV(), d: '' },
  ],
};

function abrirMenu(nombre, boton) {
  const caja = $('#menuDesplegable');
  if (caja.classList.contains('abierto') && caja.dataset.menu === nombre) { cerrarMenu(); return; }
  const items = MENUS[nombre] || [];
  caja.dataset.menu = nombre;
  caja.innerHTML = items.map((it, k) => {
    if (it.grupo) return `<div class="md-grupo">${esc(it.grupo)}</div>`;
    return `<button class="md-item" data-k="${k}">${esc(it.t)}${it.d ? `<small>${it.c ? esc(it.c) : esc(it.d)}</small>` : ''}</button>`;
  }).join('');
  caja.querySelectorAll('.md-item').forEach((el) => el.addEventListener('click', () => {
    const it = items[Number(el.dataset.k)];
    cerrarMenu();
    if (it.accion) { it.accion(); return; }
    cambiarVista('consola');
    $('#entrada').value = it.c;
    $('#entrada').focus();
    toast('Comando listo: revísalo y dale Enter');
  }));
  const r = boton.getBoundingClientRect();
  caja.style.left = Math.min(r.left, innerWidth - 280) + 'px';
  caja.style.top = r.bottom + 'px';
  caja.classList.add('abierto');
  $$('.menu-btn').forEach((b) => b.classList.toggle('abierto', b.dataset.menu === nombre));
}
function cerrarMenu() {
  $('#menuDesplegable').classList.remove('abierto');
  $$('.menu-btn').forEach((b) => b.classList.remove('abierto'));
}
function alternarPanel(id) {
  const p = $('#' + id);
  p.classList.toggle('oculto');
  const b = document.querySelector(`.be-paneles button[data-abrir="${id}"]`);
  if (b) b.classList.toggle('escondido', !p.classList.contains('oculto'));
}

// ─────────────────────────────────────────────── estado y datos
function pintarEstado() {
  const e = $('#estadoBase');
  if (!ses.ds.cargado) { e.textContent = 'sin base abierta'; e.classList.remove('viva'); return; }
  e.textContent = `${ses.ds.nombre || 'datos'} · ${ses.ds.n} obs · ${ses.ds.vars.length} variables`;
  e.classList.add('viva');
}

let varSeleccionada = null;
function pintarDatos() {
  const info = $('#datosInfo');
  const panel = $('#panelVars');
  const tabla = $('#tablaDatos');
  if (!ses.ds.cargado) {
    info.textContent = 'Abre una base para verla aquí.';
    panel.innerHTML = ''; tabla.innerHTML = '';
    return;
  }
  const ds = ses.ds;
  info.textContent = `${ds.nombre || 'datos'} — ${ds.n} observaciones, ${ds.vars.length} variables`;
  const filtro = ($('#filtroVar').value || '').toLowerCase();
  panel.innerHTML = ds.vars
    .filter((v) => !filtro || v.name.toLowerCase().includes(filtro) || (v.label || '').toLowerCase().includes(filtro))
    .map((v) => {
      const falt = ds.contarFaltantes(v.name);
      return `<div class="var-item ${varSeleccionada === v.name ? 'sel' : ''}" data-v="${esc(v.name)}">
        <div class="vn">${esc(v.name)}</div>
        <div class="vl">${esc(v.label || '(sin etiqueta)')}</div>
        <div class="vt">${v.type === 'string' ? 'texto' : 'número'}${falt ? ` · <span class="vfalta">${falt} vacíos</span>` : ''}</div>
      </div>`;
    }).join('');
  panel.querySelectorAll('.var-item').forEach((el) => {
    el.addEventListener('click', () => {
      varSeleccionada = el.dataset.v;
      pintarDatos();
    });
  });

  const cols = ds.vars.slice(0, 14).map((v) => v.name);
  const n = Math.min(ds.n, 200);
  let html = '<table class="datos"><thead><tr><th>#</th>' +
    cols.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < n; i++) {
    html += `<tr><td>${i + 1}</td>` + cols.map((c) => {
      const v = ds.cols[c][i];
      if (esNulo(v) || v === '') return '<td class="falta">.</td>';
      const et = ds.etiquetaDe(c, v);
      if (et) return `<td>${esc(et)}</td>`;
      return typeof v === 'number' ? `<td class="num">${esc(fmtG(v, 6))}</td>` : `<td>${esc(v)}</td>`;
    }).join('') + '</tr>';
  }
  html += '</tbody></table>';
  if (ds.n > n) html += `<p class="mini" style="padding:10px 14px">Se muestran las primeras ${n} de ${ds.n} filas.</p>`;
  if (ds.vars.length > 14) html += `<p class="mini" style="padding:0 14px 14px">Se muestran 14 de ${ds.vars.length} columnas. Usa <code>list</code> para ver otras.</p>`;
  tabla.innerHTML = html;
}

// ─────────────────────────────────────────────── curso
function moduloDesbloqueado(m) {
  return m.requiere.every((id) => {
    const mod = MODULOS.find((x) => x.id === id);
    return mod && mod.lecciones.every((l) => progreso.hechas.includes(l.id));
  });
}
function primeraPendiente() {
  for (const m of MODULOS) {
    if (!moduloDesbloqueado(m)) continue;
    for (const l of m.lecciones) if (!progreso.hechas.includes(l.id)) return { m, l };
  }
  return null;
}

function pintarCurso() {
  const total = totalLecciones();
  const hechas = progreso.hechas.length;
  const niv = nivelDe(progreso.xp);
  const sig = NIVELES.find((v) => v.xpMin > progreso.xp);
  $('#nivelNombre').textContent = niv.nombre;
  $('#nivelXP').textContent = `${progreso.xp} XP${sig ? ` · faltan ${sig.xpMin - progreso.xp} para ${sig.nombre}` : ''}`;
  $('#progFill').style.width = `${(hechas / total) * 100}%`;
  $('#progTxt').textContent = `${hechas} de ${total} lecciones`;
  $('#insignias').innerHTML = INSIGNIAS.map((b) =>
    `<span class="insig ${progreso.insignias.includes(b.id) ? 'ganada' : ''}" title="${esc(b.nombre)}: ${esc(b.desc)}">${b.icono}</span>`).join('');

  const pend = primeraPendiente();
  $('#pipCurso').classList.toggle('on', !!pend);

  $('#cursoCuerpo').innerHTML = MODULOS.map((m) => {
    const libre = moduloDesbloqueado(m);
    const hechasM = m.lecciones.filter((l) => progreso.hechas.includes(l.id)).length;
    const completo = hechasM === m.lecciones.length;
    const abierto = pend && pend.m.id === m.id;
    return `<div class="modulo ${libre ? '' : 'bloqueado'} ${abierto ? 'abierto' : ''}" data-m="${m.id}">
      <div class="mod-cab">
        <span class="mod-icono">${m.icono}</span>
        <div class="mod-txt"><b>${esc(m.titulo)}</b><small>${esc(m.subtitulo)}</small></div>
        <div class="mod-prog">${hechasM}/${m.lecciones.length}${completo ? ' ✓' : ''}</div>
        <span class="mod-candado">${libre ? (completo ? '🏅' : '') : '🔒'}</span>
      </div>
      <div class="mod-lecciones">
        ${libre ? m.lecciones.map((l) => {
          const hecha = progreso.hechas.includes(l.id);
          const actual = pend && pend.l.id === l.id;
          return `<div class="lec ${hecha ? 'hecha' : ''} ${actual ? 'actual' : ''}" data-l="${l.id}">
            <span class="lec-check">${hecha ? '✅' : (actual ? '▶' : '○')}</span>
            <div class="lec-txt"><b>${esc(l.titulo)}</b><small>${esc(l.objetivo)}</small></div>
            <span class="lec-xp">+${l.xp}</span>
          </div>`;
        }).join('')
        : `<div class="lec"><span class="lec-check">🔒</span><div class="lec-txt"><small>Termina el módulo anterior para desbloquear este.</small></div></div>`}
      </div>
    </div>`;
  }).join('');

  $$('.mod-cab').forEach((c) => c.addEventListener('click', () => c.parentElement.classList.toggle('abierto')));
  $$('.lec[data-l]').forEach((el) => el.addEventListener('click', () => abrirLeccion(el.dataset.l)));
}

let leccionActiva = null;
let pistasMostradas = 0;

function abrirLeccion(id) {
  const enc = buscarLeccion(id);
  if (!enc) return;
  leccionActiva = enc;
  pistasMostradas = 0;
  progreso.leccionActual = id;
  escribir(K.progreso, progreso);
  $('#lpModulo').textContent = `${enc.modulo.icono} ${enc.modulo.titulo}`;
  $('#lpTitulo').textContent = enc.leccion.titulo;
  $('#lpCuerpo').innerHTML = `
    <div class="lp-objetivo">${esc(enc.leccion.objetivo)}</div>
    <div class="lp-teoria">${enc.leccion.teoria}</div>
    <div class="lp-tarea"><span class="et">Tu turno</span>${enc.leccion.tarea}</div>
    <div id="lpExtra"></div>`;
  $('#leccionPanel').classList.add('abierto');
  if (vistaActual === 'curso') cambiarVista(enc.leccion.validar && enc.leccion.validar.esDoFile ? 'dofile' : 'consola');
}
function cerrarLeccion() {
  $('#leccionPanel').classList.remove('abierto');
  leccionActiva = null;
}

// ─────────────────────────────────────────────── validación de lecciones
function normaliza(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

function cumple(v, linea, bloques) {
  if (!v) return false;
  const hayError = bloques.some((b) => b.t === 'err');
  if (hayError) return false;
  const norm = normaliza(linea);

  if (v.esComentario) return /^\s*\*/.test(linea);

  if (v.comandos && v.comandos.length) {
    // se compara con el comando que el motor reconoció, no con el texto
    const reg = ses.registro[ses.registro.length - 1];
    void reg;
    const primeraPalabra = norm.split(/[\s,]/)[0];
    const info = COMANDOS.find((c) => c.n === primeraPalabra) ||
      COMANDOS.find((c) => c.n.startsWith(primeraPalabra) && primeraPalabra.length >= c.min);
    const alias = { g: 'generate', gen: 'generate', d: 'describe', l: 'list', su: 'summarize',
      sum: 'summarize', ta: 'tabulate', tab: 'tabulate', di: 'display', reg: 'regress',
      corr: 'correlate', hist: 'histogram', tw: 'twoway', gr: 'graph', mi: 'misstable',
      bys: 'bysort', qui: 'quietly', ren: 'rename', sc: 'scatter' };
    const canon = alias[primeraPalabra] || (info ? info.n : primeraPalabra);
    if (!v.comandos.includes(canon)) return false;
  }
  if (v.variables) {
    for (const nm of v.variables) if (!new RegExp(`\\b${nm}\\b`).test(linea)) return false;
  }
  if (v.contiene) {
    for (const c of v.contiene) if (!linea.toLowerCase().includes(c.toLowerCase())) return false;
  }
  if (v.minVariables) {
    const sinOpciones = linea.split(',')[0];
    const toks = sinOpciones.trim().split(/\s+/).slice(1).filter(Boolean);
    if (toks.length < v.minVariables) return false;
  }
  if (v.creaVariable && !ses.ds.existe(v.creaVariable)) return false;
  return true;
}

function revisarLeccion(linea, bloques, esDo = false) {
  if (!leccionActiva) return;
  const v = leccionActiva.leccion.validar || {};
  if (v.esDoFile && !esDo) return;
  if (!v.esDoFile && esDo) { /* también vale hacerlo en el do-file */ }
  if (!cumple(v, linea, bloques)) return;
  completarLeccion();
}

function completarLeccion() {
  const { leccion, modulo } = leccionActiva;
  if (progreso.hechas.includes(leccion.id)) return;
  progreso.hechas.push(leccion.id);
  progreso.xp += leccion.xp;

  // insignias
  for (const b of INSIGNIAS) {
    if (progreso.insignias.includes(b.id)) continue;
    if (b.modulo) {
      const m = MODULOS.find((x) => x.id === b.modulo);
      if (m && m.lecciones.every((l) => progreso.hechas.includes(l.id))) {
        progreso.insignias.push(b.id);
        toast(`${b.icono} Insignia nueva: ${b.nombre}`);
      }
    } else if (b.id === 'primer_uso' && progreso.hechas.length >= 1) {
      progreso.insignias.push(b.id);
    }
  }
  escribir(K.progreso, progreso);

  const extra = $('#lpExtra');
  if (extra) {
    extra.innerHTML = `<div class="lp-exito"><span class="et">🎉</span>${esc(leccion.felicitacion)}
      <div style="margin-top:10px"><button class="btn" id="btnSiguiente">Siguiente lección →</button></div></div>`;
    extra.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const bs = $('#btnSiguiente');
    if (bs) bs.addEventListener('click', () => {
      const p = primeraPendiente();
      if (p) abrirLeccion(p.l.id);
      else { cerrarLeccion(); cambiarVista('curso'); toast('🎓 ¡Terminaste todo el curso!'); }
    });
  }
  toast(`+${leccion.xp} XP · ${leccion.titulo} ✓`);
  pintarCurso();
  void modulo;
}

// ─────────────────────────────────────────────── autocompletar
const TODOS_CMD = COMANDOS.map((c) => ({ n: c.n, a: c.ayuda }));
function actualizarAuto() {
  const val = $('#entrada').value;
  const caja = $('#autocompletar');
  const trozo = val.split(/[\s,]/).pop();
  const primera = val.trim().split(/\s+/)[0];
  let items = [];
  if (!val.trim() || val.trim() === primera) {
    items = TODOS_CMD.filter((c) => c.n.startsWith(val.trim().toLowerCase()))
      .slice(0, 8).map((c) => ({ txt: c.n, ayuda: c.a, reemplazaTodo: true }));
  } else if (trozo && trozo.length >= 1 && ses.ds.cargado) {
    items = ses.ds.nombres().filter((v) => v.toLowerCase().startsWith(trozo.toLowerCase()))
      .slice(0, 8).map((v) => ({ txt: v, ayuda: ses.ds.meta(v).label || '', reemplazaTodo: false }));
  }
  if (!items.length) { caja.classList.remove('abierto'); return; }
  caja.innerHTML = items.map((i, k) =>
    `<div class="ac-item ${k === 0 ? 'sel' : ''}" data-t="${esc(i.txt)}" data-todo="${i.reemplazaTodo}"><b>${esc(i.txt)}</b><small>${esc(i.ayuda)}</small></div>`).join('');
  caja.classList.add('abierto');
  caja.querySelectorAll('.ac-item').forEach((el) => el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    aplicarAuto(el.dataset.t, el.dataset.todo === 'true');
  }));
}
function aplicarAuto(txt, todo) {
  const inp = $('#entrada');
  if (todo) inp.value = txt + ' ';
  else {
    const partes = inp.value.split(/(\s|,)/);
    for (let i = partes.length - 1; i >= 0; i--) {
      if (partes[i].trim() && partes[i] !== ',') { partes[i] = txt; break; }
    }
    inp.value = partes.join('');
  }
  $('#autocompletar').classList.remove('abierto');
  inp.focus();
}

// ─────────────────────────────────────────────── utilidades UI
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('ver');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('ver'), 2600);
}

function cambiarVista(v) {
  vistaActual = v;
  $$('.vista').forEach((s) => s.classList.toggle('activa', s.id === 'v-' + v));
  $$('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === v));
  if (v === 'datos') pintarDatos();
  if (v === 'curso') pintarCurso();
  if (v === 'modelos') pintarModelos();
  if (v === 'empezar') pintarGuia();
  if (v === 'ayuda') pintarAyuda();
  if (v === 'consola') setTimeout(() => $('#entrada').focus(), 60);
}

function descargarTexto(nombre, contenido, tipo = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo + ';charset=utf-8' }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function descargarCSV() {
  const ds = ses.ds;
  if (!ds.cargado) { toast('No hay datos abiertos'); return; }
  const nombres = ds.nombres();
  const lineas = [nombres.join(',')];
  for (let i = 0; i < ds.n; i++) {
    lineas.push(nombres.map((nm) => {
      const v = ds.cols[nm][i];
      if (esNulo(v) || v === '') return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  descargarTexto(`${ds.nombre || 'datos'}.csv`, lineas.join('\n'), 'text/csv');
}

function logCompleto() {
  const L = ['StataProfe — registro de la sesión', '='.repeat(50), ''];
  for (const r of ses.registro) {
    L.push('. ' + r.linea);
    for (const b of r.bloques) {
      if (b.t === 'txt') L.push(b.s);
      else if (b.t === 'ok' || b.t === 'aviso') L.push('  ' + b.s.replace(/<[^>]+>/g, ''));
      else if (b.t === 'err') L.push(`  ERROR r(${b.codigo}): ${b.mensaje}`);
      else if (b.t === 'coef') {
        L.push(b.fit.names.map((n, i) =>
          `  ${n.padEnd(16)} ${String(fmtG(b.fit.b[i], 6)).padStart(12)} ${String(fmtP(b.fit.p[i])).padStart(8)}`).join('\n'));
      } else if (b.t === 'profe') {
        L.push('  [profe] ' + (b.bloque.resumen || b.bloque.titulo || '').replace(/<[^>]+>/g, ''));
      }
    }
    L.push('');
  }
  return L.join('\n');
}

// ─────────────────────────────────────────────── CSV de la usuaria
function parsearCSV(texto, nombre) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) throw new Error('el archivo está vacío');
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';'
    : ((lineas[0].match(/\t/g) || []).length > 0 ? '\t' : ',');
  const partir = (l) => {
    const out = []; let cur = '', dentro = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (dentro && l[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
      else if (c === sep && !dentro) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const cab = partir(lineas[0]).map((h, i) => {
    let s = h.replace(/[^\wáéíóúñÁÉÍÓÚÑ]/g, '_').replace(/^_+|_+$/g, '');
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!s || /^\d/.test(s)) s = 'v' + (i + 1);
    return s.slice(0, 32);
  });
  const filas = lineas.slice(1).map(partir);
  const data = {}, vars = [];
  cab.forEach((nm, j) => {
    const col = filas.map((f) => (f[j] === undefined ? '' : f[j]));
    const noVacios = col.filter((v) => v !== '' && v.toUpperCase() !== 'NA' && v !== '.');
    const numerico = noVacios.length > 0 && noVacios.every((v) => {
      const s = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) ? v.replace(/\./g, '').replace(',', '.')
        : (/^-?\d+,\d+$/.test(v) ? v.replace(',', '.') : v);
      return !isNaN(Number(s));
    });
    if (numerico) {
      data[nm] = col.map((v) => {
        if (v === '' || v.toUpperCase() === 'NA' || v === '.') return null;
        const s = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) ? v.replace(/\./g, '').replace(',', '.')
          : (/^-?\d+,\d+$/.test(v) ? v.replace(',', '.') : v);
        return Number(s);
      });
      vars.push({ name: nm, type: 'numeric', label: cab[j] === nm ? '' : cab[j], vallab: null, format: '%9.0g' });
    } else {
      data[nm] = col.map((v) => (v === 'NA' ? '' : v));
      vars.push({ name: nm, type: 'string', label: '', vallab: null, format: '%14s' });
    }
  });
  return { nombre, n: filas.length, vars, data, valueLabels: {}, notas: `Archivo subido por ti: ${nombre}` };
}

// ─────────────────────────────────────────────── modo guiado "no sé por dónde empezar"
const guia = { y: null, clas: null, xs: [] };

function pintarGuia() {
  const c = $('#guiaCuerpo');
  const partes = [`<div class="guia-doc">
    <div class="guia-hola">
      <h1>¿No sabes por dónde empezar?</h1>
      <p>Dime qué quieres explicar y yo miro <strong>tus datos de verdad</strong> para decirte qué modelo va, por qué, y qué escribir. Después te acompaño paso a paso.</p>
    </div>`];

  // ── paso 1: la base
  if (!ses.ds.cargado) {
    partes.push(`<div class="guia-paso">
      <div class="gp-cab"><span class="gp-n">1</span><b>Primero abre una base</b></div>
      <div class="gp-ayuda">Elige con cuál quieres trabajar. Si tienes tus propios datos, usa el botón <strong>📤 Abrir</strong> de arriba para subir un CSV.</div>
      <div class="gp-opciones">${CATALOGO.map((b) => `
        <button class="gp-op" data-base="${esc(b.nombre)}">
          <b>${esc(b.nombre)}</b><small>${esc(b.desc)}</small>
          <span class="tipo">${b.obs} observaciones</span></button>`).join('')}</div>
    </div></div>`);
    c.innerHTML = partes.join('');
    c.querySelectorAll('[data-base]').forEach((el) => el.addEventListener('click', () => {
      correr(`use ${el.dataset.base}, clear`, $('#salida'), { eco: false });
      guia.y = null; guia.clas = null; guia.xs = [];
      pintarGuia();
      toast(`Base abierta: ${ses.ds.n} observaciones`);
    }));
    return;
  }

  partes.push(`<div class="guia-paso">
    <div class="gp-cab"><span class="gp-n">✓</span><b>Base abierta: ${esc(ses.ds.nombre)}</b></div>
    <div class="gp-ayuda">${ses.ds.n} observaciones y ${ses.ds.vars.length} variables. Si quieres otra, ábrela desde la pestaña Consola con <code>use</code>.</div>
  </div>`);

  // ── paso 2: qué quiere explicar
  const candidatas = ses.ds.vars.filter((v) => !['id', 'hogar', 'empresa'].includes(v.name));
  partes.push(`<div class="guia-paso">
    <div class="gp-cab"><span class="gp-n">2</span><b>¿Qué quieres explicar?</b></div>
    <div class="gp-ayuda">Esta es la variable que va del lado izquierdo, la que quieres entender. <strong>Solo esto decide qué modelo va.</strong></div>
    <div class="gp-opciones">${candidatas.map((v) => `
      <button class="gp-op ${guia.y === v.name ? 'marcada' : ''}" data-y="${esc(v.name)}">
        <b>${esc(v.name)}</b><small>${esc(v.label || '')}</small></button>`).join('')}</div>
  </div>`);

  // ── paso 3: el veredicto
  if (guia.clas) {
    const k = guia.clas;
    if (!k.puedeSerY) {
      partes.push(`<div class="guia-paso">
        <div class="gp-cab"><span class="gp-n">3</span><b>Esta variable todavía no sirve</b></div>
        <div class="veredicto"><div class="vt">${esc(k.titulo)}</div><div class="vp">${k.porque}</div></div>
        <div class="guia-arreglo">${k.arreglo.texto}<pre>${esc(k.arreglo.comando)}</pre>
          <div class="guia-acciones"><button class="btn" data-correr="${esc(k.arreglo.comando)}">▶ Arreglarlo ahora</button></div></div>
      </div>`);
    } else {
      partes.push(`<div class="guia-paso">
        <div class="gp-cab"><span class="gp-n">3</span><b>Entonces te toca este modelo</b></div>
        <div class="veredicto">
          <div class="vt">${esc(k.titulo)}</div>
          <div class="vp">${k.porque}</div>
          <span class="vmod"><span class="vn">${k.numeroModelo}</span>${esc(k.modelo)}</span>
        </div>
        ${k.ojo ? `<div class="guia-ojo"><strong>Ojo:</strong> ${k.ojo}</div>` : ''}
        ${k.arreglo ? `<div class="guia-arreglo">${k.arreglo.texto}<pre>${esc(k.arreglo.comando)}</pre>
          <div class="guia-acciones"><button class="btn sec" data-correr="${esc(k.arreglo.comando.split('\n')[0])}">▶ Hacerlo ahora</button></div></div>` : ''}
        ${(k.alternativas || []).length ? `<div class="gp-ayuda" style="margin-top:10px">También podrías usar:</div>
          <div class="guia-alt">${k.alternativas.map((a) => `<button class="a" data-ir="${a.n}">${esc(a.nombre)} — ${esc(a.cuando)}</button>`).join('')}</div>` : ''}
        <div class="gp-ayuda" style="margin-top:10px">${k.faltan ? `Ojo: <code>${esc(guia.y)}</code> tiene <strong>${k.faltan} valores faltantes</strong> que van a quedar fuera del modelo.` : `Sin valores faltantes: entran las ${k.n} observaciones.`}</div>
      </div>`);

      // ── paso 4: con qué
      const sug = sugerirX(ses.ds, guia.y);
      partes.push(`<div class="guia-paso">
        <div class="gp-cab"><span class="gp-n">4</span><b>¿Con qué lo quieres explicar?</b></div>
        <div class="gp-ayuda">Marca las que creas que influyen. Mete las que la teoría pide, aunque después salgan no significativas: eso también es un resultado.</div>
        <div class="gp-opciones">${sug.map((v) => `
          <button class="gp-op ${guia.xs.some((x) => x.nombre === v.nombre) ? 'marcada' : ''}" data-x="${esc(v.nombre)}">
            <b>${esc(v.comoSeEscribe)}</b><small>${esc(v.etiqueta || '')}</small>
            ${v.aviso ? `<span class="tipo">${v.aviso.replace(/<[^>]+>/g, '')}</span>` : ''}</button>`).join('')}</div>
        ${guia.xs.length ? `<div class="guia-acciones">
          <button class="btn" id="btnArmarPlan">📄 Ármame el do-file y guíame paso a paso</button>
        </div>` : '<div class="gp-ayuda" style="margin-top:10px">Marca al menos una para continuar.</div>'}
      </div>`);
    }
  }

  partes.push('</div>');
  c.innerHTML = partes.join('');

  c.querySelectorAll('[data-y]').forEach((el) => el.addEventListener('click', () => {
    guia.y = el.dataset.y;
    guia.clas = clasificarY(ses.ds, guia.y);
    guia.xs = [];
    pintarGuia();
  }));
  c.querySelectorAll('[data-x]').forEach((el) => el.addEventListener('click', () => {
    const nombre = el.dataset.x;
    const i = guia.xs.findIndex((x) => x.nombre === nombre);
    if (i >= 0) guia.xs.splice(i, 1);
    else guia.xs.push(sugerirX(ses.ds, guia.y).find((v) => v.nombre === nombre));
    pintarGuia();
  }));
  c.querySelectorAll('[data-correr]').forEach((el) => el.addEventListener('click', () => {
    correrBloque(el.dataset.correr);
    setTimeout(() => {
      if (guia.y && ses.ds.existe(guia.y)) guia.clas = clasificarY(ses.ds, guia.y);
      pintarGuia();
    }, 30);
  }));
  c.querySelectorAll('[data-ir]').forEach((el) => el.addEventListener('click', () => {
    cambiarVista('modelos');
    const m = MODELOS_CATALOGO.find((x) => x.n === Number(el.dataset.ir));
    const t = m && $('#mod-' + m.id);
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.classList.add('resaltado'); setTimeout(() => t.classList.remove('resaltado'), 1600); }
  }));
  const bp = $('#btnArmarPlan');
  if (bp) bp.addEventListener('click', () => {
    const plan = armarPlan(ses.ds, guia.y, guia.xs, guia.clas);
    cargarPlanGuiado(plan);
  });
}

/** Mete un do-file hecho a la medida en el editor, con sus pasos. */
function cargarPlanGuiado(plan) {
  doActivo = plan;
  seccionesHechas.clear();
  editor.value = textoCompleto(plan);
  editor.dataset.deBiblioteca = 'guiado';
  escribir(K.dofile, editor.value);
  escribir(K.doActivo, null);
  $('#doNombre').textContent = plan.nombre;
  $('#doResumen').innerHTML = `${esc(plan.resumen)} &nbsp;·&nbsp; base <code>${esc(plan.base)}</code>`;
  $('#salidaDo').innerHTML = '';
  pintarNavSecciones();
  cambiarVista('dofile');
  toast(`Do-file armado: ${plan.secciones.length} pasos. Dale ▶ al primero.`);
}

// ─────────────────────────────────────────────── catálogo de modelos
let famActiva = 'todas';

function pintarModelos() {
  const familias = ['todas', ...new Set(MODELOS_CATALOGO.map((m) => m.familia))];
  $('#filtroFam').innerHTML = familias.map((f) =>
    `<button class="chip-fam ${f === famActiva ? 'on' : ''}" data-f="${esc(f)}">${f === 'todas' ? 'Todos' : esc(f)}</button>`).join('');
  $$('#filtroFam .chip-fam').forEach((b) => b.addEventListener('click', () => { famActiva = b.dataset.f; pintarModelos(); }));

  const lista = MODELOS_CATALOGO.filter((m) => famActiva === 'todas' || m.familia === famActiva);
  const arbol = `<div class="regla">
      <div class="regla-tit">🧭 ${esc(REGLA.titulo)}</div>
      <p>${REGLA.texto}</p>
      <div class="regla-tabla">
        ${REGLA.ramas.map((r) => `<div class="rama">
          <div class="rama-y"><b>${esc(r.y)}</b><small>${esc(r.ej)}</small></div>
          <div class="rama-flecha">→</div>
          <div class="rama-m">
            <b>${esc(r.modelo)}</b>
            <div class="rama-nums">${r.n.map((n) => `<button class="num-ir" data-ir="${n}">${n}</button>`).join('')}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;

  const tarjetas = lista.map((m) => {
    const dif = NIVELES_DIF[m.nivel];
    return `<article class="mcard" id="mod-${m.id}" data-n="${m.n}">
      <header class="mcard-cab">
        <span class="mcard-n">${m.n}</span>
        <div class="mcard-tit">
          <b>${esc(m.nombre)}</b>
          <small>${esc(m.familia)}</small>
        </div>
        <span class="mcard-dif ${dif.color}">${'●'.repeat(m.nivel)}${'○'.repeat(5 - m.nivel)} ${esc(dif.nombre)}</span>
      </header>
      <div class="mcard-cuerpo">
        <div class="mcard-preg">${esc(m.pregunta)}</div>
        <div class="mcard-ej">Por ejemplo: <em>${esc(m.ejemplo)}</em></div>
        <div class="mcard-nec"><span class="et">Necesitas</span>${m.necesitas}</div>

        <div class="mcard-cmd">
          <div class="cmd-barra">
            <span class="et">Comandos</span>
            <span class="cmd-btns">
              <button class="btn-mini correr" data-cmd="${esc(m.comandos)}">▶ Correr el ejemplo</button>
              <button class="btn-mini copiar" data-cmd="${esc(m.comandos)}">Copiar</button>
              <button class="btn-mini aldo" data-cmd="${esc(m.comandos)}">Al do-file</button>
            </span>
          </div>
          <pre>${esc(m.comandos)}</pre>
        </div>

        <div class="mcard-lec"><span class="et">Cómo se lee</span>${m.lectura}</div>
        <div class="mcard-ojo"><span class="et">Ojo con esto</span>${m.ojo}</div>
        ${m.despues && m.despues.length ? `<div class="mcard-desp"><span class="et">Qué correr después</span>
          ${m.despues.map((d) => `<button class="sug" data-cmd="${esc(d)}">${esc(d)}</button>`).join('')}</div>` : ''}
        ${m.cuandoNo ? `<div class="mcard-no"><span class="et">Cuándo NO usarlo</span>${m.cuandoNo}</div>` : ''}
      </div>
    </article>`;
  }).join('');

  const primos = `<div class="primos">
    <h3>Los primos más especializados</h3>
    <p class="mini">No es que estos sean "mejores". Es que los modelos base hacen suposiciones de simplicidad para poder calcularse rápido; estos sueltan una de esas suposiciones cuando tú sabes que no aplica a tus datos.</p>
    ${PRIMOS.map((p) => `<div class="primo ${p.enSimulador ? 'hay' : ''}">
      <div class="primo-cab"><b>${esc(p.nombre)}</b> <code>${esc(p.comando)}</code>
        <span class="primo-tag">${p.enSimulador ? '✓ está en el simulador' : 'solo en Stata real'}</span></div>
      <div class="primo-cuando"><b>Cuándo:</b> ${esc(p.cuando)}</div>
      <div class="primo-porque">${esc(p.porque)}</div>
    </div>`).join('')}
  </div>`;

  const supuestos = `<div class="supuestos-caja">
    <h3>Después de cualquier modelo lineal, siempre lo mismo</h3>
    <p class="mini">Los cuatro chequeos van igual para los modelos 1 a 9. Stata siempre te da una tabla bonita, esté bien o mal usado el modelo: por eso hay que revisar.</p>
    <div class="mcard-cmd">
      <div class="cmd-barra"><span class="et">Bloque de supuestos</span>
        <span class="cmd-btns"><button class="btn-mini correr" data-cmd="${esc(SUPUESTOS_MCO)}">▶ Correr</button>
        <button class="btn-mini aldo" data-cmd="${esc(SUPUESTOS_MCO)}">Al do-file</button></span></div>
      <pre>${esc(SUPUESTOS_MCO)}</pre>
    </div>
    <p class="mini">Y después de un logit o probit, el bloque es otro: <code>margins, dydx(*)</code> · <code>estat classification</code> · <code>lroc</code> · <code>estat gof</code>.</p>
  </div>`;

  $('#modelosCuerpo').innerHTML = `<div class="modelos-doc">${arbol}${tarjetas}${supuestos}${primos}</div>`;

  // acciones
  $$('#modelosCuerpo .correr').forEach((b) => b.addEventListener('click', () => correrBloque(b.dataset.cmd)));
  $$('#modelosCuerpo .copiar').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.cmd); toast('Copiado'); }
    catch { toast('No pude copiar; selecciónalo a mano'); }
  }));
  $$('#modelosCuerpo .aldo').forEach((b) => b.addEventListener('click', () => {
    const sep = editor.value.trim() ? '\n\n' : '';
    editor.value = editor.value + sep + b.dataset.cmd + '\n';
    escribir(K.dofile, editor.value);
    cambiarVista('dofile');
    editor.scrollTop = editor.scrollHeight;
    toast('Agregado al do-file');
  }));
  $$('#modelosCuerpo .num-ir').forEach((b) => b.addEventListener('click', () => {
    famActiva = 'todas';
    pintarModelos();
    const m = MODELOS_CATALOGO.find((x) => x.n === Number(b.dataset.ir));
    const el = $('#mod-' + m.id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('resaltado'); setTimeout(() => el.classList.remove('resaltado'), 1600); }
  }));
}

/** Corre un bloque de varias líneas en la consola, mostrando cada una. */
function correrBloque(texto) {
  cambiarVista('consola');
  const b = $('.bienvenida'); if (b) b.remove();
  const salida = $('#salida');
  const lineas = texto.split('\n').filter((l) => l.trim());
  for (const l of lineas) {
    const res = correr(l, salida);
    if (res.some((x) => x.t === 'err')) break;
  }
  salida.scrollTop = salida.scrollHeight;
}

// ─────────────────────────────────────────────── ayuda
function pintarAyuda() {
  if ($('#ayudaCuerpo').dataset.listo) return;
  const porCat = {};
  for (const c of COMANDOS) { (porCat[c.cat] = porCat[c.cat] || []).push(c); }
  const nombres = { datos: 'Abrir y manejar datos', desc: 'Estadística descriptiva', modelo: 'Modelos',
    post: 'Después del modelo', graf: 'Gráficos', sistema: 'Sistema' };
  $('#ayudaCuerpo').innerHTML = `<div class="doc">
    <h2>Cómo funciona esto</h2>
    <p>Escribe comandos de Stata en la consola. <strong>Se ejecutan de verdad</strong>: cada número sale de un cálculo real sobre los datos que tengas abiertos, no de un ejemplo guardado.</p>
    <p>Si escribes algo mal, no te sale un error seco: te digo <strong>qué falta y cómo debería ir</strong>. Y cuando salga un resultado, te lo interpreto: qué significa el coeficiente, si es significativo, si el efecto es grande o chico de verdad, y qué revisar después.</p>
    <p>Toca cualquier fila de una tabla de coeficientes para que te la explique.</p>

    <h2>Las bases que trae</h2>
    <div class="tabla-wrap"><table><tr><th>Nombre</th><th>Obs</th><th>Para qué sirve</th></tr>
      ${CATALOGO.map((c) => `<tr><td><code>${esc(c.nombre)}</code></td><td>${c.obs}</td><td>${esc(c.desc)}</td></tr>`).join('')}
    </table></div>
    <p>También puedes subir tu propio CSV con el botón <strong>Subir datos</strong>. Se abre con <code>use nombre, clear</code>.</p>

    <h2>Atajos del teclado</h2>
    <div class="tabla-wrap"><table>
      <tr><th>Tecla</th><th>Qué hace</th></tr>
      <tr><td><code>Enter</code></td><td>Ejecuta el comando</td></tr>
      <tr><td><code>↑</code> / <code>↓</code></td><td>Recorre los comandos que ya escribiste</td></tr>
      <tr><td><code>Tab</code></td><td>Completa el comando o la variable</td></tr>
      <tr><td><code>Ctrl</code> + <code>Enter</code></td><td>En el do-file: ejecuta todo</td></tr>
    </table></div>

    <h2>Todos los comandos</h2>
    ${Object.entries(porCat).map(([cat, lista]) => `
      <h3>${nombres[cat] || cat}</h3>
      <div class="tabla-wrap"><table>${lista.map((c) =>
        `<tr><td><code>${esc(c.n)}</code></td><td>${esc(c.ayuda)}</td></tr>`).join('')}</table></div>`).join('')}

    <h2>Sobre los datos</h2>
    <p>Las bases son <strong>simuladas</strong>: se generan con una fórmula fija, así que salen idénticas en cualquier dispositivo. Están calibradas para que los resultados coincidan con los de la guía de econometría. No son datos reales del INEC: sirven para aprender a leer resultados, no para sacar conclusiones sobre El Oro.</p>
    <p>Todo lo que haces se guarda <strong>solo en este dispositivo</strong>. Nada se sube a ningún servidor, salvo las preguntas que le hagas al chat si configuras Gemini.</p>
  </div>`;
  $('#ayudaCuerpo').dataset.listo = '1';
  $$('#ayudaCuerpo .sug').forEach((b) => b.addEventListener('click', () => { cambiarVista('consola'); $('#entrada').value = b.dataset.cmd; }));
}

// ─────────────────────────────────────────────── eventos
$('#formCmd').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#entrada');
  const linea = inp.value.trim();
  if (!linea) return;
  const b = $('.bienvenida');
  if (b) b.remove();
  historial.push(linea);
  posHist = historial.length;
  escribir(K.hist, historial.slice(-120));
  correr(linea);
  inp.value = '';
  $('#autocompletar').classList.remove('abierto');
});

$('#entrada').addEventListener('input', actualizarAuto);
$('#entrada').addEventListener('blur', () => setTimeout(() => $('#autocompletar').classList.remove('abierto'), 150));
$('#entrada').addEventListener('keydown', (e) => {
  const caja = $('#autocompletar');
  if (e.key === 'Tab' && caja.classList.contains('abierto')) {
    e.preventDefault();
    const sel = caja.querySelector('.ac-item.sel') || caja.querySelector('.ac-item');
    if (sel) aplicarAuto(sel.dataset.t, sel.dataset.todo === 'true');
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (caja.classList.contains('abierto')) {
      e.preventDefault();
      const items = [...caja.querySelectorAll('.ac-item')];
      let i = items.findIndex((x) => x.classList.contains('sel'));
      items.forEach((x) => x.classList.remove('sel'));
      i = e.key === 'ArrowUp' ? Math.max(0, i - 1) : Math.min(items.length - 1, i + 1);
      items[i].classList.add('sel');
      return;
    }
    e.preventDefault();
    if (!historial.length) return;
    posHist = e.key === 'ArrowUp' ? Math.max(0, posHist - 1) : Math.min(historial.length, posHist + 1);
    $('#entrada').value = historial[posHist] || '';
  }
  if (e.key === 'Escape') caja.classList.remove('abierto');
});

document.addEventListener('click', (e) => {
  const s = e.target.closest('.sug');
  if (s && s.dataset.cmd) {
    cambiarVista('consola');
    $('#entrada').value = s.dataset.cmd;
    $('#entrada').focus();
  }
});

$$('.tab').forEach((t) => t.addEventListener('click', () => { cerrarMenu(); cambiarVista(t.dataset.vista); }));
$$('.menu-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); abrirMenu(b.dataset.menu, b); }));
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menuDesplegable') && !e.target.closest('.menu-btn')) cerrarMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });

// paneles laterales
$$('.panel-x').forEach((b) => b.addEventListener('click', () => alternarPanel(b.dataset.cerrar)));
$$('.be-paneles button').forEach((b) => b.addEventListener('click', () => alternarPanel(b.dataset.abrir)));
$('#filtroRev').addEventListener('input', pintarRevision);
$('#filtroVarLat').addEventListener('input', pintarVarsLateral);

// do-file
const editor = $('#editor');
editor.value = leer(K.dofile, '');
editor.addEventListener('input', () => escribir(K.dofile, editor.value));
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); correrDoFile(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = s + 4;
  }
});

function correrDoFile(texto) {
  const cont = texto !== undefined ? texto : editor.value;
  const dest = $('#salidaDo');
  dest.innerHTML = '';
  if (!cont.trim()) { toast('El do-file está vacío'); return; }
  const res = ejecutarDoFile(cont, ses);
  for (const r of res) {
    if (r.detenido) {
      const d = document.createElement('div');
      d.className = 'do-detenido';
      d.innerHTML = `⛔ <b>Se detuvo en la línea ${r.numero}.</b> En Stata, cuando un do-file falla se para ahí mismo: si siguiera, todo lo de abajo estaría calculado con datos equivocados. Arregla esa línea y vuelve a ejecutar.`;
      dest.appendChild(d);
      continue;
    }
    const t = document.createElement('div');
    t.className = 'do-linea';
    t.textContent = `línea ${r.numero}:  ${r.linea}`;
    dest.appendChild(t);
    render(r.bloques, dest);
    anotarRevision(r.linea, r.bloques);
  }
  pintarVarsLateral();
  // valida lecciones de do-file con el contenido completo
  if (leccionActiva) {
    const v = leccionActiva.leccion.validar || {};
    const hayError = res.some((r) => r.bloques && r.bloques.some((b) => b.t === 'err'));
    if (v.esDoFile && !hayError) {
      const lineasReales = cont.split(/\r?\n/).filter((l) => l.trim() && !/^\s*\*/.test(l));
      let ok = true;
      if (v.minLineas && cont.split(/\r?\n/).filter((l) => l.trim()).length < v.minLineas) ok = false;
      if (v.contiene) for (const c of v.contiene) if (!cont.toLowerCase().includes(c.toLowerCase())) ok = false;
      void lineasReales;
      if (ok) completarLeccion();
    } else if (!v.esDoFile) {
      for (const r of res) if (r.bloques) revisarLeccion(r.linea, r.bloques, true);
    }
  }
  pintarEstado();
  toast('Do-file ejecutado');
}

// ─────────────────────────────────────────────── biblioteca de do-files
let doActivo = null;
const seccionesHechas = new Set();

function pintarBiblioteca() {
  const cont = $('#bibLista');
  cont.innerHTML = FAMILIAS_DO.map((fam) => {
    const items = DOFILES.filter((d) => d.familia === fam);
    return `<div class="bib-fam">${esc(fam)}</div>` + items.map((d) => `
      <button class="bib-item" data-id="${d.id}">
        <span class="bn">${d.n}</span>
        <span><b>${esc(d.nombre)}</b><small>${esc(d.resumen)}</small></span>
        <span class="bsec">${d.secciones.length} pasos</span>
      </button>`).join('');
  }).join('');
  cont.querySelectorAll('.bib-item').forEach((el) => el.addEventListener('click', () => {
    cargarDoFile(el.dataset.id);
    $('#biblioteca').classList.remove('abierta');
  }));
}

function cargarDoFile(id) {
  const df = DOFILES.find((d) => d.id === id);
  if (!df) return;
  if (editor.value.trim() && !editor.dataset.deBiblioteca
      && !confirm('Esto reemplaza lo que tienes escrito en el editor. ¿Seguro?')) return;
  doActivo = df;
  seccionesHechas.clear();
  editor.value = textoCompleto(df);
  editor.dataset.deBiblioteca = df.id;
  escribir(K.dofile, editor.value);
  $('#doNombre').textContent = `${df.n}. ${df.nombre}`;
  $('#doResumen').innerHTML = `${esc(df.resumen)} &nbsp;·&nbsp; base <code>${esc(df.base)}</code>`;
  $('#salidaDo').innerHTML = '';
  escribir(K.doActivo, df.id);
  pintarNavSecciones();
  toast(`Do-file ${df.n} cargado: ${df.secciones.length} pasos`);
}

/** Al recargar la página, recupera el do-file que estaba abierto. */
function restaurarDoFile() {
  const id = leer(K.doActivo, null);
  if (!id) return;
  const df = DOFILES.find((d) => d.id === id);
  if (!df) return;
  // solo se reconecta si el texto del editor todavía es de ese do-file
  if (!editor.value.includes(`Do-file ${df.n} — ${df.nombre}`)) return;
  doActivo = df;
  editor.dataset.deBiblioteca = df.id;
  $('#doNombre').textContent = `${df.n}. ${df.nombre}`;
  $('#doResumen').innerHTML = `${esc(df.resumen)} &nbsp;·&nbsp; base <code>${esc(df.base)}</code>`;
  pintarNavSecciones();
}

function pintarNavSecciones() {
  const nav = $('#navSecciones');
  if (!doActivo) { nav.classList.remove('hay'); nav.innerHTML = ''; return; }
  nav.classList.add('hay');
  nav.innerHTML = '<span class="nav-et">Correr paso a paso</span>' +
    doActivo.secciones.map((s, i) => `
      <span class="sec-chip ${seccionesHechas.has(i) ? 'hecha' : ''}" data-i="${i}" title="${esc(s.porque || s.t)}">
        <span class="sn">${seccionesHechas.has(i) ? '✓' : i + 1}</span>
        <span class="st">${esc(s.t)}</span>
        <button class="sr" data-run="${i}">▶</button>
      </span>`).join('');
  nav.querySelectorAll('.sr').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    correrSeccion(Number(b.dataset.run));
  }));
  nav.querySelectorAll('.sec-chip').forEach((c) => c.addEventListener('click', () => {
    // lleva el cursor a esa sección dentro del editor
    const marca = `* ---- ${Number(c.dataset.i) + 1}. ${doActivo.secciones[Number(c.dataset.i)].t}`;
    const pos = editor.value.indexOf(marca);
    if (pos >= 0) {
      editor.focus();
      editor.setSelectionRange(pos, pos);
      const antes = editor.value.slice(0, pos).split('\n').length;
      editor.scrollTop = Math.max(0, (antes - 2) * 24);
    }
  }));
}

/** Saca el código de una sección DESDE EL EDITOR, para que respete lo que ella edite. */
function codigoDeSeccion(i) {
  const marca = (k) => `* ---- ${k + 1}. ${doActivo.secciones[k].t}`;
  const texto = editor.value;
  const ini = texto.indexOf(marca(i));
  if (ini < 0) return doActivo.secciones[i].codigo;   // si la borró, se usa el original
  const desde = texto.indexOf('\n', ini);
  let hasta = texto.length;
  for (let k = i + 1; k < doActivo.secciones.length; k++) {
    const p = texto.indexOf(marca(k));
    if (p > ini) { hasta = p; break; }
  }
  return texto.slice(desde + 1, hasta);
}

function correrSeccion(i) {
  if (!doActivo) return;
  const s = doActivo.secciones[i];
  const dest = $('#salidaDo');
  const cab = document.createElement('div');
  cab.className = 'do-linea';
  cab.textContent = `▶ paso ${i + 1} de ${doActivo.secciones.length}:  ${s.t}`;
  dest.appendChild(cab);
  if (s.porque) {
    const p = document.createElement('div');
    p.className = 'profe-item info';
    p.style.margin = '6px 0 10px';
    p.textContent = s.porque;
    dest.appendChild(p);
  }
  const res = ejecutarDoFile(codigoDeSeccion(i), ses);
  let hubo = false;
  for (const r of res) {
    if (r.detenido) {
      const d = document.createElement('div');
      d.className = 'do-detenido';
      d.innerHTML = `⛔ Este paso se detuvo en su línea ${r.numero}. Arréglala y vuelve a darle ▶ a este mismo paso.`;
      dest.appendChild(d);
      hubo = true;
      continue;
    }
    const t = document.createElement('div');
    t.className = 'do-linea';
    t.textContent = `. ${r.linea}`;
    dest.appendChild(t);
    render(r.bloques, dest);
    anotarRevision(r.linea, r.bloques);
    if (r.bloques.some((b) => b.t === 'err')) hubo = true;
  }
  if (!hubo) seccionesHechas.add(i); else seccionesHechas.delete(i);
  pintarNavSecciones();
  pintarEstado();
  pintarVarsLateral();
  dest.scrollTop = dest.scrollHeight;
  if (!hubo && i + 1 < doActivo.secciones.length) {
    toast(`Paso ${i + 1} listo. Sigue el ${i + 2}: ${doActivo.secciones[i + 1].t}`);
  } else if (!hubo) {
    toast('🎉 Terminaste todos los pasos de este do-file');
  }
}

$('#btnBiblioteca').addEventListener('click', () => {
  pintarBiblioteca();
  $('#biblioteca').classList.add('abierta');
});
$('#bibX').addEventListener('click', () => $('#biblioteca').classList.remove('abierta'));
$('#biblioteca').addEventListener('click', (e) => {
  if (e.target.id === 'biblioteca') e.currentTarget.classList.remove('abierta');
});

$('#btnCorrerDo').addEventListener('click', () => correrDoFile());
$('#btnCorrerSel').addEventListener('click', () => {
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (!sel.trim()) { toast('Selecciona primero las líneas que quieres correr'); return; }
  correrDoFile(sel);
});
$('#btnBajarDo').addEventListener('click', () => {
  const nombre = doActivo ? `do${String(doActivo.n).padStart(2, '0')}_${doActivo.id}.do` : 'mi_trabajo.do';
  descargarTexto(nombre, editor.value);
});

// datos
$('#filtroVar').addEventListener('input', pintarDatos);

// subir CSV
$('#btnSubir').addEventListener('click', () => $('#archivoCSV').click());
$('#archivoCSV').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const texto = await f.text();
    const nombre = f.name.replace(/\.[^.]+$/, '').replace(/[^\w]/g, '_').slice(0, 30);
    const crudo = parsearCSV(texto, nombre);
    const subidos = leer(K.subidos, {});
    subidos[nombre] = crudo;
    escribir(K.subidos, subidos);
    ses.archivosSubidos[nombre] = crudo;
    cambiarVista('consola');
    const b = $('.bienvenida'); if (b) b.remove();
    correr(`use ${nombre}, clear`);
    toast(`Archivo cargado: ${crudo.n} filas, ${crudo.vars.length} columnas`);
  } catch (err) {
    toast('No pude leer el archivo: ' + err.message);
  }
  e.target.value = '';
});

$('#btnLog').addEventListener('click', () => descargarTexto('sesion_stataprofe.txt', logCompleto()));

// tema
function aplicarTema() {
  const t = leer(K.tema, 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
}
$('#btnTema').addEventListener('click', () => {
  const t = leer(K.tema, 'auto');
  const sig = t === 'auto' ? 'claro' : (t === 'claro' ? 'oscuro' : 'auto');
  escribir(K.tema, sig);
  aplicarTema();
  toast(`Tema: ${sig}`);
});
aplicarTema();
if (leer(K.grande, false)) document.documentElement.setAttribute('data-grande', 'si');

// lección
$('#lpCerrar').addEventListener('click', cerrarLeccion);
$('#btnPista').addEventListener('click', () => {
  if (!leccionActiva) return;
  const pistas = leccionActiva.leccion.pistas || [];
  if (pistasMostradas >= pistas.length) { toast('Ya no quedan más pistas: prueba con "Ver la respuesta"'); return; }
  const extra = $('#lpExtra');
  const d = document.createElement('div');
  d.className = 'lp-pista';
  d.innerHTML = `<span class="et">Pista ${pistasMostradas + 1} de ${pistas.length}</span>${pistas[pistasMostradas]}`;
  extra.appendChild(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  pistasMostradas++;
});
$('#btnSolucion').addEventListener('click', () => {
  if (!leccionActiva) return;
  const extra = $('#lpExtra');
  const d = document.createElement('div');
  d.className = 'lp-solucion';
  d.textContent = leccionActiva.leccion.ejemplo;
  extra.appendChild(d);
  const b = document.createElement('button');
  b.className = 'btn sec';
  b.style.marginTop = '8px';
  b.textContent = 'Copiar a la consola';
  b.addEventListener('click', () => {
    const esDo = (leccionActiva.leccion.validar || {}).esDoFile;
    if (esDo) { cambiarVista('dofile'); editor.value = leccionActiva.leccion.ejemplo; escribir(K.dofile, editor.value); }
    else { cambiarVista('consola'); $('#entrada').value = leccionActiva.leccion.ejemplo; $('#entrada').focus(); }
  });
  extra.appendChild(b);
  d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('#btnReiniciar').addEventListener('click', () => {
  if (!confirm('Esto borra todo tu avance del curso (lecciones, XP e insignias). ¿Seguro?')) return;
  progreso = { hechas: [], xp: 0, leccionActual: null, insignias: [] };
  escribir(K.progreso, progreso);
  pintarCurso();
  toast('Progreso reiniciado');
});

// ajustes
$('#btnAjustes').addEventListener('click', () => {
  $('#modalAjustes').classList.add('abierto');
  const m = modeloElegido();
  $('#estadoClave').innerHTML = tieneClave()
    ? `✅ Hay una clave guardada en este dispositivo.${m ? ` Modelo en uso: <code>${esc(m)}</code>.` : ' Dale a <strong>Probar</strong> para buscar el modelo.'}`
    : 'Sin clave: el chat libre está desactivado (el resto funciona igual).';
  $('#chkGrande').checked = leer(K.grande, false);
  $('#chkProfe').checked = verProfe;
  $('#chkPaneles').checked = !$('#panelVariables').classList.contains('oculto');
});
$('#chkPaneles').addEventListener('change', (e) => {
  escribir(K.paneles, e.target.checked);
  for (const id of ['panelRevision', 'panelVariables']) {
    const p = $('#' + id);
    if (p.classList.contains('oculto') === e.target.checked) alternarPanel(id);
  }
});
$('#ajustesX').addEventListener('click', () => $('#modalAjustes').classList.remove('abierto'));
$('#modalAjustes').addEventListener('click', (e) => { if (e.target.id === 'modalAjustes') e.currentTarget.classList.remove('abierto'); });
$('#btnGuardarClave').addEventListener('click', () => {
  const v = $('#claveGemini').value.trim();
  if (!v) { toast('Pega primero la clave'); return; }
  guardarClave(v);
  $('#claveGemini').value = '';
  $('#estadoClave').textContent = '✅ Clave guardada en este dispositivo.';
  toast('Clave guardada');
});
$('#btnProbarClave').addEventListener('click', async () => {
  const est = $('#estadoClave');
  est.innerHTML = 'Probando… (primero busco qué modelos tiene tu clave)';
  const r = await probarClave();
  if (r.ok) {
    est.innerHTML = `✅ Funciona. Estoy usando el modelo <code>${esc(r.modelo)}</code>.<br>
      <span style="color:var(--ink3)">Respuesta de prueba: "${esc(r.muestra)}"</span>`;
    toast('Gemini conectado: ' + r.modelo);
    return;
  }
  est.innerHTML = `❌ ${esc(r.error)}`;
  // si la clave sirve pero falla otra cosa, mostrar qué modelos hay
  try {
    const lista = await listarModelos();
    est.innerHTML += `<br><span style="color:var(--ink3)">Tu clave sí ve ${lista.length} modelos: ${
      esc(lista.slice(0, 5).join(', '))}${lista.length > 5 ? '…' : ''}</span>`;
  } catch { /* la clave no sirve ni para listar */ }
});
$('#btnBorrarClave').addEventListener('click', () => {
  borrarClave();
  $('#estadoClave').textContent = 'Clave borrada.';
  toast('Clave borrada');
});
$('#chkGrande').addEventListener('change', (e) => {
  escribir(K.grande, e.target.checked);
  if (e.target.checked) document.documentElement.setAttribute('data-grande', 'si');
  else document.documentElement.removeAttribute('data-grande');
});
$('#chkProfe').addEventListener('change', (e) => {
  verProfe = e.target.checked;
  escribir(K.verProfe, verProfe);
  $$('.profe').forEach((p) => { p.style.display = verProfe ? '' : 'none'; });
});
$('#btnBorrarTodo').addEventListener('click', () => {
  if (!confirm('Esto borra tu progreso, tu do-file y los archivos que subiste, solo en este dispositivo. ¿Seguro?')) return;
  Object.values(K).forEach((k) => localStorage.removeItem(k));
  location.reload();
});

// chat
$('#fabProfe').addEventListener('click', () => {
  $('#chatProfe').classList.toggle('abierto');
  if ($('#chatProfe').classList.contains('abierto')) {
    if (!$('#chatMsgs').children.length) {
      msgChat('profe', tieneClave()
        ? '¡Hola! Pregúntame lo que quieras de econometría o de Stata. Yo veo lo que acabas de correr, así que puedes decirme cosas como "¿por qué mi R² es tan bajo?" o "¿qué significa este valor p?".'
        : 'Para el chat libre hace falta una clave de Gemini (se pone en ⚙️ Ajustes, es gratis). <b>Pero ojo: no la necesitas para lo importante.</b> Las interpretaciones de cada resultado que corres ya funcionan sin internet.');
    }
    $('#chatInput').focus();
  }
});
$('#chatX').addEventListener('click', () => $('#chatProfe').classList.remove('abierto'));
function msgChat(quien, texto) {
  const d = document.createElement('div');
  d.className = 'msg ' + quien;
  d.innerHTML = texto;
  $('#chatMsgs').appendChild(d);
  $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight;
  return d;
}
$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#chatInput').value.trim();
  if (!q) return;
  $('#chatInput').value = '';
  msgChat('yo', esc(q));
  if (!tieneClave()) {
    msgChat('profe', 'Necesito una clave de Gemini para responder preguntas libres. Ponla en ⚙️ Ajustes (es gratis). Mientras tanto, corre el comando y te explico el resultado automáticamente.');
    return;
  }
  const pensando = msgChat('profe pensando', 'pensando…');
  try {
    const ctx = contextoParaGemini();
    const r = await preguntarGemini(q, ctx);
    pensando.remove();
    msgChat('profe', r);
  } catch (err) {
    pensando.remove();
    msgChat('profe', 'No pude responder: ' + esc(err.message));
  }
});

function contextoParaGemini() {
  const ult = ses.registro.slice(-4);
  const ds = ses.ds;
  return {
    base: ds.cargado ? { nombre: ds.nombre, n: ds.n, variables: ds.vars.map((v) => `${v.name} (${v.type === 'string' ? 'texto' : 'número'}${v.label ? ': ' + v.label : ''})`) } : null,
    ultimosComandos: ult.map((r) => r.linea),
    ultimoModelo: ses.ultimoModelo ? {
      comando: ses.ultimoModelo.cmd,
      dependiente: ses.ultimoModelo.depvar,
      N: ses.ultimoModelo.N,
      r2: ses.ultimoModelo.r2,
      coeficientes: ses.ultimoModelo.names.map((n, i) =>
        `${n}: coef=${fmtG(ses.ultimoModelo.b[i], 5)}, p=${fmtP(ses.ultimoModelo.p[i])}`),
    } : null,
  };
}

// ─────────────────────────────────────────────── arranque
historial = leer(K.hist, []);
posHist = historial.length;
pintarEstado();
pintarCurso();
pintarRevision();
pintarVarsLateral();
restaurarDoFile();
// los botones de la barra de estado solo aparecen cuando el panel está oculto
$$('.be-paneles button').forEach((b) => b.classList.add('escondido'));
if (!leer(K.paneles, true)) { alternarPanel('panelRevision'); alternarPanel('panelVariables'); }
$('#entrada').focus();

// si nunca ha hecho nada, sugerir el curso
if (!progreso.hechas.length) {
  setTimeout(() => { $('#pipCurso').classList.add('on'); }, 1200);
}

// exponer para depurar desde la consola del navegador
window.stataprofe = { ses, correr, progreso };
