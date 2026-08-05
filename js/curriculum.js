// Curso por módulos. Cada lección se desbloquea al terminar la anterior.
// La validación la evalúa app.js sobre el comando escrito y el estado de la base.

const L = (id, titulo, objetivo, teoria, tarea, ejemplo, validar, pistas, xp, felicitacion) =>
  ({ id, titulo, objetivo, teoria, tarea, ejemplo, validar, pistas, xp, felicitacion });

export const MODULOS = [
// ────────────────────────────────────────────────────────────── 0
{
  id: 'm0', titulo: 'Primer contacto', subtitulo: 'Abrir una base y mirarla', icono: '📂',
  requiere: [], color: 'blue',
  lecciones: [
    L('m0l1', 'Abrir una base de datos',
      'Vas a cargar en memoria la encuesta con la que trabajarás todo el curso.',
      `<p>Stata trabaja con <strong>una base a la vez</strong>, cargada en memoria. Mientras no abras una, cualquier comando te dirá "no hay datos".</p>
       <p>El comando es <code>use</code>. La palabra <code>clear</code> al final significa "si ya había algo abierto, bótalo". Se pone casi siempre.</p>
       <p>Fíjate en la coma: en Stata <strong>todo lo que va después de una coma son opciones</strong>. Esa coma es la fuente de la mitad de los errores de principiante.</p>`,
      'Abre la base <code>enemdu_eloro_2024</code>.',
      'use enemdu_eloro_2024, clear',
      { comandos: ['use'] },
      ['El comando se llama <code>use</code>, igual que en inglés "usar".',
       'Después del nombre de la base va una coma y la palabra <code>clear</code>.',
       'Escribe exactamente: <code>use enemdu_eloro_2024, clear</code>'],
      10, '¡Listo! Ya tienes 3.412 personas cargadas. De aquí en adelante todo sale de esta base.'),

    L('m0l2', 'Ver qué variables hay',
      'Antes de tocar nada, hay que saber qué trae la base.',
      `<p><code>describe</code> te muestra la lista de columnas: cómo se llama cada una, si guarda números o texto, y qué significa.</p>
       <p>Esto no es un trámite: aquí es donde descubres que una variable que creías numérica en realidad es <strong>texto</strong>, y que por eso más adelante no entrará en tu regresión.</p>`,
      'Muestra la lista de variables de la base.',
      'describe',
      { comandos: ['describe'] },
      ['Es una sola palabra, sin nada más.',
       'Se puede abreviar como <code>d</code>.',
       'Escribe: <code>describe</code>'],
      10, 'Eso es. Mirar la base antes de tocarla te va a ahorrar horas de confusión.'),

    L('m0l3', 'Mirar los datos por dentro',
      'Ver las filas de verdad, no solo los nombres.',
      `<p><code>list</code> te muestra las observaciones. Como son miles, conviene pedir solo unas pocas con <code>in 1/10</code> (de la 1 a la 10).</p>
       <p>La palabra <code>in</code> selecciona <strong>por número de fila</strong>. Más adelante verás <code>if</code>, que selecciona <strong>por condición</strong>. No son lo mismo.</p>`,
      'Muestra las primeras 10 filas de <code>ingreso</code>, <code>educ</code> y <code>mujer</code>.',
      'list ingreso educ mujer in 1/10',
      { comandos: ['list'], variables: ['ingreso', 'educ', 'mujer'] },
      ['El comando es <code>list</code> seguido de las variables.',
       'Para limitar las filas se agrega <code>in 1/10</code> al final.',
       'Escribe: <code>list ingreso educ mujer in 1/10</code>'],
      10, 'Perfecto. Fíjate que en vez de 0 y 1 aparece "Hombre" y "Mujer": eso es porque la variable tiene etiquetas puestas.'),

    L('m0l4', 'Contar con una condición',
      'Aprender a usar <code>if</code>, que vas a escribir mil veces.',
      `<p><code>count</code> cuenta observaciones. Con <code>if</code> cuenta solo las que cumplen algo.</p>
       <p>Ojo con una cosa que confunde a todo el mundo: para <strong>comparar</strong> se usan <strong>dos</strong> iguales <code>==</code>. Un solo <code>=</code> sirve únicamente para asignar valores. Si te equivocas, Stata te va a reclamar.</p>`,
      'Cuenta cuántas mujeres hay en la base.',
      'count if mujer == 1',
      { comandos: ['count'], contiene: ['=='] },
      ['El comando es <code>count</code> y la condición va después de <code>if</code>.',
       'Acuérdate: para comparar son <strong>dos</strong> signos igual.',
       'Escribe: <code>count if mujer == 1</code>'],
      15, 'Muy bien. Ese <code>==</code> es de las cosas que más se olvidan; ya lo tienes.'),

    L('m0l5', 'Dejar comentarios',
      'Escribir notas dentro del código para acordarte de qué hiciste.',
      `<p>Una línea que empieza con <code>*</code> es un comentario: Stata la ignora por completo.</p>
       <p>También puedes poner <code>//</code> al final de una línea para comentar solo esa parte.</p>
       <p>Parece un detalle, pero cuando vuelvas a tu trabajo en tres semanas los comentarios son lo único que te va a salvar.</p>`,
      'Escribe un comentario que diga de qué se trata tu trabajo.',
      '* Trabajo de econometría: ingresos en El Oro 2024',
      { esComentario: true },
      ['Empieza la línea con un asterisco <code>*</code>.',
       'Después del asterisco escribe lo que quieras, en español normal.',
       'Por ejemplo: <code>* Trabajo de econometría: ingresos en El Oro</code>'],
      10, 'Bien. Un código comentado vale el doble que uno sin comentar.'),
  ],
},
// ────────────────────────────────────────────────────────────── 1
{
  id: 'm1', titulo: 'El do-file', subtitulo: 'Escribir código que se pueda repetir', icono: '📝',
  requiere: ['m0'], color: 'ochre',
  lecciones: [
    L('m1l1', '¿Qué es un do-file y por qué importa?',
      'Entender por qué nadie serio trabaja escribiendo comandos sueltos.',
      `<p>Un <strong>do-file</strong> es un archivo de texto con todos tus comandos, en orden, uno por línea. Lo corres y se ejecuta todo de principio a fin.</p>
       <p>¿Por qué importa tanto? Por tres razones:</p>
       <ul>
         <li><strong>Se puede repetir.</strong> Si tu profe pregunta "¿y si sacas a los menores de 18?", cambias una línea y vuelves a correr todo.</li>
         <li><strong>Se puede revisar.</strong> Cualquiera puede ver exactamente qué hiciste con los datos.</li>
         <li><strong>Te salva.</strong> Si tocas la base a mano y algo sale mal, no hay vuelta atrás. Con un do-file siempre puedes volver a empezar desde los datos originales.</li>
       </ul>
       <p>Abre la pestaña <strong>Do-file</strong> de arriba: ahí vas a escribir de ahora en adelante.</p>`,
      'Abre el editor de do-file.',
      'doedit',
      { comandos: ['doedit'] },
      ['El comando abre el editor.', 'Se llama <code>doedit</code>.', 'Escribe: <code>doedit</code>'],
      10, 'Ese es tu cuaderno de trabajo. Todo lo importante se escribe ahí, no en la consola.'),

    L('m1l2', 'El encabezado de un do-file',
      'Empezar todo trabajo con la misma cabecera limpia.',
      `<p>Todo do-file profesional empieza igual:</p>
       <ul>
         <li>Un <strong>bloque de comentarios</strong> con el título, tu nombre y la fecha.</li>
         <li><code>clear all</code> — vacía la memoria para empezar de cero.</li>
         <li><code>set more off</code> — evita que la salida se detenga cada pantalla.</li>
         <li>Después recién <code>use ...</code>.</li>
       </ul>
       <p>Empezar siempre desde cero es lo que garantiza que el resultado sea el mismo hoy y dentro de un mes.</p>`,
      'Escribe <code>clear all</code> para vaciar la memoria.',
      'clear all',
      { comandos: ['clear'] },
      ['Son dos palabras.', 'La primera es <code>clear</code>.', 'Escribe: <code>clear all</code>'],
      10, 'Así se empieza. Memoria limpia, resultados confiables.'),

    L('m1l3', 'Correr un do-file entero',
      'Ejecutar varias líneas de una sola vez.',
      `<p>En la pestaña <strong>Do-file</strong> escribes varias líneas y le das a <strong>Ejecutar todo</strong>. El simulador las corre en orden y te muestra el registro completo.</p>
       <p>Si una línea falla, se <strong>detiene ahí</strong> y te dice en qué línea fue. Eso es a propósito: si siguiera, todo lo de abajo estaría mal calculado.</p>`,
      'En la pestaña Do-file, escribe estas tres líneas y ejecútalas:<br><code>clear all</code><br><code>use enemdu_eloro_2024, clear</code><br><code>describe</code>',
      'clear all\nuse enemdu_eloro_2024, clear\ndescribe',
      { esDoFile: true, minLineas: 3 },
      ['Cambia a la pestaña Do-file, arriba.',
       'Escribe las tres líneas, una debajo de otra.',
       'Después presiona el botón "Ejecutar todo".'],
      20, '¡Eso! Acabas de correr tu primer do-file. Así se entregan los trabajos de verdad.'),

    L('m1l4', 'Partir una línea muy larga',
      'Que el código se pueda leer sin desplazarse a la derecha.',
      `<p>Cuando un comando queda larguísimo, se corta con <code>///</code> al final de la línea y se sigue abajo.</p>
       <p>Es cosmético, pero un modelo con diez variables en una sola línea es ilegible, y en un trabajo eso se nota.</p>`,
      'Escribe una regresión partida en dos líneas con <code>///</code>.',
      'reg ingreso educ exper ///\n    mujer horas, robust',
      { esDoFile: true, contiene: ['///'] },
      ['Al final de la primera línea pon <code>///</code> y sigue abajo.',
       'La segunda línea suele ir con sangría, para que se vea que es continuación.',
       'Por ejemplo:<br><code>reg ingreso educ exper ///</code><br><code>    mujer horas, robust</code>'],
      15, 'Muy bien. Detalles como este son los que separan un código ordenado de uno que da pereza leer.'),

    L('m1l5', 'Guardar el registro de lo que hiciste',
      'Dejar constancia de la sesión.',
      `<p>En Stata real, <code>log using resultados.log, replace</code> empieza a grabar todo lo que sale en pantalla, y <code>log close</code> lo cierra.</p>
       <p>En este simulador todo queda grabado solo: puedes bajarlo con el botón <strong>Descargar log</strong>. Pero conviene que conozcas el comando, porque en Stata de verdad lo vas a necesitar.</p>`,
      'Prueba el comando de registro.',
      'log using resultados, replace',
      { comandos: ['log'] },
      ['El comando se llama <code>log</code>.',
       'Va seguido de <code>using</code> y un nombre de archivo.',
       'Escribe: <code>log using resultados, replace</code>'],
      10, 'Anotado. En Stata real, ese archivo es tu respaldo cuando el profe pide "muéstrame la salida".'),
  ],
},
// ────────────────────────────────────────────────────────────── 2
{
  id: 'm2', titulo: 'Depuración', subtitulo: 'Vacíos, repetidos y valores imposibles', icono: '🧹',
  requiere: ['m1'], color: 'nosig',
  lecciones: [
    L('m2l1', 'Abrir la base sucia',
      'Trabajar con datos como salen de verdad del campo.',
      `<p>Hasta ahora usaste la base ya limpia. Pero los datos reales <strong>nunca</strong> llegan así.</p>
       <p>La base <code>enemdu_eloro_2024_crudo</code> es la misma encuesta, pero tal como sale del operativo: con el ingreso escrito como texto, códigos 99 y 999, celdas vacías, filas repetidas y hasta edades de 250 años.</p>
       <p>Los siguientes ejercicios son para dejarla utilizable. Esta parte es, de lejos, la que más tiempo toma en un trabajo real.</p>`,
      'Abre la base sin depurar.',
      'use enemdu_eloro_2024_crudo, clear',
      { comandos: ['use'], contiene: ['crudo'] },
      ['Es el mismo comando <code>use</code> de antes.',
       'La base se llama <code>enemdu_eloro_2024_crudo</code>.',
       'Escribe: <code>use enemdu_eloro_2024_crudo, clear</code>'],
      10, 'Ahí la tienes, con todos sus defectos. Vamos a arreglarla paso a paso.'),

    L('m2l2', 'Buscar los vacíos',
      'Saber cuántos datos faltan y dónde.',
      `<p><code>misstable summarize</code> te dice, variable por variable, cuántos valores faltan.</p>
       <p>Un valor faltante en Stata se escribe como un punto <code>.</code> y significa "aquí no hay dato". No es lo mismo que un cero.</p>
       <p>Antes de borrar nada, pregúntate <strong>por qué</strong> falta. Si faltan al azar, borrarlos no hace daño. Si faltan por una razón (por ejemplo, los que más ganan no contestan), borrarlos sesga tu resultado y hay que decirlo.</p>`,
      'Averigua cuántos valores faltantes tiene cada variable.',
      'misstable summarize',
      { comandos: ['misstable'] },
      ['El comando empieza con <code>miss</code>...',
       'Es <code>misstable</code> seguido de <code>summarize</code>.',
       'Escribe: <code>misstable summarize</code>'],
      15, 'Ahí está el mapa de los huecos. Ahora sabes exactamente qué te falta.'),

    L('m2l3', 'La trampa del faltante',
      'Entender por qué <code>keep if edad >= 18</code> se lleva los vacíos.',
      `<p>Esta es <strong>la trampa que más trabajos arruina</strong>, y casi nadie la explica.</p>
       <p>Para Stata, el faltante <code>.</code> <strong>vale más que cualquier número</strong>. Literalmente: <code>. > 1000000</code> es verdadero.</p>
       <p>¿Qué significa eso en la práctica? Que si escribes <code>keep if edad >= 18</code>, te quedas con los mayores de 18 <strong>y también con todos los que no contestaron la edad</strong>. Y tú creías que los habías botado.</p>
       <p>La forma correcta es agregar la condición explícita:<br><code>keep if edad >= 18 & !missing(edad)</code><br>El signo <code>!</code> significa "no".</p>`,
      'Cuenta cuántas personas tienen la edad vacía.',
      'count if missing(edad)',
      { comandos: ['count'], contiene: ['missing'] },
      ['Usa <code>count</code> con una condición.',
       'La función que detecta vacíos se llama <code>missing()</code>.',
       'Escribe: <code>count if missing(edad)</code>'],
      20, 'Esta lección vale oro. El día que se la expliques a un compañero vas a entender cuánto.'),

    L('m2l4', 'Los códigos de no respuesta',
      'Convertir el 99 y el 999 en verdaderos faltantes.',
      `<p>En las encuestas, "no sabe / no responde" no se guarda vacío: se guarda como un código, casi siempre <strong>99</strong>, <strong>999</strong> o <strong>-1</strong>.</p>
       <p>El peligro es enorme: si no los conviertes, Stata cree que hay gente de <strong>99 años de estudio</strong> y te calcula un promedio absurdo.</p>
       <p><code>mvdecode</code> los convierte en faltantes de verdad.</p>`,
      'Convierte el código 99 de <code>edad</code> y <code>educ</code> en faltante.',
      'mvdecode edad educ, mv(99)',
      { comandos: ['mvdecode'] },
      ['El comando es <code>mvdecode</code>, seguido de las variables.',
       'El código a convertir va en la opción <code>mv()</code>.',
       'Escribe: <code>mvdecode edad educ, mv(99)</code>'],
      20, 'Perfecto. Acabas de evitar el error más caro de toda la depuración.'),

    L('m2l5', 'Los códigos de las horas',
      'Repetir la operación con otro código.',
      `<p>La variable <code>horas</code> usa <strong>999</strong> como "no responde", no 99. Cada variable puede tener el suyo, y eso lo dice el manual de la encuesta.</p>
       <p>Cuando no tienes el manual, se descubren mirando: <code>tab horas</code> o <code>summarize horas</code> y buscando valores imposibles.</p>`,
      'Convierte el código 999 de <code>horas</code> en faltante.',
      'mvdecode horas, mv(999)',
      { comandos: ['mvdecode'], contiene: ['999'] },
      ['Es el mismo <code>mvdecode</code> de antes.',
       'Ahora el código es 999 y la variable es <code>horas</code>.',
       'Escribe: <code>mvdecode horas, mv(999)</code>'],
      15, 'Ya te está saliendo solo. Cada variable con su propio código: así se hace.'),

    L('m2l6', 'Filas repetidas',
      'Encontrar y eliminar duplicados.',
      `<p>En los operativos de campo pasa que una misma encuesta se digita dos veces. Si no lo detectas, esas personas <strong>pesan el doble</strong> en todos tus resultados.</p>
       <p>Se revisa en dos pasos: primero <code>duplicates report</code> para ver cuántos hay, y solo si hay, <code>duplicates drop</code> para borrarlos.</p>
       <p>Nunca borres sin mirar primero.</p>`,
      'Averigua cuántas filas repetidas hay.',
      'duplicates report',
      { comandos: ['duplicates'] },
      ['El comando es <code>duplicates</code>.',
       'El subcomando para contar es <code>report</code>.',
       'Escribe: <code>duplicates report</code>'],
      15, 'Ahí están las 14 repetidas. Ahora bórralas con <code>duplicates drop</code>.'),

    L('m2l7', 'Borrar los repetidos',
      'Dejar una sola copia de cada fila.',
      `<p><code>duplicates drop</code> conserva la primera aparición de cada fila y borra las demás.</p>
       <p>Después de correrlo, siempre comprueba cuántas observaciones quedaron: ese número va en tu informe.</p>`,
      'Elimina las filas repetidas.',
      'duplicates drop',
      { comandos: ['duplicates'], contiene: ['drop'] },
      ['Mismo comando <code>duplicates</code>.',
       'Ahora el subcomando es <code>drop</code>.',
       'Escribe: <code>duplicates drop</code>'],
      15, 'Base sin repetidos. De 3.426 filas quedaron 3.412, exactamente las 14 que sobraban.'),

    L('m2l8', 'Valores imposibles',
      'Detectar errores de digitación.',
      `<p>Hay datos que no faltan pero son <strong>imposibles</strong>: una edad de 250 años, un ingreso de 999.999 dólares.</p>
       <p>Se encuentran mirando los mínimos y máximos con <code>summarize</code>. Si el máximo de edad es 250, ahí hay algo mal.</p>
       <p>Ojo con la diferencia: un ingreso alto <strong>puede ser real</strong> (hay gente que gana mucho). Una edad de 250 <strong>no</strong>. El primero se conserva; el segundo se corrige o se borra, y se explica en el informe.</p>`,
      'Mira los mínimos y máximos de <code>edad</code> para encontrar los imposibles.',
      'summarize edad',
      { comandos: ['summarize'], variables: ['edad'] },
      ['El comando es <code>summarize</code> (se abrevia <code>sum</code>).',
       'Va seguido del nombre de la variable.',
       'Escribe: <code>summarize edad</code>'],
      15, 'Fíjate en el máximo. Ninguna persona de esta encuesta tiene 250 años: eso es un error de digitación.'),

    L('m2l9', 'Botar los imposibles',
      'Eliminar las filas con datos que no pueden ser.',
      `<p>Con <code>drop if</code> borras las filas que cumplen una condición.</p>
       <p>Sé conservadora: bota solo lo que es <strong>físicamente imposible</strong>, no lo que simplemente te parece alto. Y siempre di en tu informe cuántas observaciones botaste y por qué.</p>`,
      'Borra las personas con edad mayor a 100 años.',
      'drop if edad > 100 & !missing(edad)',
      { comandos: ['drop'], contiene: ['edad'] },
      ['Usa <code>drop if</code> con una condición sobre <code>edad</code>.',
       'Acuérdate de la trampa del faltante: agrega <code>& !missing(edad)</code>.',
       'Escribe: <code>drop if edad > 100 & !missing(edad)</code>'],
      20, '¡Muy bien! Y usaste <code>!missing()</code>: ya interiorizaste la trampa.'),
  ],
},
// ────────────────────────────────────────────────────────────── 3
{
  id: 'm3', titulo: 'Texto y números', subtitulo: 'Variables alfanuméricas', icono: '🔤',
  requiere: ['m2'], color: 'blue',
  lecciones: [
    L('m3l1', 'Por qué el texto no entra en una regresión',
      'Entender la diferencia entre una variable de texto y una numérica.',
      `<p>Una variable <strong>alfanumérica</strong> (o "string") guarda letras: <code>"Mujer"</code>, <code>"1.234,50"</code>, <code>"El Oro"</code>.</p>
       <p>Stata <strong>no puede hacer cuentas con letras</strong>. Si intentas meter una variable de texto en una regresión, te dice "type mismatch" y no corre.</p>
       <p>Hay dos caminos, y elegir mal es un error clásico:</p>
       <ul>
         <li>Si el texto son <strong>categorías</strong> ("Hombre"/"Mujer") → <code>encode</code>, que las numera y les pone etiquetas.</li>
         <li>Si el texto son <strong>números mal guardados</strong> ("1.234,50") → <code>destring</code>, que los convierte en números de verdad.</li>
       </ul>`,
      'Mira qué variables son de texto en esta base.',
      'describe',
      { comandos: ['describe'] },
      ['Es el comando que ya usaste en el módulo 0.',
       'Muestra el tipo de cada variable.',
       'Escribe: <code>describe</code>'],
      10, 'Fíjate en la columna "Tipo": las que dicen "texto" son las que hay que convertir.'),

    L('m3l2', 'Números guardados como texto',
      'Convertir <code>ingreso_txt</code> en un número usable.',
      `<p><code>ingreso_txt</code> tiene valores como <code>"1.234,50"</code> (punto de miles, coma decimal) y también <code>"NA"</code> o <code>"s/i"</code>.</p>
       <p><code>destring</code> lo convierte, pero se atraganta con lo que no es número. Dos opciones:</p>
       <ul>
         <li><code>ignore(".,$ ")</code> — quita esos caracteres antes de convertir.</li>
         <li><code>force</code> — lo que siga sin ser número queda vacío.</li>
       </ul>
       <p>Casi siempre se usan las dos juntas.</p>`,
      'Convierte <code>ingreso_txt</code> en una variable numérica llamada <code>ingreso</code>.',
      'destring ingreso_txt, gen(ingreso) ignore(".,$ ") force',
      { comandos: ['destring'], creaVariable: 'ingreso' },
      ['El comando es <code>destring</code>.',
       'Necesitas <code>gen(ingreso)</code> para la nueva variable, y <code>ignore()</code> para los caracteres raros.',
       'Escribe: <code>destring ingreso_txt, gen(ingreso) ignore(".,$ ") force</code>'],
      25, '¡Excelente! Ese era de los difíciles. Ya tienes el ingreso como número.'),

    L('m3l3', 'Limpiar texto antes de convertirlo',
      'Unificar "Mujer", "MUJER " y "mujer" en una sola cosa.',
      `<p>Si conviertes <code>sexo_txt</code> tal como viene, te salen <strong>muchas más categorías de las que debería</strong>: para Stata, <code>"Mujer"</code>, <code>"MUJER "</code> y <code>"mujer"</code> son tres cosas distintas.</p>
       <p>Se arregla antes de convertir, con dos funciones:</p>
       <ul>
         <li><code>trim()</code> — quita los espacios de los bordes.</li>
         <li><code>upper()</code> — pasa todo a mayúsculas.</li>
       </ul>
       <p>Se pueden anidar: <code>upper(trim(sexo_txt))</code>.</p>`,
      'Deja <code>sexo_txt</code> todo en mayúsculas y sin espacios sobrantes.',
      'replace sexo_txt = upper(trim(sexo_txt))',
      { comandos: ['replace'], contiene: ['upper', 'trim'] },
      ['Usa <code>replace</code> sobre la misma variable.',
       'Anida las dos funciones: <code>upper(trim(...))</code>.',
       'Escribe: <code>replace sexo_txt = upper(trim(sexo_txt))</code>'],
      20, 'Así se hace. Limpiar antes de convertir te ahorra el desastre de tener 11 sexos distintos.'),

    L('m3l4', 'Texto de categorías a número',
      'Usar <code>encode</code> para pasar palabras a códigos con etiquetas.',
      `<p><code>encode</code> toma una variable de texto, ordena los valores alfabéticamente, les asigna 1, 2, 3... y <strong>les pone las etiquetas automáticamente</strong>. Esa última parte es lo bueno: la variable queda numérica pero se sigue leyendo en palabras.</p>
       <p>Siempre necesita <code>gen()</code>: nunca pisa la variable original.</p>`,
      'Convierte <code>sexo_txt</code> en una variable numérica llamada <code>sexo</code>.',
      'encode sexo_txt, gen(sexo)',
      { comandos: ['encode'], creaVariable: 'sexo' },
      ['El comando es <code>encode</code>.',
       'Necesita la opción <code>gen()</code> con el nombre nuevo.',
       'Escribe: <code>encode sexo_txt, gen(sexo)</code>'],
      20, 'Perfecto. Mira cómo quedó con <code>tab sexo</code>: número por dentro, palabra por fuera.'),

    L('m3l5', 'El camino de vuelta',
      'Convertir de número con etiquetas a texto.',
      `<p><code>decode</code> hace lo contrario de <code>encode</code>: agarra una variable numérica etiquetada y saca el texto.</p>
       <p>Sirve poco para modelar, pero mucho para exportar tablas a Word o Excel, donde quieres que se lea "Microempresa" y no "1".</p>`,
      'Crea una versión de texto de <code>tamano</code>.',
      'decode tamano, gen(tamano_txt)',
      { comandos: ['decode'] },
      ['El comando es <code>decode</code>.',
       'También necesita <code>gen()</code>.',
       'Escribe: <code>decode tamano, gen(tamano_txt)</code>'],
      15, 'Listo. Ya sabes ir y volver entre texto y número.'),
  ],
},
// ────────────────────────────────────────────────────────────── 4
{
  id: 'm4', titulo: 'Etiquetas', subtitulo: 'Que las tablas se lean solas', icono: '🏷️',
  requiere: ['m3'], color: 'sig',
  lecciones: [
    L('m4l1', 'Nombrar una variable',
      'Ponerle a la columna un nombre que se entienda.',
      `<p><code>label variable</code> le pone a la columna una descripción en español. No cambia los datos: cambia cómo se lee tu salida.</p>
       <p>En un trabajo entregado, una tabla que dice "educ" y otra que dice "Años de estudio aprobados" no valen lo mismo.</p>`,
      'Ponle a <code>ingreso</code> la etiqueta "Ingreso mensual en dólares".',
      'label variable ingreso "Ingreso mensual en dólares"',
      { comandos: ['label'], contiene: ['variable'] },
      ['El comando es <code>label variable</code>.',
       'El texto va entre comillas dobles.',
       'Escribe: <code>label variable ingreso "Ingreso mensual en dólares"</code>'],
      15, 'Así se hace. Tu tabla ya se entiende sin explicaciones.'),

    L('m4l2', 'Crear un diccionario de valores',
      'Definir qué significa cada código.',
      `<p>Etiquetar los <strong>valores</strong> son <strong>tres pasos distintos</strong>, y aquí es donde todo el mundo se pierde:</p>
       <ol>
         <li><code>label define</code> — crea el diccionario (todavía no está pegado a nada).</li>
         <li><code>label values</code> — pega el diccionario a una variable.</li>
         <li><code>label list</code> — muestra los diccionarios que existen.</li>
       </ol>
       <p>El paso que más se olvida es el segundo. Creas el diccionario, no lo pegas, y te preguntas por qué la tabla sigue mostrando números.</p>`,
      'Crea un diccionario llamado <code>lbl_urb</code> con 0 = "Rural" y 1 = "Urbano".',
      'label define lbl_urb 0 "Rural" 1 "Urbano"',
      { comandos: ['label'], contiene: ['define'] },
      ['El comando es <code>label define</code> seguido del nombre del diccionario.',
       'Después van los pares: número, texto entre comillas.',
       'Escribe: <code>label define lbl_urb 0 "Rural" 1 "Urbano"</code>'],
      20, 'Diccionario creado. Ahora falta el paso que todo el mundo olvida: pegarlo.'),

    L('m4l3', 'Pegar el diccionario a la variable',
      'El paso que casi todos se saltan.',
      `<p><code>label values</code> conecta la variable con el diccionario. Recién ahí las tablas empiezan a mostrar palabras.</p>
       <p>Truco para acordarte del orden: primero la <strong>variable</strong>, después el <strong>diccionario</strong>. Como "ponle a <em>urbano</em> las etiquetas <em>lbl_urb</em>".</p>`,
      'Pega el diccionario <code>lbl_urb</code> a la variable <code>urbano</code>.',
      'label values urbano lbl_urb',
      { comandos: ['label'], contiene: ['values'] },
      ['El comando es <code>label values</code>.',
       'Primero la variable, después el diccionario.',
       'Escribe: <code>label values urbano lbl_urb</code>'],
      20, '¡Eso! Ahora compruébalo con <code>tab urbano</code> y verás las palabras en vez de 0 y 1.'),

    L('m4l4', 'Comprobar que quedó bien',
      'Nunca dar por hecho que funcionó.',
      `<p>Después de etiquetar, <strong>siempre</strong> comprueba. <code>tab</code> te muestra la variable con sus etiquetas puestas.</p>
       <p>Si sigues viendo números, es que el <code>label values</code> no se corrió o el nombre del diccionario está mal escrito.</p>`,
      'Comprueba que <code>urbano</code> ahora muestra "Rural" y "Urbano".',
      'tab urbano',
      { comandos: ['tabulate'], variables: ['urbano'] },
      ['El comando es <code>tabulate</code>, que se abrevia <code>tab</code>.',
       'Va seguido del nombre de la variable.',
       'Escribe: <code>tab urbano</code>'],
      10, 'Comprobado. Esa costumbre de verificar todo lo que haces vale más que cualquier comando.'),

    L('m4l5', 'Ver todos los diccionarios',
      'Revisar qué etiquetas existen en la base.',
      `<p><code>label list</code> muestra todos los diccionarios definidos y qué significa cada código.</p>
       <p>Es lo primero que se mira cuando recibes una base ajena y no sabes qué quiere decir "sector = 3".</p>`,
      'Muestra todos los diccionarios de etiquetas.',
      'label list',
      { comandos: ['label'], contiene: ['list'] },
      ['El comando es <code>label</code> seguido de <code>list</code>.',
       'No lleva nada más.',
       'Escribe: <code>label list</code>'],
      10, 'Bien. Ahí tienes el mapa completo de códigos de la base.'),
  ],
},
// ────────────────────────────────────────────────────────────── 5
{
  id: 'm5', titulo: 'Recodificar', subtitulo: 'De 5 categorías a 3', icono: '🔀',
  requiere: ['m4'], color: 'ochre',
  lecciones: [
    L('m5l1', '¿Por qué juntar categorías?',
      'Entender cuándo conviene reducir niveles.',
      `<p>Tienes <code>satisf</code> con 5 niveles: muy triste, triste, normal, feliz, muy feliz.</p>
       <p>A veces conviene reducirlos a 3 (triste, normal, feliz). ¿Por qué?</p>
       <ul>
         <li>Porque los extremos tienen <strong>muy pocos casos</strong> y los resultados salen inestables.</li>
         <li>Porque la diferencia entre "triste" y "muy triste" no le importa a tu pregunta.</li>
         <li>Porque un modelo con 3 categorías es <strong>mucho más fácil de explicar</strong>.</li>
       </ul>
       <p>Lo que <strong>no</strong> es buena razón: juntar categorías hasta que salga significativo. Eso se llama forzar los datos y se nota.</p>`,
      'Mira cómo está repartida <code>satisf</code> ahora.',
      'tab satisf',
      { comandos: ['tabulate'], variables: ['satisf'] },
      ['Usa <code>tab</code> con la variable.',
       'La variable se llama <code>satisf</code>.',
       'Escribe: <code>tab satisf</code>'],
      10, 'Ahí ves los 5 niveles y cuánta gente hay en cada uno. Ahora vamos a juntarlos.'),

    L('m5l2', 'Recodificar con <code>recode</code>',
      'La forma directa de juntar categorías.',
      `<p><code>recode</code> agrupa valores viejos en valores nuevos. Cada regla va entre paréntesis:</p>
       <p><code>recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)</code></p>
       <p>Se lee: "los que eran 1 o 2 pasan a ser 1; el 3 pasa a ser 2; los 4 y 5 pasan a ser 3, y todo eso guárdalo en una variable nueva llamada satisf3".</p>
       <p><strong>Siempre usa <code>gen()</code></strong>, nunca pises la variable original: si te equivocas, no hay vuelta atrás.</p>`,
      'Convierte <code>satisf</code> (5 niveles) en <code>satisf3</code> (3 niveles): 1 y 2 → 1, el 3 → 2, y 4 y 5 → 3.',
      'recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)',
      { comandos: ['recode'], creaVariable: 'satisf3' },
      ['El comando es <code>recode</code> seguido de la variable.',
       'Cada regla va entre paréntesis: <code>(1 2 = 1)</code>.',
       'Escribe: <code>recode satisf (1 2 = 1) (3 = 2) (4 5 = 3), gen(satisf3)</code>'],
      30, '¡Muy bien! Esa es exactamente la operación que pediste aprender. Ahora hay que comprobarla y etiquetarla.'),

    L('m5l3', 'Comprobar la recodificación',
      'El paso que no se puede saltar.',
      `<p>Después de recodificar, <strong>siempre</strong> cruza la vieja contra la nueva:</p>
       <p><code>tab satisf satisf3</code></p>
       <p>Deberías ver una tabla donde cada valor viejo cae en un solo valor nuevo, sin mezclas raras. Si ves un caso donde "muy feliz" terminó en "triste", ahí está tu error.</p>
       <p>Este chequeo toma diez segundos y evita que entregues un trabajo con la variable al revés.</p>`,
      'Cruza la variable vieja contra la nueva para comprobar.',
      'tab satisf satisf3',
      { comandos: ['tabulate'], variables: ['satisf', 'satisf3'] },
      ['Usa <code>tab</code> con las <strong>dos</strong> variables.',
       'Primero la vieja, después la nueva.',
       'Escribe: <code>tab satisf satisf3</code>'],
      20, 'Comprobado. Cada categoría cayó donde debía. Ese hábito te va a salvar más de una vez.'),

    L('m5l4', 'Etiquetar la variable nueva',
      'Que la nueva variable también se lea en palabras.',
      `<p>La variable recodificada nace <strong>sin etiquetas</strong>: sale como 1, 2, 3 pelados. Hay que ponérselas con los dos pasos que ya conoces.</p>
       <p>Primero el diccionario, después pegarlo.</p>`,
      'Crea el diccionario <code>lbl_s3</code> con 1 = "Triste", 2 = "Normal", 3 = "Feliz".',
      'label define lbl_s3 1 "Triste" 2 "Normal" 3 "Feliz"',
      { comandos: ['label'], contiene: ['define'] },
      ['Es <code>label define</code> con el nombre del diccionario.',
       'Después los tres pares número-texto.',
       'Escribe: <code>label define lbl_s3 1 "Triste" 2 "Normal" 3 "Feliz"</code>'],
      15, 'Diccionario listo. Falta pegarlo, que es el paso que se olvida.'),

    L('m5l5', 'Pegar y verificar',
      'Cerrar el ciclo completo de una recodificación.',
      `<p>Último paso: pegar el diccionario a <code>satisf3</code> con <code>label values</code>, y comprobar con <code>tab</code>.</p>
       <p>Una recodificación bien hecha son <strong>cuatro pasos</strong>: recodificar, comprobar el cruce, etiquetar y verificar. Saltarse alguno es donde aparecen los errores.</p>`,
      'Pega el diccionario <code>lbl_s3</code> a <code>satisf3</code>.',
      'label values satisf3 lbl_s3',
      { comandos: ['label'], contiene: ['values'] },
      ['Es <code>label values</code>.',
       'Primero la variable <code>satisf3</code>, después el diccionario.',
       'Escribe: <code>label values satisf3 lbl_s3</code>'],
      20, '¡Ciclo completo! Recodificaste, comprobaste, etiquetaste y verificaste. Así se entrega.'),

    L('m5l6', 'La otra forma: <code>gen</code> con <code>cond()</code>',
      'Recodificar con condiciones, útil cuando las reglas son complejas.',
      `<p><code>recode</code> es cómodo para agrupar códigos, pero cuando la regla depende de <strong>otra variable</strong> o de rangos raros, se usa <code>gen</code> con <code>cond()</code>.</p>
       <p><code>cond(condición, valor si sí, valor si no)</code>. Se pueden anidar:</p>
       <p><code>gen tramo = cond(ingreso < 400, 1, cond(ingreso < 800, 2, 3))</code></p>
       <p>Se lee: "si gana menos de 400, tramo 1; si no, mira si gana menos de 800: entonces tramo 2; si no, tramo 3".</p>`,
      'Crea <code>tramo</code> con 3 niveles de ingreso: menos de 400, de 400 a 800, y más de 800.',
      'gen tramo = cond(ingreso < 400, 1, cond(ingreso < 800, 2, 3))',
      { comandos: ['generate'], contiene: ['cond'] },
      ['Usa <code>gen</code> con la función <code>cond()</code>.',
       'Hay que anidar dos <code>cond()</code>, uno dentro del otro.',
       'Escribe: <code>gen tramo = cond(ingreso < 400, 1, cond(ingreso < 800, 2, 3))</code>'],
      25, 'Excelente. Ahora tienes las dos herramientas: <code>recode</code> para códigos y <code>cond()</code> para reglas.'),
  ],
},
// ────────────────────────────────────────────────────────────── 6
{
  id: 'm6', titulo: 'Descriptivas', subtitulo: 'Conocer los datos antes de modelar', icono: '📊',
  requiere: ['m5'], color: 'blue',
  lecciones: [
    L('m6l1', 'Promedios y dispersión',
      'La primera mirada seria a los datos.',
      `<p><code>summarize</code> te da, para cada variable: cuántas observaciones tienen dato, el promedio, la desviación estándar, el mínimo y el máximo.</p>
       <p>Se mira siempre <strong>antes</strong> de correr cualquier modelo. Aquí es donde aparecen los errores que no viste en la depuración.</p>
       <p>La <strong>desviación estándar</strong> mide qué tan repartidos están los datos alrededor del promedio: si es chica, todos se parecen; si es grande, hay mucha diferencia entre unos y otros.</p>`,
      'Saca las descriptivas de <code>ingreso</code>, <code>educ</code> y <code>exper</code>.',
      'summarize ingreso educ exper',
      { comandos: ['summarize'], minVariables: 2 },
      ['El comando es <code>summarize</code> (o <code>sum</code>).',
       'Van las tres variables separadas por espacios.',
       'Escribe: <code>summarize ingreso educ exper</code>'],
      15, 'Bien. Compara siempre la media con el máximo: si están muy lejos, hay cola larga o atípicos.'),

    L('m6l2', 'La versión detallada',
      'Percentiles, asimetría y curtosis.',
      `<p><code>summarize variable, detail</code> agrega los percentiles y dos medidas de forma.</p>
       <p>Lo más útil de aquí es comparar la <strong>media</strong> con la <strong>mediana</strong> (el percentil 50):</p>
       <ul>
         <li>Si son parecidas, la distribución es simétrica.</li>
         <li>Si la media es <strong>mucho mayor</strong> que la mediana, hay cola larga a la derecha: unos pocos valores muy altos jalan el promedio. Es lo típico del ingreso.</li>
       </ul>
       <p>Cuando pasa eso, casi siempre conviene trabajar con el logaritmo.</p>`,
      'Saca las descriptivas detalladas del ingreso.',
      'summarize ingreso, detail',
      { comandos: ['summarize'], contiene: ['detail'] },
      ['Es <code>summarize</code> con una opción después de la coma.',
       'La opción se llama <code>detail</code>.',
       'Escribe: <code>summarize ingreso, detail</code>'],
      15, 'Mira la diferencia entre la media y el percentil 50. Esa brecha es la razón por la que el ingreso se estudia en logaritmos.'),

    L('m6l3', 'Tablas de frecuencia',
      'Para variables de categorías, no de cantidades.',
      `<p><code>tabulate</code> (o <code>tab</code>) cuenta cuántos casos hay en cada categoría.</p>
       <p>Regla simple: <strong>cantidades → <code>summarize</code>; categorías → <code>tabulate</code></strong>. El promedio de "tamaño de empresa" no significa nada.</p>`,
      'Muestra cómo se reparte la gente por tamaño de empresa.',
      'tab tamano',
      { comandos: ['tabulate'], variables: ['tamano'] },
      ['El comando es <code>tab</code>.',
       'La variable es <code>tamano</code>.',
       'Escribe: <code>tab tamano</code>'],
      10, 'Eso es. Las etiquetas hacen que se lea solo, sin tener que acordarte de qué era el 3.'),

    L('m6l4', 'Cruzar dos variables',
      'Ver si dos categorías están relacionadas.',
      `<p>Con dos variables, <code>tab</code> hace una tabla cruzada. Dos opciones que cambian todo:</p>
       <ul>
         <li><code>row</code> — muestra porcentajes por fila, que es como realmente se compara.</li>
         <li><code>chi2</code> — hace la prueba de si las dos variables están relacionadas.</li>
       </ul>
       <p>Sin <code>row</code>, comparar grupos de distinto tamaño es engañoso: 100 de 1000 no es lo mismo que 100 de 150.</p>`,
      'Cruza <code>tamano</code> con <code>formal</code>, con porcentajes de fila y prueba chi-cuadrado.',
      'tab tamano formal, row chi2',
      { comandos: ['tabulate'], minVariables: 2, contiene: ['chi2'] },
      ['Van las dos variables seguidas, y después la coma con las opciones.',
       'Las opciones son <code>row</code> y <code>chi2</code>.',
       'Escribe: <code>tab tamano formal, row chi2</code>'],
      20, 'Muy bien. Fíjate cómo sube el porcentaje de formales mientras más grande es la empresa.'),

    L('m6l5', 'Descriptivas por grupo',
      'Comparar promedios entre categorías.',
      `<p><code>tabstat</code> te da los estadísticos que pidas, partidos por grupo.</p>
       <p><code>tabstat ingreso, by(tamano) stats(mean sd n)</code></p>
       <p>Esta es de las tablas que más se usan en un trabajo: muestra de un vistazo si los grupos son distintos, antes de que ningún modelo lo confirme.</p>`,
      'Saca la media, desviación y número de casos del ingreso por tamaño de empresa.',
      'tabstat ingreso, by(tamano) stats(mean sd n)',
      { comandos: ['tabstat'], contiene: ['by'] },
      ['El comando es <code>tabstat</code> con la variable.',
       'Después van las opciones <code>by()</code> y <code>stats()</code>.',
       'Escribe: <code>tabstat ingreso, by(tamano) stats(mean sd n)</code>'],
      20, 'Esa tabla va directo a tu trabajo. Ya se ve la diferencia entre micro y grande.'),

    L('m6l6', 'Correlaciones',
      'Ver qué variables se mueven juntas.',
      `<p><code>correlate</code> mide, entre −1 y 1, qué tanto se mueven juntas dos variables.</p>
       <p>Tres advertencias que hay que tener siempre presentes:</p>
       <ul>
         <li>Solo detecta relaciones <strong>en línea recta</strong>. Una relación en forma de U puede dar correlación cero.</li>
         <li>Es entre <strong>dos</strong> variables a la vez, sin controlar por nada.</li>
         <li><strong>Correlación no es causalidad.</strong> Y una correlación alta puede desaparecer al meter una tercera variable.</li>
       </ul>
       <p>Sirve para explorar y para detectar variables repetidas, no para concluir.</p>`,
      'Calcula las correlaciones entre <code>ingreso</code>, <code>educ</code>, <code>exper</code> y <code>horas</code>.',
      'correlate ingreso educ exper horas',
      { comandos: ['correlate'], minVariables: 3 },
      ['El comando es <code>correlate</code> (se abrevia <code>corr</code>).',
       'Van todas las variables separadas por espacios.',
       'Escribe: <code>correlate ingreso educ exper horas</code>'],
      20, 'Bien. Si alguna pareja pasa de 0,8 hay que tener cuidado de no meterlas juntas en un modelo.'),

    L('m6l7', 'Un histograma',
      'Ver la forma de la distribución.',
      `<p>Los números están bien, pero un gráfico te muestra en un segundo lo que una tabla esconde.</p>
       <p><code>histogram ingreso, normal</code> dibuja la distribución y le superpone la campana normal para comparar.</p>
       <p>Si tu variable se ve muy pegada a la izquierda con una cola larga a la derecha, esa es la señal clásica de que hay que usar logaritmos.</p>`,
      'Dibuja el histograma del ingreso con la curva normal encima.',
      'histogram ingreso, normal',
      { comandos: ['histogram'], contiene: ['normal'] },
      ['El comando es <code>histogram</code> con la variable.',
       'La opción <code>normal</code> va después de la coma.',
       'Escribe: <code>histogram ingreso, normal</code>'],
      15, '¡Ahí está! Se ve clarísima la cola a la derecha. Eso es lo que arregla el logaritmo.'),

    L('m6l8', 'Comparar grupos con cajas',
      'El gráfico que mejor compara distribuciones.',
      `<p>Un diagrama de cajas muestra, para cada grupo: la mediana (línea del medio), la mitad central de los datos (la caja) y los atípicos (puntos sueltos).</p>
       <p>Es mucho más informativo que comparar promedios, porque muestra también la <strong>dispersión</strong>.</p>`,
      'Compara la distribución del ingreso entre tamaños de empresa.',
      'graph box ingreso, over(tamano)',
      { comandos: ['graph'], contiene: ['box'] },
      ['El comando es <code>graph box</code> con la variable.',
       'Para partir por grupos se usa <code>over()</code>.',
       'Escribe: <code>graph box ingreso, over(tamano)</code>'],
      15, 'Excelente cierre de módulo. Ya sabes mirar los datos antes de modelarlos.'),
  ],
},
// ────────────────────────────────────────────────────────────── 7
{
  id: 'm7', titulo: 'Regresión', subtitulo: 'El modelo central', icono: '📈',
  requiere: ['m6'], color: 'sig',
  lecciones: [
    L('m7l1', 'Tu primera regresión',
      'Explicar una variable con otra.',
      `<p><code>regress</code> (o <code>reg</code>) estima la recta que mejor pasa entre los puntos.</p>
       <p>Se escribe: primero la variable que quieres <strong>explicar</strong>, después las que <strong>explican</strong>. Sin signos igual, sin comas entre variables.</p>
       <p><code>reg ingreso educ</code> = "explícame el ingreso con los años de estudio".</p>`,
      'Explica el ingreso con los años de estudio.',
      'reg ingreso educ',
      { comandos: ['regress'], minVariables: 2 },
      ['El comando es <code>reg</code> o <code>regress</code>.',
       'Primero la dependiente (<code>ingreso</code>), después la explicativa (<code>educ</code>).',
       'Escribe: <code>reg ingreso educ</code>'],
      20, '¡Tu primera regresión! El coeficiente de educ te dice cuántos dólares más por cada año de estudio.'),

    L('m7l2', 'Varias variables a la vez',
      'Lo que hace útil a la regresión múltiple.',
      `<p>Al meter varias variables, cada coeficiente queda <strong>"limpio" de las demás</strong>.</p>
       <p>El coeficiente de educación ya no mezcla el efecto de la experiencia ni del sexo: es como comparar dos personas <strong>idénticas en todo lo demás</strong>, que solo se diferencian en años de estudio.</p>
       <p>Esa frase — "manteniendo todo lo demás constante" — tiene que aparecer en tu interpretación. Es lo que distingue una regresión de una simple correlación.</p>`,
      'Explica el ingreso con educación, experiencia, experiencia al cuadrado, sexo y horas.',
      'reg ingreso educ exper exper2 mujer horas',
      { comandos: ['regress'], minVariables: 5 },
      ['Mismo comando, más variables.',
       'El orden es: dependiente primero, después todas las explicativas.',
       'Escribe: <code>reg ingreso educ exper exper2 mujer horas</code>'],
      25, 'Ahí tienes el modelo del documento. Fíjate cómo cambió el coeficiente de educ al controlar por lo demás.'),

    L('m7l3', 'Leer la tabla completa',
      'Coeficiente, error estándar, t, valor p e intervalo.',
      `<p>Cada fila de la tabla tiene cinco números, y todos dicen lo mismo desde ángulos distintos:</p>
       <ul>
         <li><strong>Coeficiente</strong>: cuánto cambia Y por una unidad más de X.</li>
         <li><strong>Error estándar</strong>: qué tan inestable es ese número. Si repitieras el estudio con otra muestra, cambiaría más o menos eso.</li>
         <li><strong>t</strong>: es simplemente <strong>coeficiente ÷ error estándar</strong>. Si pasa de 2 en valor absoluto, casi siempre es significativo.</li>
         <li><strong>P&gt;|t|</strong>: el valor p. Menor a 0,05 → significativo.</li>
         <li><strong>Intervalo de confianza</strong>: el rango donde probablemente está el efecto real. <strong>Si incluye el cero, no es significativo.</strong></li>
       </ul>
       <p>Las tres formas de decidir (p &lt; 0,05, |t| &gt; 2, el intervalo no toca el cero) dan siempre la misma respuesta.</p>`,
      'Corre el modelo y toca una fila de la tabla para que te la explique.',
      'reg ingreso educ exper mujer, robust',
      { comandos: ['regress'], contiene: ['robust'] },
      ['Corre la regresión con <code>robust</code>.',
       'Después haz clic en cualquier fila de la tabla de resultados.',
       'Escribe: <code>reg ingreso educ exper mujer, robust</code>'],
      20, 'Muy bien. Cada fila de esa tabla ahora se explica sola al tocarla.'),

    L('m7l4', 'Qué hace <code>robust</code>',
      'La opción que casi siempre va.',
      `<p><code>robust</code> corrige los errores estándar cuando la variación no es pareja entre unos y otros (por ejemplo, los ingresos altos varían mucho más que los bajos).</p>
       <p>Lo importante de entender:</p>
       <ul>
         <li><strong>NO cambia</strong> los coeficientes. Ni un decimal.</li>
         <li><strong>SÍ cambia</strong> los errores estándar, y con ellos los t y los valores p.</li>
       </ul>
       <p>Con datos de encuesta se pone casi siempre. No cuesta nada y evita reportar significancias falsas.</p>`,
      'Corre el mismo modelo de antes, ahora con <code>robust</code>, y compara.',
      'reg ingreso educ exper exper2 mujer horas, robust',
      { comandos: ['regress'], contiene: ['robust'], minVariables: 5 },
      ['Es el modelo de la lección 2 más una opción.',
       'La opción va después de una coma: <code>, robust</code>.',
       'Escribe: <code>reg ingreso educ exper exper2 mujer horas, robust</code>'],
      20, 'Compara con el resultado anterior: los coeficientes son idénticos, solo cambiaron los errores estándar.'),

    L('m7l5', 'Guardar predicciones y residuos',
      'Sacar del modelo lo que hace falta para revisarlo.',
      `<p><code>predict</code> crea variables nuevas a partir del último modelo:</p>
       <ul>
         <li><code>predict yhat</code> — el valor que el modelo predice para cada persona.</li>
         <li><code>predict e, resid</code> — el residuo: lo que el modelo <strong>no</strong> logró explicar.</li>
       </ul>
       <p>Los residuos son la materia prima de todas las pruebas de supuestos del siguiente módulo.</p>`,
      'Guarda los residuos del modelo en una variable llamada <code>e</code>.',
      'predict e, resid',
      { comandos: ['predict'], contiene: ['resid'] },
      ['El comando es <code>predict</code> con el nombre de la variable nueva.',
       'Para residuos se agrega la opción <code>resid</code>.',
       'Escribe: <code>predict e, resid</code>'],
      20, 'Listo. Con esos residuos vas a revisar si el modelo es confiable.'),

    L('m7l6', 'Probar una hipótesis',
      'Preguntarle algo concreto al modelo.',
      `<p><code>test</code> prueba afirmaciones sobre los coeficientes.</p>
       <ul>
         <li><code>test educ exper</code> — "¿las dos juntas aportan algo?"</li>
         <li><code>test educ = 50</code> — "¿el efecto de educación es 50 dólares?"</li>
       </ul>
       <p>Un valor p menor a 0,05 significa que los datos <strong>contradicen</strong> lo que afirmaste.</p>`,
      'Prueba si <code>educ</code> y <code>exper</code> juntas aportan al modelo.',
      'test educ exper',
      { comandos: ['test'] },
      ['El comando es <code>test</code> seguido de las variables.',
       'No lleva comas ni signos igual si solo quieres probarlas juntas.',
       'Escribe: <code>test educ exper</code>'],
      20, 'Bien. Esa prueba conjunta es la que se usa cuando quieres saber si un bloque de variables vale la pena.'),
  ],
},
// ────────────────────────────────────────────────────────────── 8
{
  id: 'm8', titulo: 'Supuestos', subtitulo: 'Revisar antes de confiar', icono: '🔍',
  requiere: ['m7'], color: 'nosig',
  lecciones: [
    L('m8l1', 'Por qué hay que revisar',
      'Stata siempre da un número, esté bien o mal.',
      `<p>Esto es lo más importante de todo el curso: <strong>Stata nunca te dice "este modelo está mal"</strong>. Siempre te devuelve una tabla bonita con coeficientes y valores p, aunque los datos estén mal usados.</p>
       <p>Por eso existen las pruebas de supuestos. Son cuatro revisiones, cada una con su comando y su solución:</p>
       <ol>
         <li><strong>Multicolinealidad</strong> — <code>estat vif</code></li>
         <li><strong>Heterocedasticidad</strong> — <code>estat hettest</code></li>
         <li><strong>Forma funcional</strong> — <code>estat ovtest</code></li>
         <li><strong>Normalidad de los residuos</strong> — <code>sktest</code> y <code>qnorm</code></li>
       </ol>
       <p>Vamos una por una.</p>`,
      'Corre el modelo base sobre el que vas a hacer todas las pruebas.',
      'reg ingreso educ exper exper2 mujer horas, robust',
      { comandos: ['regress'], minVariables: 5 },
      ['Es el modelo completo del módulo anterior.',
       'Con <code>robust</code> al final.',
       'Escribe: <code>reg ingreso educ exper exper2 mujer horas, robust</code>'],
      15, 'Modelo listo. Ahora las cuatro pruebas, en orden.'),

    L('m8l2', 'Multicolinealidad',
      '¿Hay variables que son casi la misma cosa?',
      `<p>Si dos variables son casi idénticas (por ejemplo edad y año de nacimiento), el programa <strong>no puede separar</strong> el efecto de cada una. Los coeficientes salen inestables y con errores estándar enormes.</p>
       <p><code>estat vif</code> lo mide. La regla:</p>
       <ul>
         <li>VIF menor a 5 → bien.</li>
         <li>Entre 5 y 10 → mirarlo con cuidado.</li>
         <li>Mayor a 10 → problema, hay que quitar una variable.</li>
       </ul>
       <p><strong>Excepción importante:</strong> <code>exper</code> y <code>exper2</code> siempre dan VIF alto, y eso <u>no se arregla ni es un error</u>. Están relacionadas por construcción y deben ir juntas.</p>`,
      'Revisa la multicolinealidad del modelo.',
      'estat vif',
      { comandos: ['estat'], contiene: ['vif'] },
      ['El comando es <code>estat</code> seguido de <code>vif</code>.',
       'No hay que repetir las variables.',
       'Escribe: <code>estat vif</code>'],
      20, 'Bien. Y ya sabes que el VIF alto de exper/exper2 es normal y se ignora a propósito.'),

    L('m8l3', 'Heterocedasticidad',
      '¿El error es igual de grande para todos?',
      `<p>La regresión supone que el "temblor" del error es parejo. Pero en datos de ingresos <strong>nunca</strong> lo es: los que ganan mucho varían mucho más que los que ganan poco.</p>
       <p><code>estat hettest</code> lo prueba. Si el valor p es menor a 0,05, hay heterocedasticidad.</p>
       <p>Y la solución es sorprendentemente simple: <strong>agregar <code>robust</code></strong>. Eso es todo. No sesga tus coeficientes, solo corrige los valores p.</p>`,
      'Prueba si hay heterocedasticidad.',
      'estat hettest',
      { comandos: ['estat'], contiene: ['hettest'] },
      ['Mismo <code>estat</code>, otro subcomando.',
       'Se llama <code>hettest</code> (de "heteroskedasticity test").',
       'Escribe: <code>estat hettest</code>'],
      20, 'Salió significativo, como se esperaba con datos de ingreso. Por eso siempre va <code>robust</code>.'),

    L('m8l4', 'Verlo con un gráfico',
      'El embudo que delata la heterocedasticidad.',
      `<p><code>rvfplot</code> dibuja los residuos contra los valores predichos.</p>
       <p>Lo que quieres ver: una <strong>nube pareja</strong>, del mismo grosor de izquierda a derecha.</p>
       <p>Lo que delata problemas:</p>
       <ul>
         <li><strong>Forma de embudo</strong> (se abre hacia un lado) → heterocedasticidad.</li>
         <li><strong>Forma de U</strong> → falta forma funcional, no heterocedasticidad.</li>
       </ul>`,
      'Dibuja los residuos contra los valores ajustados.',
      'rvfplot',
      { comandos: ['rvfplot'] },
      ['Es una sola palabra.',
       'Viene de "residual versus fitted plot".',
       'Escribe: <code>rvfplot</code>'],
      15, 'Se ve el embudo clarísimo. Un gráfico dice en un segundo lo que una prueba dice en un número.'),

    L('m8l5', 'Forma funcional',
      '¿Le falta algo al modelo?',
      `<p><code>estat ovtest</code> (prueba RESET de Ramsey) revisa si al modelo le falta una variable importante o si la relación es <strong>curva</strong> y la estás forzando a ser recta.</p>
       <p>Si sale significativo, tres cosas para probar en orden:</p>
       <ol>
         <li>Meter un término al cuadrado.</li>
         <li><strong>Pasar la dependiente a logaritmo</strong> — casi siempre arregla los modelos de ingreso.</li>
         <li>Pensar qué variable importante falta.</li>
       </ol>`,
      'Prueba si al modelo le falta forma funcional.',
      'estat ovtest',
      { comandos: ['estat'], contiene: ['ovtest'] },
      ['Mismo <code>estat</code>.',
       'El subcomando es <code>ovtest</code> (omitted variables test).',
       'Escribe: <code>estat ovtest</code>'],
      20, 'Anotado. En el siguiente módulo vas a ver cómo el logaritmo arregla justamente esto.'),

    L('m8l6', 'Normalidad de los residuos',
      'La prueba menos grave de todas.',
      `<p>Se revisa que los residuos se parezcan a una campana normal, con <code>sktest e</code> o con el gráfico <code>qnorm</code>.</p>
       <p><strong>Pero calma:</strong> con muestras grandes esta prueba rechaza casi siempre, y <u>no importa mucho</u>. Lo que hace confiables a los valores p en muestras grandes es tener muchas observaciones, no que los residuos sean perfectamente normales.</p>
       <p>Se reporta, se menciona, y se sigue adelante. Es la que menos debe preocuparte.</p>`,
      'Dibuja el gráfico de normalidad de los residuos.',
      'qnorm',
      { comandos: ['qnorm'] },
      ['Es una sola palabra: <code>qnorm</code>.',
       'Usa los residuos del último modelo automáticamente.',
       'Escribe: <code>qnorm</code>'],
      15, 'Cierre de módulo. Ya sabes revisar los cuatro supuestos y qué hacer con cada uno.'),
  ],
},
// ────────────────────────────────────────────────────────────── 9
{
  id: 'm9', titulo: 'Logaritmos', subtitulo: 'Leer resultados en porcentajes', icono: '📐',
  requiere: ['m8'], color: 'ochre',
  lecciones: [
    L('m9l1', 'Crear la variable en logaritmo',
      'El primer paso de todo modelo en porcentajes.',
      `<p>El logaritmo convierte cambios en dólares en cambios en <strong>porcentaje</strong>. Eso tiene dos ventajas grandes: los coeficientes ya no dependen de si la persona ganaba mucho o poco, y de paso se arregla buena parte de la asimetría y la heterocedasticidad.</p>
       <p>Se crea con <code>ln()</code>. Ojo: solo funciona con números <strong>mayores que cero</strong>. Si hay ceros, esas filas quedan vacías.</p>`,
      'Crea el logaritmo del ingreso.',
      'gen lningreso = ln(ingreso)',
      { comandos: ['generate'], contiene: ['ln('], creaVariable: 'lningreso' },
      ['Usa <code>gen</code> con la función <code>ln()</code>.',
       'La variable nueva se suele llamar <code>lningreso</code>.',
       'Escribe: <code>gen lningreso = ln(ingreso)</code>'],
      15, 'Listo. Ahora los coeficientes se van a leer en porcentaje.'),

    L('m9l2', 'Las cuatro combinaciones',
      'Elasticidad no es lo mismo que "estar en logaritmo".',
      `<p>Hay cuatro combinaciones, según a quién le pones logaritmo. <strong>Solo una es elasticidad de verdad:</strong></p>
       <ul>
         <li><strong>Nivel-nivel</strong> (a ninguna) → dólares por unidad. No es elasticidad.</li>
         <li><strong>Log-nivel</strong> (solo a Y) → <strong>porcentaje por unidad</strong>. Se llama semielasticidad. Es la más usada en salarios.</li>
         <li><strong>Nivel-log</strong> (solo a X) → dólares por cada 1%. También semielasticidad.</li>
         <li><strong>Log-log</strong> (a las dos) → <strong>porcentaje por porcentaje. Esta sí es elasticidad.</strong></li>
       </ul>`,
      'Corre el modelo log-nivel: el logaritmo del ingreso explicado por educación, experiencia y sexo.',
      'reg lningreso educ exper mujer, robust',
      { comandos: ['regress'], contiene: ['lningreso'] },
      ['La dependiente ahora es <code>lningreso</code>.',
       'Las explicativas van normales, sin logaritmo.',
       'Escribe: <code>reg lningreso educ exper mujer, robust</code>'],
      25, 'Ese es un modelo log-nivel. El coeficiente de educ ahora se lee en porcentaje, no en dólares.'),

    L('m9l3', 'La cuenta exacta',
      'Cuándo multiplicar por 100 no alcanza.',
      `<p>Para pasar un coeficiente log a porcentaje, la cuenta rápida es <strong>multiplicar por 100</strong>.</p>
       <p>Pero eso solo vale si el número es chico (menor a 0,10). Para números más grandes hay que usar la cuenta exacta:</p>
       <p><strong>(e^b − 1) × 100</strong></p>
       <p>Ejemplo: con b = −0,147, la cuenta rápida da −14,7% pero la exacta da <strong>−13,7%</strong>. La diferencia es chica, pero un profesor exigente te la marca.</p>
       <p>El profesor de este simulador te avisa solo cuando hace falta usar la exacta.</p>`,
      'Corre el modelo y toca la fila de <code>mujer</code> para ver la conversión exacta.',
      'reg lningreso educ exper mujer, robust',
      { comandos: ['regress'], contiene: ['lningreso'] },
      ['Es el mismo modelo de la lección anterior.',
       'Después haz clic en la fila de <code>mujer</code> en la tabla.',
       'Escribe: <code>reg lningreso educ exper mujer, robust</code>'],
      20, 'Ahí lo tienes. El profesor te da la conversión exacta y te avisa si la rápida no sirve.'),

    L('m9l4', 'La Cobb-Douglas',
      'El modelo log-log clásico.',
      `<p>La función Cobb-Douglas suena complicada pero es exactamente el mismo truco: logaritmo a <strong>todas</strong> las variables.</p>
       <p>Como las dos partes quedan en porcentaje, los coeficientes son <strong>elasticidades de verdad</strong>: se pueden comparar entre sí sin que estorben las unidades (dólares de capital contra horas de trabajo).</p>`,
      'Crea los logaritmos de <code>horas</code> y <code>k</code>, y corre la Cobb-Douglas.',
      'gen lnhoras = ln(horas)\ngen lnk = ln(k)\nreg lningreso lnhoras lnk, robust',
      { esDoFile: true, contiene: ['lnhoras', 'lnk'] },
      ['Necesitas tres líneas: dos <code>gen</code> y una <code>reg</code>.',
       'Hazlo en la pestaña Do-file para correr las tres de una vez.',
       'Escribe:<br><code>gen lnhoras = ln(horas)</code><br><code>gen lnk = ln(k)</code><br><code>reg lningreso lnhoras lnk, robust</code>'],
      30, '¡Esa es la Cobb-Douglas! Los dos coeficientes son elasticidades: "si las horas suben 1%, el ingreso sube 0,6%".'),

    L('m9l5', 'Rendimientos a escala',
      'Preguntarle al modelo si duplicar todo duplica el resultado.',
      `<p>Si sumas las dos elasticidades y da:</p>
       <ul>
         <li><strong>Igual a 1</strong> → rendimientos constantes: duplicar todo duplica la producción.</li>
         <li><strong>Menor a 1</strong> → rendimientos <strong>decrecientes</strong>: duplicar todo da menos del doble.</li>
         <li><strong>Mayor a 1</strong> → rendimientos crecientes.</li>
       </ul>
       <p>Pero no basta con mirar la suma: hay que <strong>probarlo formalmente</strong> con <code>test</code>, porque la suma podría estar cerca de 1 por casualidad.</p>`,
      'Prueba si los rendimientos son constantes a escala.',
      'test lnhoras + lnk = 1',
      { comandos: ['test'], contiene: ['+'] },
      ['El comando es <code>test</code> con una ecuación.',
       'La hipótesis es que las dos elasticidades suman 1.',
       'Escribe: <code>test lnhoras + lnk = 1</code>'],
      25, '¡Muy bien! Esa es la prueba que separa un trabajo bueno de uno excelente.'),
  ],
},
// ────────────────────────────────────────────────────────────── 10
{
  id: 'm10', titulo: 'Grupos y dummies', subtitulo: 'ANOVA y variables categóricas', icono: '👥',
  requiere: ['m9'], color: 'blue',
  lecciones: [
    L('m10l1', 'Comparar promedios entre grupos',
      'La pregunta que responde ANOVA.',
      `<p>ANOVA contesta: <strong>"¿todos los grupos tienen el mismo promedio, o hay diferencias?"</strong></p>
       <p>Un dato que sorprende: <strong>ANOVA no es un modelo aparte</strong>. Es exactamente la misma regresión de siempre, pero con todas las variables convertidas en grupos. Da el mismo resultado, solo presentado distinto.</p>`,
      'Compara el ingreso promedio entre tamaños de empresa.',
      'anova ingreso tamano',
      { comandos: ['anova'] },
      ['El comando es <code>anova</code>.',
       'Primero la variable numérica, después la de grupos.',
       'Escribe: <code>anova ingreso tamano</code>'],
      20, 'Bien. El valor p te dice que sí hay diferencias, pero no cuál grupo se separa. Para eso, la siguiente lección.'),

    L('m10l2', 'La <code>i.</code> que lo cambia todo',
      'El error más caro de este módulo.',
      `<p>Cuando metes una variable de grupos en una regresión, <strong>tienes que escribir <code>i.</code> delante</strong>.</p>
       <p>¿Por qué? Si escribes <code>reg ingreso tamano</code>, Stata cree que 1, 2, 3, 4 son <strong>cantidades</strong> y calcula una sola pendiente: supone que pasar de micro a pequeña vale exactamente lo mismo que pasar de mediana a grande. Casi nunca es cierto.</p>
       <p>Con <code>i.tamano</code>, Stata crea una variable indicadora por cada grupo y calcula la diferencia de cada uno contra un <strong>grupo base</strong>.</p>`,
      'Corre la regresión tratando <code>tamano</code> como grupos.',
      'reg ingreso i.tamano, robust',
      { comandos: ['regress'], contiene: ['i.tamano'] },
      ['Hay que poner <code>i.</code> pegado al nombre de la variable.',
       'Queda <code>i.tamano</code>, sin espacio.',
       'Escribe: <code>reg ingreso i.tamano, robust</code>'],
      25, '¡Eso! Ahora cada coeficiente es la diferencia contra la microempresa, que quedó de base.'),

    L('m10l3', 'El grupo base',
      'Contra qué se comparan todos los demás.',
      `<p>Uno de los grupos siempre se queda fuera: es el <strong>grupo base</strong>, el punto de comparación. Por omisión Stata usa el de código más bajo.</p>
       <p>Por eso los coeficientes <strong>no son valores absolutos</strong>: son diferencias. "+83,6" significa "gana 83,6 dólares más <u>que una microempresa</u>", no "gana 83,6 dólares".</p>
       <p>Para cambiar la base se usa <code>ib3.tamano</code> (base = grupo 3). Cambiar la base cambia todos los números, aunque el modelo sea el mismo.</p>`,
      'Corre el mismo modelo pero usando la empresa mediana (grupo 3) como base.',
      'reg ingreso ib3.tamano, robust',
      { comandos: ['regress'], contiene: ['ib3'] },
      ['Se usa <code>ib</code> seguido del número del grupo base.',
       'Para el grupo 3 queda <code>ib3.tamano</code>.',
       'Escribe: <code>reg ingreso ib3.tamano, robust</code>'],
      25, 'Fíjate cómo cambiaron todos los signos. Es el mismo modelo, otra referencia.'),

    L('m10l4', 'Probar el grupo completo',
      '¿El grupo importa, sí o no?',
      `<p>Con varias categorías te quedas con varios coeficientes, y puede pasar que algunos sean significativos y otros no. ¿Entonces el grupo importa o no?</p>
       <p><code>testparm i.tamano</code> lo prueba <strong>todo junto</strong> y da una sola respuesta.</p>
       <p>Es lo que se reporta cuando alguien pregunta "¿el tamaño de la empresa influye en el ingreso?".</p>`,
      'Prueba si el tamaño de empresa aporta al modelo en conjunto.',
      'testparm i.tamano',
      { comandos: ['testparm'] },
      ['El comando es <code>testparm</code>.',
       'Va seguido de <code>i.tamano</code>, igual que en la regresión.',
       'Escribe: <code>testparm i.tamano</code>'],
      20, 'Perfecto. Una sola respuesta para todo el grupo: eso es lo que va en el informe.'),

    L('m10l5', 'Grupos y cantidades juntos',
      'Mezclar dummies con variables continuas.',
      `<p>Nada impide mezclar: <code>reg ingreso educ exper i.tamano, robust</code>.</p>
       <p>Cuando mezclas grupos con variables continuas, técnicamente se llama <strong>ANCOVA</strong>, pero por debajo sigue siendo la misma regresión de siempre.</p>
       <p>Ahora las diferencias entre tamaños de empresa están <strong>controladas por educación y experiencia</strong>: ya no mezclan el hecho de que en las empresas grandes trabaje gente más preparada.</p>`,
      'Corre el modelo completo mezclando variables continuas y grupos.',
      'reg ingreso educ exper mujer i.tamano, robust',
      { comandos: ['regress'], contiene: ['i.tamano'], minVariables: 4 },
      ['Van primero las continuas y después <code>i.tamano</code>.',
       'El orden no importa realmente, pero así se lee mejor.',
       'Escribe: <code>reg ingreso educ exper mujer i.tamano, robust</code>'],
      25, 'Cierre de módulo. Compara: las diferencias entre empresas bajaron al controlar por educación. Eso es información valiosa.'),
  ],
},
// ────────────────────────────────────────────────────────────── 11
{
  id: 'm11', titulo: 'Modelos de sí/no', subtitulo: 'Logit, probit y márgenes', icono: '🎯',
  requiere: ['m10'], color: 'sig',
  lecciones: [
    L('m11l1', 'La recta que predice imposibles',
      'Por qué el modelo lineal no sirve para un sí/no.',
      `<p>Puedes correr una regresión normal con una dependiente de 0/1. Se llama <strong>modelo de probabilidad lineal</strong> y sus coeficientes se leen directo como puntos de probabilidad. Muy cómodo.</p>
       <p>Pero tiene un problema de fondo: una recta, si la estiras, predice probabilidades de <strong>−8%</strong> o de <strong>115%</strong>, que no existen.</p>
       <p>Corre este modelo y mira la constante: vas a ver el problema con tus propios ojos.</p>`,
      'Corre el modelo de probabilidad lineal para el empleo formal.',
      'reg formal educ exper mujer, robust',
      { comandos: ['regress'], contiene: ['formal'] },
      ['Es una regresión normal, pero con <code>formal</code> como dependiente.',
       'Con <code>robust</code>, que aquí es obligatorio.',
       'Escribe: <code>reg formal educ exper mujer, robust</code>'],
      20, 'Fíjate en la constante negativa: eso es una probabilidad imposible. Por eso existe el logit.'),

    L('m11l2', 'El logit',
      'La curva que nunca sale del 0% al 100%.',
      `<p><code>logit</code> usa una curva en forma de S que <strong>nunca</strong> baja de 0 ni pasa de 100%.</p>
       <p>El precio: <strong>los coeficientes ya no se leen directo</strong>. Un 0,187 no significa 18,7% de nada. De ese número crudo solo puedes sacar dos cosas:</p>
       <ul>
         <li>El <strong>signo</strong> (si ayuda o perjudica).</li>
         <li>Si es <strong>significativo</strong>.</li>
       </ul>
       <p>Para el número interpretable hace falta un paso más, que viene en la siguiente lección.</p>`,
      'Corre el logit del empleo formal.',
      'logit formal educ exper mujer',
      { comandos: ['logit'] },
      ['El comando es <code>logit</code>.',
       'Se escribe igual que una regresión.',
       'Escribe: <code>logit formal educ exper mujer</code>'],
      25, 'Bien. Ahora viene el paso que la mitad de los estudiantes se salta.'),

    L('m11l3', 'Margins: el paso obligatorio',
      'Traducir los coeficientes a puntos de probabilidad.',
      `<p><code>margins, dydx(*)</code> traduce cada coeficiente a <strong>puntos de probabilidad</strong>. Esto es lo que se reporta en un trabajo, no el coeficiente crudo.</p>
       <p>Un resultado de 0,0334 se lee: <strong>"3,34 puntos de probabilidad"</strong>. O sea: de cada 100 personas parecidas, unas 3 más tendrían empleo formal por cada año extra de estudio.</p>
       <p>Ojo con la palabra exacta: son <strong>puntos</strong> de probabilidad, no "por ciento". Si la probabilidad pasa de 40% a 43,3%, subió 3,3 <u>puntos</u>.</p>`,
      'Traduce los coeficientes a puntos de probabilidad.',
      'margins, dydx(*)',
      { comandos: ['margins'] },
      ['El comando es <code>margins</code> con una opción.',
       'La opción es <code>dydx(*)</code>, con el asterisco entre paréntesis.',
       'Escribe: <code>margins, dydx(*)</code>'],
      30, '¡Ahí está el número que va en tu trabajo! Nunca reportes un logit sin este paso.'),

    L('m11l4', 'Razón de momios',
      'La otra forma de leer un logit.',
      `<p><code>logistic</code> corre <strong>exactamente el mismo modelo</strong>, pero muestra e^coeficiente: la <strong>razón de momios</strong>.</p>
       <p>Dos cosas que hay que tener clarísimas:</p>
       <ul>
         <li>El valor neutro es el <strong>1</strong>, no el 0. Mayor a 1 ayuda, menor a 1 perjudica.</li>
         <li>Una razón de 1,206 significa <strong>"20,6% más momios"</strong>, <u>no</u> "20,6% más probabilidad". Son cosas distintas.</li>
       </ul>`,
      'Corre el mismo modelo mostrando las razones de momios.',
      'logistic formal educ exper mujer',
      { comandos: ['logistic'] },
      ['El comando es <code>logistic</code> (con "ic" al final).',
       'Corre igual que el logit pero muestra otra cosa.',
       'Escribe: <code>logistic formal educ exper mujer</code>'],
      20, 'Compara con el logit: son el mismo modelo contado con dos reglas distintas.'),

    L('m11l5', 'Sensibilidad y especificidad',
      'Qué tan bien clasifica el modelo.',
      `<p><code>estat classification</code> arma la tabla de aciertos y errores:</p>
       <ul>
         <li><strong>Sensibilidad</strong>: de los que <u>sí</u>, cuántos detectó.</li>
         <li><strong>Especificidad</strong>: de los que <u>no</u>, cuántos acertó.</li>
       </ul>
       <p>Las dos se pelean: si bajas el punto de corte atrapas más positivos pero te equivocas más con los negativos.</p>
       <p><strong>Cuidado con el "% correctamente clasificado":</strong> si el 85% de los casos son "no", decir siempre "no" te da 85% de aciertos sin que el modelo sirva de nada.</p>`,
      'Mira la tabla de clasificación del modelo.',
      'estat classification',
      { comandos: ['estat'], contiene: ['classification'] },
      ['Es <code>estat</code> con un subcomando largo.',
       'El subcomando es <code>classification</code>.',
       'Escribe: <code>estat classification</code>'],
      25, 'Bien. Sensibilidad y especificidad: las dos caras del mismo modelo.'),

    L('m11l6', 'La curva ROC',
      'La medida global de qué tan bien discrimina.',
      `<p><code>lroc</code> dibuja la curva ROC y calcula el <strong>área bajo la curva (AUC)</strong>.</p>
       <p>El AUC se lee así: si tomas al azar una persona que sí y otra que no, es la probabilidad de que el modelo le dé mayor puntaje a la que sí.</p>
       <ul>
         <li>0,50 → puro azar, el modelo no sirve.</li>
         <li>0,70 a 0,80 → aceptable.</li>
         <li>0,80 a 0,90 → bueno.</li>
         <li>Más de 0,90 → excelente… y conviene revisar que no hayas metido una variable que ya contenga la respuesta.</li>
       </ul>`,
      'Dibuja la curva ROC.',
      'lroc',
      { comandos: ['lroc'] },
      ['Es una sola palabra.',
       'Viene de "logistic ROC".',
       'Escribe: <code>lroc</code>'],
      25, '¡Ahí está la curva! Mientras más se pegue a la esquina superior izquierda, mejor discrimina.'),

    L('m11l7', 'Elegir el punto de corte',
      'Decidir cuándo el modelo dice "sí".',
      `<p><code>lsens</code> dibuja cómo cambian la sensibilidad y la especificidad según dónde pongas el corte.</p>
       <p>No hay un corte "correcto": depende de <strong>qué error te duele más</strong>.</p>
       <ul>
         <li>Detectando quién necesita ayuda social → prefieres <strong>sensibilidad alta</strong> (mejor incluir de más que dejar a alguien fuera).</li>
         <li>Dando un crédito → prefieres <strong>especificidad alta</strong> (mejor negar de más que prestarle a quien no paga).</li>
       </ul>`,
      'Mira cómo cambia todo según el punto de corte.',
      'lsens',
      { comandos: ['lsens'] },
      ['Una sola palabra: <code>lsens</code>.',
       'De "logistic sensitivity".',
       'Escribe: <code>lsens</code>'],
      20, 'Ahí ves el intercambio. Elegir el corte es una decisión tuya, no del programa.'),

    L('m11l8', 'Probit',
      'El primo del logit.',
      `<p><code>probit</code> hace lo mismo con una curva ligeramente distinta (la campana de Gauss en vez de la logística).</p>
       <p>En la práctica dan <strong>casi siempre la misma respuesta</strong>. Los coeficientes crudos no son comparables entre los dos, pero los efectos marginales de <code>margins</code> sí, y salen casi iguales.</p>
       <p>Se usa sobre todo para comprobar que tu conclusión no depende de qué curva elegiste.</p>`,
      'Corre el probit y compáralo con el logit.',
      'probit formal educ exper mujer',
      { comandos: ['probit'] },
      ['El comando es <code>probit</code>.',
       'Se escribe igual que el logit.',
       'Escribe: <code>probit formal educ exper mujer</code>'],
      20, 'Cierre de módulo. Corre <code>margins, dydx(*)</code> después y compara con el logit: casi idénticos.'),
  ],
},
// ────────────────────────────────────────────────────────────── 12
{
  id: 'm12', titulo: 'Varias opciones', subtitulo: 'Multinomial y ordenado', icono: '🔱',
  requiere: ['m11'], color: 'ochre',
  lecciones: [
    L('m12l1', 'Cuando hay tres opciones sin orden',
      'El modelo multinomial.',
      `<p>Una persona puede ser: asalariada formal, asalariada informal, o trabajar por cuenta propia. <strong>Ninguna es "más" que otra</strong>: son distintas, sin orden.</p>
       <p><code>mlogit</code> corre varias comparaciones a la vez, todas contra una <strong>categoría base</strong>. Por eso la tabla sale más larga: un bloque por cada comparación.</p>
       <p><code>base(1)</code> le dice cuál usar de referencia.</p>`,
      'Corre el modelo multinomial de la situación laboral.',
      'mlogit situacion educ exper mujer, base(1)',
      { comandos: ['mlogit'] },
      ['El comando es <code>mlogit</code>.',
       'La opción <code>base(1)</code> va después de la coma.',
       'Escribe: <code>mlogit situacion educ exper mujer, base(1)</code>'],
      30, 'Bien. Ahora lo más importante: cómo se lee sin decir una barbaridad.'),

    L('m12l2', 'La regla de oro',
      '"Comparado con..." nunca se omite.',
      `<p>Este es <strong>el error más frecuente</strong> de todo el modelo, y el que más se castiga en una defensa.</p>
       <p>Nunca digas: <em>"la educación reduce la informalidad"</em>.</p>
       <p>Di siempre: <em>"la educación reduce la probabilidad de ser informal <strong>comparado con ser asalariado formal</strong>"</em>.</p>
       <p>Sin esa segunda parte, la frase afirma algo que el modelo nunca dijo. Todos los coeficientes son comparaciones contra la base, ninguno es absoluto.</p>`,
      'Corre el modelo cambiando la base a la categoría 2 y compara los números.',
      'mlogit situacion educ exper mujer, base(2)',
      { comandos: ['mlogit'], contiene: ['base(2)'] },
      ['Es el mismo comando con otra base.',
       'Cambia <code>base(1)</code> por <code>base(2)</code>.',
       'Escribe: <code>mlogit situacion educ exper mujer, base(2)</code>'],
      25, 'Fíjate: cambiaron todos los números. Es el mismo modelo, otra referencia. Por eso hay que decir siempre contra qué comparas.'),

    L('m12l3', 'Cuando SÍ hay orden',
      'Logit ordenado.',
      `<p>Si tus categorías tienen un orden natural (muy triste → muy feliz, pobre → rico), usar <code>mlogit</code> <strong>desperdicia información</strong>: trataría "muy feliz" y "muy triste" como dos categorías sin relación.</p>
       <p><code>ologit</code> aprovecha la escalera: supone una sola escala por debajo, con "cortes" que la dividen en tramos.</p>
       <p>Un coeficiente positivo empuja hacia las categorías altas. Las filas <code>/cut1</code>, <code>/cut2</code>... <strong>no se interpretan</strong>.</p>`,
      'Abre la base de hogares y corre un logit ordenado de la satisfacción.',
      'use hogares_satisfaccion, clear\ngen lningh = ln(ingreso_hogar)\nologit satisfaccion lningh educ_jefe desempleo',
      { esDoFile: true, contiene: ['ologit'] },
      ['Son tres líneas: abrir la base, crear el logaritmo y correr el modelo.',
       'Hazlo en la pestaña Do-file.',
       'Escribe:<br><code>use hogares_satisfaccion, clear</code><br><code>gen lningh = ln(ingreso_hogar)</code><br><code>ologit satisfaccion lningh educ_jefe desempleo</code>'],
      30, '¡Muy bien! Más ingreso empuja hacia arriba, el desempleo hacia abajo. Y los cortes se ignoran.'),

    L('m12l4', 'Probit ordenado',
      'La versión con la otra curva.',
      `<p><code>oprobit</code> es a <code>ologit</code> lo que probit es a logit: la misma pregunta con otra curva.</p>
       <p>Correr los dos y ver que cuentan la misma historia es una forma barata de mostrar que tu resultado es sólido. Eso se llama <strong>análisis de sensibilidad</strong> y queda muy bien en un trabajo.</p>`,
      'Corre el probit ordenado y compara con el ologit.',
      'oprobit satisfaccion lningh educ_jefe desempleo',
      { comandos: ['oprobit'] },
      ['El comando es <code>oprobit</code>.',
       'Las mismas variables que el ologit.',
       'Escribe: <code>oprobit satisfaccion lningh educ_jefe desempleo</code>'],
      25, 'Compara los signos y las significancias: idénticos. Tu conclusión no depende de la curva elegida.'),

    L('m12l5', 'El supuesto IIA',
      'La letra chica del multinomial.',
      `<p><code>mlogit</code> supone <strong>IIA</strong>: que agregar o quitar una opción no cambia cómo se comparan las demás.</p>
       <p>Ejemplo de cuándo falla: si comparas "bus" y "carro" y de repente agregas "bus azul", el modelo supone que eso no afecta la comparación bus-carro. Pero claro que la afecta, porque "bus" y "bus azul" son casi lo mismo.</p>
       <p>En tu caso (formal / informal / cuenta propia) el supuesto es razonable. Basta con <strong>mencionarlo</strong> en el trabajo. Si sospecharas que falla, existen <code>nlogit</code> y <code>asmprobit</code>.</p>`,
      'Corre el probit multinomial para comprobar que la conclusión no cambia.',
      'use enemdu_eloro_2024, clear\nmprobit situacion educ exper mujer, base(1)',
      { esDoFile: true, contiene: ['mprobit'] },
      ['Primero vuelve a abrir la base de empleo.',
       'Después corre <code>mprobit</code> igual que el <code>mlogit</code>.',
       'Escribe:<br><code>use enemdu_eloro_2024, clear</code><br><code>mprobit situacion educ exper mujer, base(1)</code>'],
      30, 'Cierre de módulo. Los signos coinciden con el mlogit: tu resultado aguanta el cambio de modelo.'),
  ],
},
// ────────────────────────────────────────────────────────────── 13
{
  id: 'm13', titulo: 'Proyecto final', subtitulo: 'Un trabajo completo de principio a fin', icono: '🎓',
  requiere: ['m12'], color: 'sig',
  lecciones: [
    L('m13l1', 'Armar el esqueleto',
      'La estructura de un do-file completo.',
      `<p>Un trabajo serio se organiza siempre igual, en secciones comentadas:</p>
       <ol>
         <li><strong>Encabezado</strong> — título, autor, fecha.</li>
         <li><strong>Preparación</strong> — <code>clear all</code>, <code>set more off</code>.</li>
         <li><strong>Cargar los datos</strong>.</li>
         <li><strong>Depuración</strong> — faltantes, códigos, duplicados.</li>
         <li><strong>Variables nuevas</strong> — logaritmos, recodificaciones, etiquetas.</li>
         <li><strong>Descriptivas</strong>.</li>
         <li><strong>Modelo</strong>.</li>
         <li><strong>Supuestos</strong>.</li>
         <li><strong>Resultados finales</strong>.</li>
       </ol>
       <p>Escribe ese esqueleto con comentarios antes de escribir una sola línea de código real. Te ordena la cabeza.</p>`,
      'En el Do-file, escribe el esqueleto con comentarios y las tres primeras secciones.',
      '* ==========================================\n* Determinantes del ingreso en El Oro, 2024\n* Autora: (tu nombre)\n* ==========================================\n\nclear all\nset more off\n\nuse enemdu_eloro_2024, clear',
      { esDoFile: true, minLineas: 4, contiene: ['*'] },
      ['Usa líneas que empiecen con <code>*</code> para los comentarios.',
       'Después van <code>clear all</code>, <code>set more off</code> y <code>use</code>.',
       'Escribe el encabezado con asteriscos y las tres líneas de preparación.'],
      25, 'Ese encabezado ya se ve profesional. Ahora a llenarlo.'),

    L('m13l2', 'Depurar y preparar',
      'Todo lo del módulo 2 al 5, junto.',
      `<p>Ahora la parte de preparación completa, en un solo bloque:</p>
       <ul>
         <li>Revisar faltantes.</li>
         <li>Botar las filas incompletas del modelo (<strong>una sola vez</strong>, para que todos los modelos usen la misma muestra).</li>
         <li>Crear los logaritmos.</li>
         <li>Etiquetar lo nuevo.</li>
       </ul>
       <p>Lo de "una sola vez" es importante: si cada modelo bota filas distintas, los R² dejan de ser comparables entre sí.</p>`,
      'Escribe el bloque de depuración y creación de variables.',
      'misstable summarize\ndrop if missing(ingreso, educ, exper, horas)\n\ngen lningreso = ln(ingreso)\nlabel variable lningreso "Logaritmo del ingreso mensual"',
      { esDoFile: true, contiene: ['drop if', 'gen'] },
      ['Empieza con <code>misstable summarize</code>.',
       'Después <code>drop if missing(...)</code> con todas las variables del modelo.',
       'Termina creando <code>lningreso</code> y etiquetándola.'],
      30, 'Muy bien. Y botaste los faltantes una sola vez: los R² van a ser comparables.'),

    L('m13l3', 'Modelo y supuestos',
      'El corazón del trabajo.',
      `<p>Ahora el modelo, guardado para poder compararlo, y las pruebas de supuestos una tras otra.</p>
       <p><code>estimates store</code> guarda un modelo con un nombre, y después <code>estimates table</code> los pone lado a lado. Es la forma de armar la tabla comparativa que pide todo trabajo.</p>`,
      'Corre el modelo con controles, guárdalo y revisa los supuestos.',
      'reg lningreso educ exper exper2 mujer i.tamano, robust\nestimates store completo\n\nestat vif\nestat hettest\nestat ovtest',
      { esDoFile: true, contiene: ['reg', 'estat'] },
      ['Corre la regresión con <code>robust</code> e <code>i.tamano</code>.',
       'Guárdala con <code>estimates store completo</code>.',
       'Después las tres pruebas: <code>estat vif</code>, <code>estat hettest</code>, <code>estat ovtest</code>.'],
      35, '¡Excelente! Modelo corrido, guardado y con los supuestos revisados. Eso es un trabajo completo.'),

    L('m13l4', 'El modelo de sí/no',
      'La segunda parte del trabajo.',
      `<p>Casi todo trabajo de econometría laboral tiene dos partes: una sobre el <strong>monto</strong> del ingreso y otra sobre la <strong>probabilidad</strong> de algo (tener empleo formal, participar en el mercado).</p>
       <p>Aquí va el logit completo con todo lo que ya sabes: modelo, margins, clasificación y ROC.</p>`,
      'Corre el logit completo con su postestimación.',
      'logit formal educ exper mujer i.tamano\nmargins, dydx(*)\nestat classification\nlroc',
      { esDoFile: true, contiene: ['logit', 'margins'] },
      ['Corre el <code>logit</code> con <code>i.tamano</code>.',
       'Después <code>margins, dydx(*)</code>, que nunca puede faltar.',
       'Cierra con <code>estat classification</code> y <code>lroc</code>.'],
      35, '¡Impecable! Corriste un logit como se debe: con margins, clasificación y ROC.'),

    L('m13l5', 'Comparar modelos',
      'La tabla que va en el trabajo.',
      `<p>Se guardan varios modelos y se ponen lado a lado. Así se muestra que tu resultado <strong>no depende</strong> de qué controles metiste.</p>
       <p>Un modelo simple, uno con controles y uno completo: si el coeficiente que te interesa se mantiene parecido en los tres, tu resultado es sólido. Si cambia mucho, hay que explicarlo.</p>`,
      'Corre tres modelos, guárdalos y compáralos en una tabla.',
      'reg lningreso educ, robust\nestimates store m1\nreg lningreso educ exper exper2, robust\nestimates store m2\nreg lningreso educ exper exper2 mujer i.tamano, robust\nestimates store m3\nestimates table m1 m2 m3',
      { esDoFile: true, contiene: ['estimates table'] },
      ['Corre tres regresiones, cada una seguida de <code>estimates store</code> con un nombre distinto.',
       'Al final, <code>estimates table m1 m2 m3</code>.',
       'Fíjate si el coeficiente de <code>educ</code> se mantiene parecido en los tres.'],
      40, '🎓 ¡Terminaste el curso completo! Esa tabla comparativa es exactamente lo que se entrega. Ya sabes depurar, modelar, revisar supuestos e interpretar. Felicitaciones de verdad.'),
  ],
},
];

export const NIVELES = [
  { nivel: 1, nombre: 'Aprendiz', xpMin: 0 },
  { nivel: 2, nombre: 'Ayudante de cátedra', xpMin: 120 },
  { nivel: 3, nombre: 'Analista junior', xpMin: 300 },
  { nivel: 4, nombre: 'Analista', xpMin: 520 },
  { nivel: 5, nombre: 'Econometrista', xpMin: 780 },
  { nivel: 6, nombre: 'Econometrista senior', xpMin: 1050 },
  { nivel: 7, nombre: 'Maestra del do-file', xpMin: 1350 },
];

export const INSIGNIAS = [
  { id: 'primer_uso', nombre: 'Primera vez', desc: 'Abriste tu primera base de datos', icono: '📂' },
  { id: 'depuradora', nombre: 'Depuradora', desc: 'Terminaste el módulo de depuración', icono: '🧹', modulo: 'm2' },
  { id: 'etiquetas', nombre: 'Todo etiquetado', desc: 'Terminaste el módulo de etiquetas', icono: '🏷️', modulo: 'm4' },
  { id: 'recodificadora', nombre: 'Recodificadora', desc: 'Pasaste una variable de 5 categorías a 3', icono: '🔀', modulo: 'm5' },
  { id: 'primera_reg', nombre: 'Primera regresión', desc: 'Corriste tu primera regresión', icono: '📈', modulo: 'm7' },
  { id: 'supuestos', nombre: 'Revisora de supuestos', desc: 'Revisaste los cuatro supuestos', icono: '🔍', modulo: 'm8' },
  { id: 'elasticidad', nombre: 'Elasticidades', desc: 'Estimaste una Cobb-Douglas', icono: '📐', modulo: 'm9' },
  { id: 'margins', nombre: 'Nunca sin margins', desc: 'Corriste margins después de un logit', icono: '🎯', modulo: 'm11' },
  { id: 'multinomial', nombre: 'Varias opciones', desc: 'Dominaste mlogit y ologit', icono: '🔱', modulo: 'm12' },
  { id: 'graduada', nombre: 'Graduada', desc: 'Terminaste el curso completo', icono: '🎓', modulo: 'm13' },
];

export function totalLecciones() {
  return MODULOS.reduce((a, m) => a + m.lecciones.length, 0);
}
export function xpTotal() {
  return MODULOS.reduce((a, m) => a + m.lecciones.reduce((b, l) => b + l.xp, 0), 0);
}
export function buscarLeccion(id) {
  for (const m of MODULOS) {
    const l = m.lecciones.find((x) => x.id === id);
    if (l) return { modulo: m, leccion: l };
  }
  return null;
}
export function nivelDe(xp) {
  let n = NIVELES[0];
  for (const v of NIVELES) if (xp >= v.xpMin) n = v;
  return n;
}
