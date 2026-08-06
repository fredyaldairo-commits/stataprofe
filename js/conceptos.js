// Los "porqués": teoría, concepto y lógica, atados a los comandos.
// Es lo que suele faltar entre el apunte de clase y la pantalla de Stata.

const T = (titulo, cuerpo, extras = {}) => Object.assign({ titulo, cuerpo }, extras);

export const CONCEPTOS = [
// ═══════════════════════════════════════════════════════════════════
{
  id: 'escalas', icono: '🔢', titulo: 'Las cuatro escalas del mismo resultado',
  gancho: 'Coeficiente, razón de momios, efecto marginal y media ajustada NO son cuatro resultados: son el mismo, contado en cuatro idiomas. Confundirlos es el error que más se castiga.',
  secciones: [
    T('El problema de fondo',
      `<p>Un logit no modela la probabilidad directamente. Modela el <strong>logaritmo de los momios</strong>, que es una escala inventada para que el número pueda ir de −∞ a +∞ sin salirse nunca del 0% al 100% cuando se traduce de vuelta.</p>
       <p>Esa escala inventada es cómoda para calcular y <strong>horrible para explicar</strong>. De ahí salen las cuatro formas de contar lo mismo.</p>`),
    T('Las cuatro, lado a lado',
      `<div class="tabla-wrap"><table>
        <tr><th>Qué es</th><th>Comando</th><th>Valor neutro</th><th>Cómo se lee</th><th>¿Se reporta?</th></tr>
        <tr><td><b>Coeficiente crudo</b><br><small>log de momios</small></td><td><code>logit</code></td><td><b>0</b></td>
            <td>Casi nada. Solo el <strong>signo</strong> y si es significativo.</td><td>En la tabla del anexo, sí. En el texto, no.</td></tr>
        <tr><td><b>Razón de momios</b><br><small>e^coeficiente</small></td><td><code>logistic</code><br><code>logit, or</code></td><td><b>1</b></td>
            <td>Los momios se <em>multiplican</em> por ese número.</td><td>Sí, pero diciendo "momios", nunca "probabilidad".</td></tr>
        <tr><td><b>Efecto marginal</b><br><small>puntos de probabilidad</small></td><td><code>margins, dydx(*)</code></td><td><b>0</b></td>
            <td>Cuánto sube o baja la probabilidad, en puntos.</td><td><strong>Sí. Este es el número del texto.</strong></td></tr>
        <tr><td><b>Media ajustada</b><br><small>probabilidad predicha</small></td><td><code>margins grupo</code></td><td>—</td>
            <td>Qué probabilidad tendría cada grupo en igualdad de condiciones.</td><td>Sí, y se grafica muy bien.</td></tr>
      </table></div>`),
    T('El mismo hallazgo, en los cuatro idiomas',
      `<p>Supón que en tu logit el coeficiente de <code>educ</code> es <strong>0,187</strong>:</p>
       <ul>
         <li><b>Coeficiente 0,187</b> → "estudiar más ayuda, y no es casualidad". Punto. Nada más se puede decir.</li>
         <li><b>Razón de momios 1,206</b> → "por cada año de estudio, los momios de tener empleo formal se multiplican por 1,21, o sea suben un 21%". <u>Momios</u>, no probabilidad.</li>
         <li><b>Efecto marginal +3,34 puntos</b> → "por cada año de estudio, la probabilidad de tener empleo formal sube 3,34 puntos porcentuales". De 100 personas parecidas, unas 3 más.</li>
         <li><b>Media ajustada</b> → "alguien con 6 años de estudio tiene 19% de probabilidad; alguien con 18 años, 68%".</li>
       </ul>`,
      { ojo: 'Los cuatro números son <strong>correctos</strong> y describen <strong>el mismo modelo</strong>. Lo que está mal es mezclarlos: decir "el coeficiente es 1,206" o "la razón de momios sube 3,34 puntos de probabilidad".' }),
    T('Puntos porcentuales vs. por ciento',
      `<p>Esta distinción cae en defensas de tesis y casi nadie la tiene clara.</p>
       <p>Si la probabilidad pasa de <strong>40% a 43,3%</strong>:</p>
       <ul>
         <li>Subió <strong>3,3 puntos porcentuales</strong>. ✅ Eso es lo que dice <code>margins</code>.</li>
         <li>Subió <strong>8,25 por ciento</strong> (porque 3,3 ÷ 40 = 8,25%). ✅ También es cierto, pero es otra cosa.</li>
       </ul>
       <p>Decir "subió 3,3 por ciento" es <strong>incorrecto</strong>. Di siempre "puntos" cuando reportes efectos marginales.</p>`),
  ],
  comandos: ['logit formal educ exper mujer', 'logistic formal educ exper mujer', 'margins, dydx(*)', 'margins, at(educ=(0(6)18))'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'curvas', icono: '📈', titulo: 'La curva logística y la normal',
  gancho: 'Las dos son "eses" que impiden que la probabilidad se salga de 0 a 100. Se parecen tanto que casi nunca cambia la conclusión, pero no son intercambiables en los números.',
  secciones: [
    T('Por qué hace falta una curva',
      `<p>Con una recta (el modelo de probabilidad lineal) el efecto de una variable es <strong>siempre el mismo</strong>: el mismo empujón para alguien que ya tenía 5% de probabilidad que para alguien que tenía 95%.</p>
       <p>Eso no tiene sentido. A quien ya es casi seguro que sí, un año más de estudio le cambia poco; a quien está en el 50%, le cambia mucho. Y estirando la recta se llega a probabilidades negativas.</p>
       <p>La curva en S arregla las dos cosas: es <strong>empinada en el medio y plana en los extremos</strong>, y nunca cruza el 0 ni el 1.</p>`),
    T('En qué se diferencian',
      `<div class="tabla-wrap"><table>
        <tr><th></th><th>Logit (logística)</th><th>Probit (normal)</th></tr>
        <tr><td>De dónde sale</td><td>De suponer que el error sigue una distribución logística</td><td>De suponer que el error es normal, la campana de Gauss</td></tr>
        <tr><td>Colas</td><td>Un poco <strong>más gruesas</strong>: se acerca a 0 y 1 más despacio</td><td>Más delgadas: llega a los extremos más rápido</td></tr>
        <tr><td>Ventaja práctica</td><td>Permite hablar de <strong>momios</strong>, porque e^coeficiente tiene sentido directo</td><td>Encaja mejor con la teoría de variable latente normal</td></tr>
        <tr><td>Escala de los coeficientes</td><td>Más grandes</td><td>Más chicos (aprox. los de logit ÷ 1,6)</td></tr>
        <tr><td>Efectos marginales</td><td colspan="2"><strong>Prácticamente idénticos.</strong> Por eso la conclusión casi nunca cambia.</td></tr>
      </table></div>`,
      { ojo: 'Los <strong>coeficientes crudos de logit y probit no se comparan entre sí</strong>: están en escalas distintas. Los <strong>efectos marginales sí</strong>. Si quieres mostrar que tu resultado es sólido, compara los <code>margins</code>, no los coeficientes.' }),
    T('¿Cuál usar?',
      `<ul>
        <li><strong>Logit</strong> si vas a hablar de momios o de riesgo (es lo estándar en salud y en economía laboral).</li>
        <li><strong>Probit</strong> si tu marco teórico habla de una "variable latente" normal (utilidad, propensión), que es común en microeconometría.</li>
        <li><strong>Los dos</strong> si quieres blindar el trabajo: corres ambos, muestras que los efectos marginales coinciden y dices "los resultados no dependen de la distribución supuesta". Eso se llama <strong>análisis de sensibilidad</strong> y suma mucho.</li>
      </ul>
      <p>Lo que <u>no</u> se hace es correr los dos y reportar el que salió más bonito.</p>`),
  ],
  comandos: ['logit formal educ exper mujer', 'margins, dydx(*)', 'probit formal educ exper mujer', 'margins, dydx(*)'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'corte', icono: '✂️', titulo: 'El punto de corte: cuál es el mejor',
  gancho: 'No existe un corte "correcto". El mejor depende de qué error te sale más caro, y eso lo decides tú, no el programa.',
  secciones: [
    T('Qué es',
      `<p>El modelo no te dice "sí" o "no": te da una <strong>probabilidad</strong> para cada persona. El punto de corte es la línea que tú trazas: "de aquí para arriba lo cuento como sí".</p>
       <p>Stata usa <strong>0,5</strong> por omisión. Ese número no tiene nada de sagrado: es solo el default.</p>`),
    T('El intercambio, en una frase',
      `<p>Si <strong>bajas</strong> el corte, el modelo dice "sí" más seguido: atrapa más casos verdaderos (sube la <strong>sensibilidad</strong>) pero también se equivoca más con los que no eran (baja la <strong>especificidad</strong>).</p>
       <p>Si lo <strong>subes</strong>, pasa exactamente al revés. Nunca puedes mejorar las dos a la vez moviendo el corte: solo cambias cuál error prefieres cometer.</p>`),
    T('Las tres formas de elegirlo',
      `<div class="tabla-wrap"><table>
        <tr><th>Criterio</th><th>Cómo se hace</th><th>Cuándo conviene</th></tr>
        <tr><td><b>Youden</b><br><small>el más usado en tesis</small></td><td>El corte donde <strong>sensibilidad + especificidad</strong> es máxima. Se lee del gráfico <code>lsens</code>, donde las dos líneas se cruzan.</td><td>Cuando los dos errores te importan igual y no tienes información de costos.</td></tr>
        <tr><td><b>Por costos</b></td><td>Piensa qué cuesta cada error. Si dejar fuera a alguien que necesita ayuda es 5 veces peor que incluir a alguien que no, baja el corte.</td><td>Cuando hay una decisión real detrás. Es el criterio más honesto.</td></tr>
        <tr><td><b>Por prevalencia</b></td><td>Poner el corte en la proporción de "sí" que hay en tus datos, no en 0,5.</td><td>Cuando una categoría es mucho más rara que la otra.</td></tr>
      </table></div>`),
    T('Dos ejemplos concretos',
      `<ul>
        <li><b>Detectar quién necesita un bono social.</b> Dejar fuera a una familia pobre (falso negativo) es mucho peor que incluir a una que no lo necesitaba (falso positivo). → <strong>corte bajo, sensibilidad alta</strong>.</li>
        <li><b>Aprobar un crédito.</b> Prestarle a quien no va a pagar (falso positivo) cuesta plata de verdad; negarle a alguien bueno solo cuesta una venta. → <strong>corte alto, especificidad alta</strong>.</li>
      </ul>`,
      { ojo: 'Cualquiera que sea el corte que elijas, <strong>dilo en el informe y explica por qué</strong>. Un corte sin justificar es la primera pregunta que te van a hacer.' }),
    T('El AUC no depende del corte',
      `<p>Esta es la razón de ser de la curva ROC: <strong>el área bajo la curva (AUC) resume el modelo en TODOS los cortes a la vez</strong>. Por eso se reporta el AUC para hablar de la calidad del modelo, y el corte solo cuando hay que tomar una decisión concreta.</p>
       <p>Un modelo con AUC alto es bueno <em>sea cual sea</em> el corte que uses después.</p>`),
  ],
  comandos: ['logit formal educ exper mujer', 'lroc', 'lsens', 'estat classification', 'estat classification, cutoff(0.35)'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'clasificacion', icono: '🎯', titulo: 'Falsos positivos y falsos negativos',
  gancho: 'Cuatro casillas que hay que saberse de memoria, porque de ahí salen todas las medidas de calidad de un modelo de sí/no.',
  secciones: [
    T('Las cuatro casillas',
      `<p>Cruzas <strong>lo que el modelo dijo</strong> contra <strong>lo que pasó de verdad</strong>. Salen cuatro casos:</p>
       <ul>
        <li><b>Verdadero positivo (VP)</b> — dijo sí, y era sí. ✅</li>
        <li><b>Verdadero negativo (VN)</b> — dijo no, y era no. ✅</li>
        <li><b>Falso positivo (FP)</b> — dijo sí, pero era no. Es una <strong>falsa alarma</strong>. También se llama error de tipo I.</li>
        <li><b>Falso negativo (FN)</b> — dijo no, pero era sí. Es un caso que <strong>se le escapó</strong>. Error de tipo II.</li>
       </ul>
       <p>Truco para no confundirte: la palabra <em>falso</em> dice que el modelo se equivocó; la segunda palabra dice <strong>qué fue lo que el modelo dijo</strong>. "Falso positivo" = dijo positivo y era falso.</p>`),
    T('Las medidas: columnas contra filas',
      `<p>Aquí está la confusión más común de todas. Unas medidas se leen <strong>por columna</strong> y otras <strong>por fila</strong>:</p>
       <div class="tabla-wrap"><table>
        <tr><th>Medida</th><th>Fórmula</th><th>Pregunta que responde</th><th>Se lee por</th></tr>
        <tr><td><b>Sensibilidad</b><br><small>o recall</small></td><td>VP ÷ (VP + FN)</td><td>De los que <u>sí eran</u>, ¿a cuántos atrapé?</td><td><strong>Columna</strong> (parte de la realidad)</td></tr>
        <tr><td><b>Especificidad</b></td><td>VN ÷ (VN + FP)</td><td>De los que <u>no eran</u>, ¿a cuántos acerté?</td><td><strong>Columna</strong></td></tr>
        <tr><td><b>Valor predictivo +</b><br><small>o precisión</small></td><td>VP ÷ (VP + FP)</td><td>Cuando digo "sí", ¿cuántas veces acierto?</td><td><strong>Fila</strong> (parte de lo que dije)</td></tr>
        <tr><td><b>Valor predictivo −</b></td><td>VN ÷ (VN + FN)</td><td>Cuando digo "no", ¿cuántas veces acierto?</td><td><strong>Fila</strong></td></tr>
       </table></div>
       <p>Por eso la sensibilidad puede ser altísima y el valor predictivo pésimo al mismo tiempo: son preguntas distintas.</p>`),
    T('La trampa del "% correctamente clasificado"',
      `<p>Es el número más engañoso de toda la tabla, y el que más se reporta sin pensar.</p>
       <p>Si el 85% de tu muestra son "no", un modelo que diga <strong>siempre "no"</strong> acierta el 85% sin haber aprendido absolutamente nada.</p>
       <p>Antes de presumir un 85% de aciertos, compáralo con la <strong>categoría más frecuente</strong>. Si tu modelo no le gana por un margen claro, no sirve. El simulador te avisa cuando esto pasa.</p>`,
      { ojo: 'Con categorías desbalanceadas, mira el <strong>AUC</strong> y la <strong>sensibilidad</strong>, no el porcentaje de aciertos.' }),
    T('Cómo se relacionan con la ROC',
      `<p>La curva ROC es, literalmente, <strong>lo que pasa con la sensibilidad y la especificidad cuando mueves el corte de 0 a 1</strong>.</p>
       <ul>
        <li>El eje vertical es la <strong>sensibilidad</strong>.</li>
        <li>El eje horizontal es <strong>1 − especificidad</strong>, o sea la tasa de falsos positivos.</li>
        <li>Cada punto de la curva es <strong>un punto de corte distinto</strong>.</li>
       </ul>
       <p>Mientras más se pegue la curva a la esquina superior izquierda, mejor discrimina el modelo <em>en todos los cortes</em>.</p>`),
  ],
  comandos: ['logit formal educ exper mujer', 'estat classification', 'lroc', 'lsens'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'orden', icono: '🧭', titulo: 'El orden correcto de trabajo',
  gancho: 'La secuencia no es capricho: cada paso depende del anterior. Saltarse uno es de donde salen los resultados que no se sostienen.',
  secciones: [
    T('La secuencia completa',
      `<div class="tabla-wrap"><table>
        <tr><th>#</th><th>Paso</th><th>Comandos</th><th>Por qué va aquí y no después</th></tr>
        <tr><td>1</td><td>Conocer la base</td><td><code>describe</code> <code>codebook</code></td><td>Para saber qué es texto, qué es número y qué significa cada columna.</td></tr>
        <tr><td>2</td><td>Depurar</td><td><code>misstable</code> <code>duplicates</code> <code>mvdecode</code> <code>destring</code> <code>encode</code></td><td>Si depuras <u>después</u> de modelar, todos los resultados anteriores se caen.</td></tr>
        <tr><td>3</td><td>Definir la muestra</td><td><code>drop if missing(...)</code></td><td><strong>Una sola vez.</strong> Si cada modelo bota filas distintas, los R² no se pueden comparar.</td></tr>
        <tr><td>4</td><td>Transformar y etiquetar</td><td><code>gen</code> <code>recode</code> <code>label</code></td><td>Antes de mirar descriptivas, para que las tablas ya salgan legibles.</td></tr>
        <tr><td>5</td><td>Descriptivas</td><td><code>summarize</code> <code>tab</code> <code>correlate</code> <code>histogram</code></td><td>Aquí aparecen los errores que la depuración no vio, y decides si hace falta logaritmo.</td></tr>
        <tr><td>6</td><td>Modelo</td><td><code>reg</code> <code>logit</code> …</td><td>Recién ahora, con datos limpios y conocidos.</td></tr>
        <tr><td>7</td><td>Supuestos</td><td><code>estat vif</code> <code>estat hettest</code> <code>estat ovtest</code> <code>swilk</code></td><td>Después del modelo, porque se calculan <u>sobre sus residuos</u>.</td></tr>
        <tr><td>8</td><td>Postestimación</td><td><code>margins</code> <code>lroc</code> <code>estat classification</code></td><td>Traducir el resultado a algo interpretable.</td></tr>
        <tr><td>9</td><td>Reportar</td><td><code>estimates store</code> <code>esttab</code></td><td>Varios modelos lado a lado para mostrar que el hallazgo aguanta.</td></tr>
      </table></div>`),
    T('El orden de los supuestos, y qué hacer con cada uno',
      `<div class="tabla-wrap"><table>
        <tr><th>Orden</th><th>Qué se revisa</th><th>Comando</th><th>Si falla</th><th>¿Grave?</th></tr>
        <tr><td>1º</td><td>Multicolinealidad</td><td><code>estat vif</code></td><td>Quitar una de las variables repetidas o juntarlas en un índice</td><td>Sí, si VIF &gt; 10</td></tr>
        <tr><td>2º</td><td>Forma funcional</td><td><code>estat ovtest</code></td><td>Meter un cuadrático, pasar a logaritmos, o buscar la variable que falta</td><td><strong>Sí, es la más grave</strong>: sesga los coeficientes</td></tr>
        <tr><td>3º</td><td>Heterocedasticidad</td><td><code>estat hettest</code></td><td>Agregar <code>robust</code>. Nada más.</td><td>Moderado: <u>no</u> sesga los coeficientes, solo los valores p</td></tr>
        <tr><td>4º</td><td>Normalidad de residuos</td><td><code>swilk</code> <code>sktest</code></td><td>Nada, si la muestra es grande. Mencionarlo y seguir.</td><td><strong>Casi nunca</strong>, con N grande</td></tr>
      </table></div>
      <p>Fíjate en el orden de gravedad: <strong>la forma funcional importa mucho más que la normalidad</strong>, aunque en clase se suela enseñar al revés. Un modelo mal especificado da coeficientes equivocados; unos residuos no normales con 3.000 observaciones no le hacen nada a nadie.</p>`),
    T('¿logit, logistic, o las dos?',
      `<p>Son <strong>el mismo modelo</strong>. <code>logistic</code> es <code>logit</code> mostrando e^coeficiente. Corren el mismo cálculo, dan la misma log-verosimilitud, el mismo pseudo R².</p>
       <p>Qué hacer en la práctica:</p>
       <ul>
        <li>Corre <code>logit</code> para tener los coeficientes y la significancia.</li>
        <li>Corre <code>margins, dydx(*)</code> — <strong>este paso no es opcional</strong>, es de donde sale el número que va en tu texto.</li>
        <li>Corre <code>logistic</code> solo <u>si</u> vas a hablar de momios. Si no, sobra.</li>
       </ul>`,
      { ojo: 'Nunca los reportes como si fueran dos modelos distintos en una tabla comparativa. Es el mismo, dos veces.' }),
  ],
  comandos: ['use enemdu_eloro_2024, clear', 'describe', 'misstable summarize', 'summarize', 'reg ingreso educ exper mujer, robust', 'estat vif', 'estat ovtest', 'estat hettest'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'multinomial', icono: '🔱', titulo: 'Mlogit, mprobit y la categoría base',
  gancho: 'El modelo que más se interpreta mal. La clave está en entender que no hay UN resultado, sino una comparación por cada categoría.',
  secciones: [
    T('Qué está haciendo por dentro',
      `<p>Con 3 categorías (formal, informal, cuenta propia) y base = formal, <code>mlogit</code> corre en realidad <strong>dos logits a la vez</strong>:</p>
       <ul>
        <li>informal <em>contra</em> formal</li>
        <li>cuenta propia <em>contra</em> formal</li>
       </ul>
       <p>Por eso la tabla sale con dos bloques. No son dos modelos: son dos partes del mismo, estimadas juntas para que las probabilidades sumen 1.</p>
       <p>La categoría base <strong>no aparece</strong> en la tabla porque es el punto de referencia: sus coeficientes son cero por construcción.</p>`),
    T('Por qué cambian todos los números al cambiar la base',
      `<p>Si corres <code>base(1)</code> y después <code>base(2)</code>, los coeficientes cambian por completo. <strong>No es que el modelo cambie</strong>: el ajuste, la log-verosimilitud y las probabilidades predichas son idénticos.</p>
       <p>Lo que cambia es contra qué estás comparando. Es como medir alturas: si cambias de "respecto al suelo" a "respecto al nivel del mar", todos los números cambian y nadie creció.</p>`,
      { ojo: 'Por eso <strong>siempre</strong> hay que decir cuál es la base. Un coeficiente de mlogit sin base declarada no significa nada.' }),
    T('Coeficientes, RRR y efectos marginales',
      `<div class="tabla-wrap"><table>
        <tr><th>Qué</th><th>Comando</th><th>Necesita "comparado con la base"</th><th>Cómo se lee</th></tr>
        <tr><td>Coeficiente</td><td><code>mlogit</code></td><td><strong>Sí, obligatorio</strong></td><td>Solo signo y significancia</td></tr>
        <tr><td>RRR (razón de riesgo relativo)</td><td><code>mlogit, rrr</code></td><td><strong>Sí, obligatorio</strong></td><td>Multiplica la chance relativa. Neutro = 1</td></tr>
        <tr><td>Efecto marginal</td><td><code>margins, dydx(*) predict(outcome(2))</code></td><td><strong>No</strong></td><td>Puntos de probabilidad de estar en ESA categoría</td></tr>
      </table></div>
      <p>Ese "No" de la última fila es la razón por la que conviene reportar efectos marginales en un multinomial: <strong>se explican solos</strong>, sin la muletilla.</p>`),
    T('Los efectos marginales suman cero',
      `<p>Si corres <code>margins</code> para las tres categorías y sumas el efecto de una variable, da <strong>exactamente cero</strong>.</p>
       <p>Tiene todo el sentido: las probabilidades de las tres categorías suman 1 siempre. Si una variable sube la probabilidad de una, tiene que bajar la de alguna otra. No se crea probabilidad de la nada.</p>
       <p>Es una buena forma de comprobar que no te equivocaste al copiar los números.</p>`),
    T('El supuesto IIA, en cristiano',
      `<p><strong>IIA</strong> = las opciones son independientes entre sí: agregar o quitar una no cambia cómo se comparan las demás.</p>
       <p>El ejemplo clásico: si la gente elige entre <em>bus</em> y <em>carro</em> mitad y mitad, y aparece un <em>bus azul</em> idéntico al bus, el modelo predice que los tres se reparten un tercio cada uno. En la realidad los dos buses se reparten la mitad que tenía el bus, y el carro no se mueve.</p>
       <p>Se prueba con <code>mlogtest, hausman</code>. Si no se rechaza, sigue adelante y <strong>menciónalo en el trabajo</strong>: probar IIA y reportarlo es de las cosas que más suman.</p>`),
    T('¿Y mprobit?',
      `<p>Misma pregunta, curva normal en vez de logística. Se usa para <strong>confirmar</strong> que la conclusión no depende de la distribución supuesta.</p>
       <p>Un detalle que casi nadie sabe: el <code>mprobit</code> de Stata <strong>también supone IIA</strong> por dentro, aunque mucha gente crea que no. Los que de verdad lo relajan son <code>asmprobit</code> y <code>nlogit</code>.</p>`,
      { ojo: 'Si IIA se rechaza, cambiar a <code>mprobit</code> <u>no</u> arregla el problema. Hay que juntar categorías parecidas o usar un modelo anidado.' }),
    T('¿Y si mis categorías tienen orden?',
      `<p>Entonces <code>mlogit</code> está <strong>desperdiciando información</strong>: trata "muy feliz" y "muy triste" como dos categorías sin relación, cuando en realidad hay una escalera.</p>
       <p><code>ologit</code> aprovecha ese orden y por eso necesita muchos menos coeficientes: uno por variable, en vez de uno por variable <em>y</em> por categoría. Menos parámetros = más precisión.</p>
       <p>El precio es el supuesto de <strong>líneas paralelas</strong>: que el efecto de cada variable es el mismo para pasar del nivel 1 al 2 que del 4 al 5.</p>`),
  ],
  comandos: ['mlogit situacion educ exper mujer, base(1)', 'mlogit situacion educ exper mujer, base(1) rrr', 'margins, dydx(*) predict(outcome(2))', 'mlogtest, hausman', 'mprobit situacion educ mujer, base(1)'],
},
// ═══════════════════════════════════════════════════════════════════
{
  id: 'base', icono: '🧹', titulo: 'La lógica de manejar la base',
  gancho: 'Depurar no es trámite: cada decisión que tomas con los datos cambia los resultados, y hay que poder defenderla.',
  secciones: [
    T('Por qué el faltante es más grande que cualquier número',
      `<p>Stata guarda el faltante como un valor gigantesco, más grande que cualquier número real. No es un capricho: es para que ordenar deje los vacíos al final.</p>
       <p>La consecuencia práctica es brutal: <code>keep if edad >= 18</code> <strong>se queda con los vacíos</strong>, porque para Stata el vacío es mayor que 18.</p>
       <p>La forma correcta:</p>
       <p><code>keep if edad >= 18 & !missing(edad)</code></p>`,
      { ojo: 'Este solo detalle ha arruinado tesis enteras. Cada vez que uses <code>&gt;</code> o <code>&gt;=</code> con una variable que tenga vacíos, piénsalo.' }),
    T('Borrar filas: cuándo sí y cuándo no',
      `<ul>
        <li><b>Faltan al azar</b> (alguien se saltó una pregunta sin razón) → borrarlas no sesga nada. Adelante.</li>
        <li><b>Faltan por una razón</b> (los que más ganan no contestan el ingreso) → borrarlas <strong>sí sesga</strong> tu resultado. Puedes borrarlas igual, pero <u>tienes que decirlo</u> y explicar hacia dónde crees que sesga.</li>
        <li><b>Códigos 99 / 999</b> → no son datos, son "no responde". Convertirlos con <code>mvdecode</code> es obligatorio, no opcional.</li>
        <li><b>Valores imposibles</b> (edad 250) → borrar. Es un error de digitación.</li>
        <li><b>Valores extremos pero posibles</b> (un ingreso de 8.000) → <strong>no borrar</strong> solo porque estorba. Eso es maquillar los datos.</li>
      </ul>`),
    T('Por qué se bota una sola vez',
      `<p>Si el modelo 1 usa 3.000 casos y el modelo 2 usa 2.850 porque metiste otra variable con vacíos, <strong>los R² no son comparables</strong> y los coeficientes tampoco: están estimados sobre gente distinta.</p>
       <p>Por eso la muestra se define <u>una vez</u>, al principio, con todas las variables que van a aparecer en cualquiera de tus modelos:</p>
       <p><code>drop if missing(ingreso, educ, exper, horas, tamano)</code></p>`),
    T('La cadena de una variable de texto',
      `<p>Una variable alfanumérica no entra en ningún modelo. El camino completo, en orden:</p>
       <ol>
        <li><b>Mirarla</b> — <code>tab sexo_txt</code>. Aquí descubres que hay "Mujer", "MUJER " y "mujer".</li>
        <li><b>Limpiarla</b> — <code>replace sexo_txt = upper(trim(sexo_txt))</code>. Si no, el paso siguiente te crea categorías de más.</li>
        <li><b>Convertirla</b> — <code>encode sexo_txt, gen(sexo)</code> si son categorías, <code>destring</code> si son números escritos como texto.</li>
        <li><b>Comprobar</b> — <code>tab sexo</code>. ¿Salieron las categorías que esperabas?</li>
       </ol>
       <p>Saltarse el paso 2 es el error más común, y no da error: simplemente te salen 11 sexos y no te das cuenta.</p>`),
    T('Recodificar: las cuatro etapas',
      `<ol>
        <li><b>Recodificar</b> — <code>recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)</code>. Siempre con <code>gen()</code>, nunca encima de la original.</li>
        <li><b>Comprobar el cruce</b> — <code>tab satisf satisf3</code>. Cada valor viejo debe caer en uno solo nuevo.</li>
        <li><b>Etiquetar</b> — <code>label define</code> y <code>label values</code>. La variable nueva nace sin etiquetas.</li>
        <li><b>Verificar</b> — <code>tab satisf3</code>. ¿Se lee bien?</li>
      </ol>
      <p>Y una advertencia de fondo: junta categorías por una <strong>razón sustantiva</strong> (pocos casos, no le importa a tu pregunta), nunca porque así sale significativo. Eso se nota y se castiga.</p>`),
  ],
  comandos: ['use enemdu_eloro_2024_crudo, clear', 'misstable summarize', 'duplicates report', 'mvdecode edad educ, mv(99)', 'encode sexo_txt, gen(sexo)'],
},
];

export function buscarConcepto(id) { return CONCEPTOS.find((c) => c.id === id) || null; }
