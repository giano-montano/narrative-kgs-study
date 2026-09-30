# **A little implementation of narrative knowledge graphs**

Giano Montaño, Robinson Mendoza, Diego Lázaro  
*IEEE CS PUCP, Pontificia Universidad Católica del Perú, Lima, Perú*  
*gianomontanoc@gmail.com, leotec614@gmail.com, lazaro1928lazaro@gmail.com*

## **Resumen (Abstract)**

Este trabajo examina si el formato en que se exige la salida a un modelo de lenguaje (LLM) —texto libre, JSON sin garantía de esquema o JSON con decodificación restringida— afecta la calidad de los grafos de conocimiento narrativos que extrae, y si ese efecto depende del tamaño del modelo. Aunque la salida estructurada suele asumirse como la opción por defecto al construir grafos de conocimiento con LLMs, la evidencia sobre su costo proviene principalmente de tareas de razonamiento matemático y lógico, no de extracción de información narrativa. Se diseñó un esquema mínimo de tripletas (evento, relación, argumento, tipo de argumento) con relaciones cerradas que permite una comparación exacta contra una anotación de referencia, y se extrajeron grafos de 35 historias cortas de ROCStories —5 para ajustar y congelar los prompts, 30 para evaluación— con dos modelos de distinto tamaño (openai/gpt-oss-20b y openai/gpt-oss-120b) bajo las tres condiciones, en dos corridas independientes. El formato no produjo ningún efecto detectable sobre la calidad de la extracción: los doce intervalos de confianza del 95 %, obtenidos por bootstrap pareado sobre la diferencia de F1 por historia, incluyen el cero. El tamaño del modelo, en cambio, sí importó: el modelo de 120B alcanzó entre 0.741 y 0.779 de F1 frente a 0.654 a 0.680 del modelo de 20B, y resultó considerablemente más estable entre corridas (Jaccard 0.75–0.77 frente a 0.55–0.61). La decodificación restringida garantizó por construcción el 100 % de salidas válidas, pero las otras dos condiciones también lo alcanzaron, de modo que el costo de formato que motivó la pregunta no llegó a exhibirse; la decodificación restringida, en cambio, encareció el prompt un 37 %. Con 30 historias solo se descartan efectos grandes, por lo que este resultado nulo debe leerse como ausencia de evidencia y no como evidencia de equivalencia.

Palabras clave: grafos de conocimiento narrativos, extracción de información con LLMs, formato de salida estructurada, decodificación restringida, evaluación de tripletas, resultado nulo

## **I. Introducción**

Las historias narrativas —relatos cortos, noticias, guiones o reportes— organizan la experiencia humana en secuencias de eventos protagonizados por personajes, conectados por relaciones de agencia, lugar y orden temporal \[1\]. Casi todas circulan como texto no estructurado, lo que dificulta consultarlas, compararlas o reutilizarlas. Los modelos de lenguaje de gran escala (LLMs) generan narrativa fluida, pero les cuesta mantener la consistencia semántica \[1\] y razonar lógicamente \[2\]. Los grafos de conocimiento (KGs), que representan entidades como nodos y relaciones como aristas \[3\], ofrecen una alternativa: organizan información heterogénea y permiten razonar sobre ella \[4\]. Por eso, construir un pipeline que transforme historias narrativas en un grafo de conocimiento —representando sus personajes, eventos, lugares, tiempo y relaciones— es el objetivo general de este trabajo.

Alcanzar ese objetivo implica, en primer lugar, analizar el estado del arte para identificar los enfoques existentes de construcción, representación y evaluación de KGs narrativos, así como sus limitaciones. A partir de ahí, este trabajo define una ontología narrativa mínima que sirve de esquema del grafo, diseña un flujo de extracción de entidades y relaciones con LLMs, e incorpora la dimensión temporal para ordenar y relacionar los eventos de la historia. Finalmente, evalúa e interpreta los resultados obtenidos mediante métricas de precisión, recall, F1, validez de la salida y estabilidad entre corridas, con el fin de validar la calidad del grafo resultante.

Dentro de este pipeline, un aspecto particularmente relevante, y poco estudiado en el contexto de extracción narrativa, es la forma en que se le exige al LLM entregar su salida. En la práctica, suele asumirse que forzar una salida estructurada mejora la calidad y confiabilidad de la extracción frente a pedir texto libre. Sin embargo, la evidencia sobre el costo de restringir el formato proviene mayormente de tareas de razonamiento matemático y lógico \[21\], \[22\], no de tareas de extracción de información narrativa. Esa misma evidencia sugiere que el costo depende de la capacidad del modelo: los modelos con holgura absorben el esquema sin pérdida, mientras que los más débiles se degradan \[22\]. No está claro si este costo o beneficio se mantiene, se atenúa o se invierte cuando la tarea es identificar eventos, personajes y relaciones en una historia corta, ni si el efecto depende del tamaño del modelo utilizado.

La pregunta de investigación que guía este trabajo es: ¿cambia la calidad del KG extraído según cómo se exige la salida (texto libre, JSON sin garantía, JSON con decodificación restringida)? ¿Depende ese efecto del tamaño del modelo?

### **A. Objetivos generales y específicos**

> * **Objetivo general:** Diseñar e implementar un pipeline de construcción de grafos de conocimiento a partir de historias narrativas, que represente sus personajes, eventos, lugares, tiempo y relaciones.  
> * **Objetivos específicos:**  
  * Analizar el estado del arte para identificar enfoques de construcción, representación y evaluación de KGs narrativos, y sus limitaciones.  
  * Definir una ontología narrativa mínima que sirva de esquema del grafo.  
  * Diseñar un flujo de extracción de entidades y relaciones con LLMs.  
  * Incorporar la dimensión temporal para ordenar y relacionar los eventos de la historia.  
  * Evaluar e interpretar métricas de resultados (precisión, recall, F1, validez de la salida y estabilidad entre corridas) para validar el grafo resultante.

## **II. Estado del Arte (Trabajos Relacionados)**

Las historias, sean una noticia, un relato patrimonial, el reporte de un accidente o el guión de una película, son secuencias de eventos vividos por personajes y unidos por relaciones causales [\[2\]](https://www.zotero.org/google-docs/?fe9qDv). Casi todas circulan como texto no estructurado, lo que dificulta consultarlas, compararlas o reutilizarlas. Los modelos de lenguaje de gran escala (LLMs) generan narrativa fluida, pero les cuesta mantener la consistencia semántica \[1\] y razonar lógicamente \[2\]. Los grafos de conocimiento (Knowledge Graphs, KGs), que representan entidades como nodos y relaciones como aristas \[3\], ofrecen una alternativa: organizan información heterogénea y permiten razonar sobre ella \[4\]. Por eso su combinación con LLMs es hoy una línea muy activa, como muestran las revisiones recientes sobre construcción de KGs \[3\].

La literatura que une KGs y narrativa puede ordenarse en cuatro líneas. La primera construye KGs narrativos para dominios concretos: patrimonio cultural, con artefactos de museo \[6\], teatro de sombras multimodal \[7\] y patrimonio inmaterial \[8\]; educación, con un KG organizado en tema-evento-valor-evidencia \[9\]; y estructura de trama en historietas animadas a partir de personajes, eventos y relaciones \[10\]. La segunda extrae KGs desde texto narrativo con LLMs: propaganda política mediante la ontología PrOnto Narr y triples RDF \[11\], reportes de accidentes con extracción guiada por esquema \[12\], diálogos de películas con NER y extracción de relaciones ajustados \[13\] y documentos legales con resolución de correferencias \[14\]. La tercera modela eventos y su evolución: KGs centrados en eventos con roles y puntos de vista \[15\], grafos narrativos sobre KGs temporales construidos desde noticias \[16\], grafos lógicos de eventos que dan coherencia causal \[2\] y KGs espacio-temporales \[5\]. La cuarta usa el KG para generar historias, mediante grafos de planificación de la trama \[1\], conocimiento externo en narración visual \[17\], \[18\] o aprendizaje contrastivo \[19\]. De forma transversal, construir estos grafos se apoya en métodos híbridos que combinan ontología y datos \[4\] y en el alineamiento de ontologías y entidades para integrar fuentes \[9\], \[20\].

## **III. Metodología**

***3.1 Diseño experimental***

Se examina si el formato en que se le exige a un modelo de lenguaje (LLM) escribir su salida modifica la calidad del grafo de conocimiento narrativo que extrae, y si ese efecto depende del tamaño del modelo. Se cruzan tres formatos de salida con dos modelos gpt-oss (openai/gpt-oss-20b y openai/gpt-oss-120b), consultados a través de la API de Groq (Tabla 1). Las condiciones comparten las mismas instrucciones y solo varía el bloque de formato; se fijan reasoning\_effort="low", la temperatura (1.0) y una llamada por historia. En el conjunto de pruebas de desarrollo (“dev”) se hace una corrida (máximo tres iteraciones del prompt) y en el conjunto de test, dos.

**Tabla 1\.** Condiciones de formato de salida.

| Condición | Formato solicitado | Parámetro response\_format |
| :---- | :---- | :---- |
| texto | Una tripleta por línea (p. ej., lost | agent | Maria \[Character\]) | No se usa |
| json\_objeto | Objeto JSON {"triples": \[...\]} | {"type": "json\_object"} |
| json\_estricto | Mismo bloque que json\_objeto | json\_schema con strict: true (decodificación restringida) |

***3.2 Corpus***

Se usa ROCStories \[23\], distribuido bajo licencia CC BY-SA 4.0: 35 historias de cinco oraciones muestreadas con semilla 42, 5 para dev (donde se ajustan y congelan los prompts) y 30 para test.

***3.3 Esquema de tripletas y gold***

Gold y salidas son filas (event, rel, arg, arg\_type) con un esquema fijo de relaciones cerradas y etiquetas de una palabra, que permite una comparación exacta (Tabla 2). Se anota cada verbo de acción o suceso, los pronombres se reemplazan por su referente y sólo se registra lo explícito.

**Tabla 2\.** Campos de la tripleta.

| Campo | Valores permitidos |
| :---- | :---- |
| event | Una palabra: el verbo en la forma que aparece en el texto (lost, no lose) |
| rel | agent (quién actúa), patient (a quién o qué afecta directamente), location (dónde ocurre), next (evento que sigue en el texto) |
| arg | Una palabra: nombre propio o sustantivo núcleo; con next, otro evento |
| arg\_type | Character (personas y animales), Object, Location, Event (solo con next) |

El gold es de un único anotador; el de test se elabora sin ver salidas del modelo y se congela antes de puntuar, con una excepción que se declara en la sección V-D.

***3.4 Implementación***

El archivo run.py consulta al modelo y guarda la respuesta sin procesar; score.py la parsea y puntúa, de modo que un error de parseo se corrige sin nuevas llamadas. Se guarda solo el contenido final, sin el razonamiento, y las respuestas nunca se sobrescriben.

***3.5 Evaluación***

Con el mismo criterio en las tres condiciones, basta una tripleta o línea inválida para que toda la salida cuente como grafo vacío. Tras normalizar (minúsculas, sin puntuación, primera palabra del event y última del arg), una predicción es un acierto si (story\_id, event, rel, arg) coincide exactamente con el gold; arg\_type no entra en la clave. Con gold y predicción como conjuntos:

$tp=|pred\ ∩\ gold|,\ \ precisión\ =\frac{tp}{|pred|},\ \ recall\ =\ \frac{tp}{|gold|}\ {\ }$	

y el F1, de forma micro; la métrica principal excluye next. Se reportan además el porcentaje de salidas válidas, los tokens por llamada y la estabilidad entre corridas (Jaccard). Las diferencias entre condiciones se estiman con la diferencia de F1 por historia, con un intervalo de confianza del 95 % por bootstrap pareado (1000 remuestreos).

***3.6 Limitaciones***

El gold procede de un solo anotador; con 30 historias de test solo pueden detectarse diferencias grandes; y ROCStories probablemente forma parte del pre entrenamiento de los modelos.

## **IV. Desarrollo y Ejecución \- Leo**

***A. Diseño experimental***

El experimento evalúa el efecto del formato de salida sobre la calidad de la extracción de tripletas (evento, relación, argumento, tipo de argumento) en historias narrativas cortas. Se definieron tres condiciones que comparten exactamente las mismas reglas de anotación en el prompt del sistema; lo único que varía entre ellas es cómo se le solicita al modelo que escriba su respuesta:

* **Texto:** el modelo devuelve una tripleta por línea (evento | relación | argumento \[tipo\]), sin ninguna restricción sobre la decodificación.  
* **JSON objeto:** el modelo devuelve un objeto JSON, sin un esquema estricto que valide su forma.  
* **JSON estricto:** el modelo devuelve un JSON cuya decodificación está restringida a un esquema definido, que obliga a una estructura exacta de campos y tipos.

Cada condición se evaluó con dos modelos de la familia GPT-OSS (gpt-oss-20b y gpt-oss-120b), manteniendo fija la temperatura (1.0) y el conjunto de historias, de modo que la única variable que cambia entre corridas sea el formato de salida.

Esta decisión responde a que comparar directamente un esquema estructurado contra una extracción completamente libre, sin controlar el resto de la anotación, produciría una comparación circular: cualquier diferencia observada podría deberse tanto al formato como a diferencias en las reglas mismas de anotación, sin forma de aislar la causa real del efecto medido. Por eso se descartó el diseño alternativo considerado inicialmente (extracción libre frente a un esquema con JSON validado, evaluando además la resolución de correferencias como variable adicional), en favor de un diseño donde el único factor que cambia es el formato de salida.

***B. Fase de desarrollo (dev) y congelamiento de prompts***

Antes de correr el conjunto completo de historias reservado para evaluación, se ejecutó una primera iteración (dev1) sobre un subconjunto reducido de historias de práctica, con el fin de validar que los prompts producían salidas correctamente formateadas en las tres condiciones y que el costo en tokens por llamada se mantenía dentro de un límite manejable.

Los resultados de dev1 mostraron 100% de salidas válidas en las tres condiciones para ambos modelos, y un costo máximo de 2013 tokens por llamada (1110 de entrada más 903 de salida, para el modelo de 120B en la condición JSON estricto), por debajo del límite establecido de 2500 tokens. Al no detectarse salidas inválidas por problemas de formato ni un costo excesivo, los prompts se congelaron sin necesidad de ajustes adicionales, evitando así sobreajustarlos al conjunto de práctica. El punto de congelamiento quedó marcado en el control de versiones mediante una etiqueta, de modo que cualquier cambio posterior sobre los prompts pudiera detectarse antes de iniciar la fase de prueba.

***C. Fase de prueba (test)***

Una vez congelados los prompts, se ejecutaron dos corridas independientes por modelo y por condición sobre el conjunto completo de historias reservado para evaluación. La ejecución se dividió entre los integrantes del equipo, cada uno procesando un subconjunto de historias, y los resultados de cada corrida —incluyendo el conteo de tokens de entrada y salida por llamada— quedaron registrados para su posterior análisis conjunto.

***D. Métricas de evaluación***

El análisis se realizó únicamente sobre las tripletas correspondientes a las relaciones agente, paciente y locación. Toda salida inválida del modelo se contabilizó como una respuesta vacía. Se calcularon cinco métricas:

* **Precisión, exhaustividad y F1:** precisión, exhaustividad y F1 de las tripletas extraídas frente al gold estándar, agregadas de forma micro sobre las 30 historias, por modelo, condición y corrida.  
* **Tipos correctos:** el porcentaje de tipos de argumento correctamente identificados, medido únicamente entre las tripletas ya acertadas, dado que el acierto de una tripleta no garantiza que su tipo también sea correcto.  
* **Tokens promedio:** el promedio de tokens de entrada y de salida por llamada, como indicador del costo de cada condición.  
* **Estabilidad:** medida mediante el índice de Jaccard entre dos corridas independientes de la misma condición, dado que la temperatura no nula introduce variabilidad entre ejecuciones idénticas.  
* **Bootstrap pareado:** un intervalo de confianza del 95% obtenido por remuestreo (1000 iteraciones) sobre la diferencia de F1 entre cada par de condiciones, calculada historia por historia. Si el intervalo resultante no incluye el cero, la diferencia observada se considera estadísticamente distinguible del azar dado el tamaño reducido de la muestra (30 historias).

***E. Alcance y trabajo futuro***

La resolución de correferencias antes de la extracción, considerada inicialmente como una variable adicional del experimento, quedó fuera del alcance de este desarrollo por restricciones de tiempo. Esta línea se propone como trabajo futuro en la sección VII, en lugar de incorporarse como una cuarta condición experimental.

## **V. Resultados y Discusión \- Diego**

***A. Validez del Formato***

Una de las hipótesis iniciales sugería que los formatos no restringidos (texto y json\_objeto) producirían una mayor tasa de salidas inválidas frente a json\_estricto. Sin embargo, los resultados mostraron un 100% de salidas válidas en las 360 salidas de prueba (30 historias × 3 condiciones × 2 modelos × 2 corridas). Esto sugiere que la capacidad de los modelos actuales de la familia GPT-OSS para seguir instrucciones de formato es lo suficientemente robusta como para no requerir decodificación restringida en esquemas de extracción simples.

***B. Rendimiento de Extracción***

Al evaluar la calidad del grafo de conocimiento extraído (excluyendo la relación secuencial next), el modelo de 120 mil millones de parámetros (gpt-oss-120b) obtuvo su mejor F1, promediado sobre las dos corridas, con json\_estricto (F1 \= 0.7792), seguido de json\_objeto (0.7625) y texto libre (0.7413). El modelo de 20 mil millones de parámetros (gpt-oss-20b) no siguió ese orden: su mejor F1 fue con texto libre (0.6804), seguido de json\_estricto (0.6676) y json\_objeto (0.6536). Ninguna de estas diferencias entre condiciones resultó distinguible del azar (sección V-C); lo que sí separa con claridad a los resultados es el tamaño del modelo.

***Fig. 1\.** Puntaje F1 por modelo y condición de formato de salida*

***TABLA III.** PUNTAJE F1 (SIN NEXT) POR MODELO Y CONDICIÓN, PROMEDIO DE DOS CORRIDAS*

| Modelo | Condición | F1 |
| ----- | ----- | ----- |
| gpt-oss-120b | Texto | 0.7413 |
| gpt-oss-120b | JSON Objeto | 0.7625 |
| gpt-oss-120b | JSON Estricto | 0.7792 |
| gpt-oss-20b | Texto | 0.6804 |
| gpt-oss-20b | JSON Objeto | 0.6536 |
| gpt-oss-20b | JSON Estricto | 0.6676 |

La estabilidad entre corridas sí separó nítidamente a los dos modelos: el índice de Jaccard del gpt-oss-120b se mantuvo entre 0.753 y 0.774 en las tres condiciones, frente a 0.549 a 0.607 del gpt-oss-20b. El formato, en cambio, tuvo un costo medible en tokens: json\_estricto consumió 1102 tokens de prompt por llamada contra 806 de texto libre, un 37 % más, sin ganancia detectable en calidad.

***C. Análisis de Significancia (Bootstrap Pareado)***

Para determinar si estas variaciones representan un efecto real del formato de salida, se calculó la diferencia de F1 historia por historia y se aplicó un remuestreo por bootstrap pareado (1000 iteraciones). Como se observa en la Figura 2, los intervalos de confianza del 95% de las doce comparaciones evaluadas incluyeron el cero. El más ajustado es el de texto frente a json\_estricto en la corrida 1 del gpt-oss-120b, \[−0.1012, \+0.0009\], que incluye el cero por un margen muy estrecho; en la corrida 2, la misma comparación da \[−0.0841, \+0.0078\].

![][image1]

***Fig. 2\.** Diferencia de F1 entre condiciones con intervalo de confianza del 95 % (bootstrap pareado, 1000 remuestreos). Las doce comparaciones (tres pares de condiciones con dos modelos con dos corridas independientes) cruzan el cero.*

**TABLA IV.** DIFERENCIA DE F1 E INTERVALOS DE CONFIANZA 95% (BOOTSTRAP PAREADO) 

| Modelo | Caso | Comparación | Diferencia media | IC 95% inferior | IC 95% superior |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 120b | 1 | Texto − JSON Objeto | −0.0388 | −0.0944 | \+0.0125 |
| 120b | 1 | Texto − JSON Estricto | −0.0478 | −0.1012 | \+0.0009 |
| 120b | 1 | JSON Objeto − Estricto | −0.0089 | −0.0448 | \+0.0278 |
| 120b | 2 | Texto − JSON Objeto | −0.0369 | −0.0982 | \+0.0148 |
| 120b | 2 | Texto − JSON Estricto | −0.0396 | −0.0841 | \+0.0078 |
| 120b | 2 | JSON Objeto − Estricto | −0.0027 | −0.0388 | \+0.0358 |
| 20b | 1 | Texto − JSON Objeto | \+0.0091 | −0.0496 | \+0.0750 |
| 20b | 1 | Texto − JSON Estricto | \+0.0024 | −0.0508 | \+0.0500 |
| 20b | 1 | JSON Objeto − Estricto | −0.0068 | −0.0787 | \+0.0573 |
| 20b | 2 | Texto − JSON Objeto | \+0.0454 | −0.0360 | \+0.1236 |
| 20b | 2 | Texto − JSON Estricto | \+0.0388 | −0.0306 | \+0.1201 |
| 20b | 2 | JSON Objeto − Estricto | −0.0066 | −0.1008 | \+0.1000 |

Al no encontrar diferencias estadísticamente significativas en ninguna de las comparaciones, fallamos en rechazar la hipótesis nula. Esto sugiere que, para esta tarea de extracción, la imposición de un formato estricto no degrada ni mejora de manera consistente la calidad general de la extracción.

***D. Discusión y Limitaciones***  
El resultado nulo obtenido sugiere que, en esta tarea, la conveniencia de parseo que ofrece la decodificación restringida no se paga con una pérdida detectable de calidad. Conviene subrayar que se trata de una ausencia de evidencia y no de evidencia de equivalencia: con 30 historias, los intervalos obtenidos admiten diferencias de hasta ±0.12 de F1, de modo que solo quedan descartados los efectos grandes. Por último, el hecho de que las tres condiciones alcanzaran el 100 % de salidas válidas implica que este experimento no logró exhibir el costo de formato que motivó la pregunta: la hipótesis sobre salidas inválidas quedó sin poder ponerse a prueba.

Es importante interpretar estos resultados bajo ciertas limitaciones. Primero, el tamaño de muestra (30 historias) solo permite descartar tamaños de efecto grandes. Segundo, los modelos utilizados integran pasos de razonamiento interno antes de emitir su respuesta, lo que podría actuar como un "amortiguador" cognitivo que mitiga la carga de generar formatos estrictos. Adicionalmente, se debe considerar una posible contaminación de los datos: es altamente probable que el corpus de ROCStories forme parte de los datos de preentrenamiento de estos modelos, lo cual podría inflar el rendimiento base de extracción de manera independiente al formato evaluado. Finalmente, la creación del gold standard dependió de un único anotador.

Por transparencia, se declaran dos desviaciones del protocolo. Primero, después de una primera puntuación, una revisión estructural del gold, hecha sin consultar las predicciones, detectó que una historia de test estaba anotada de forma incompleta: tenía 3 filas en lugar de 19 y una cadena next que apuntaba a un evento inexistente. Se completó su anotación y se volvió a puntuar todo; los resultados reportados corresponden al gold corregido. Segundo, en la corrida 1 del gpt-oss-20b con texto, 15 de las 30 historias se procesaron con la versión del prompt anterior al congelamiento. Se conservó esa corrida porque, en ese subconjunto, la diferencia de F1 entre corridas (−0.010) es menor que la observada en las 15 historias procesadas con el prompt congelado en ambas (−0.045): el ruido entre corridas domina cualquier efecto de la versión del prompt. Por la misma razón, el costo en tokens de texto se reporta con las celdas que usaron solo el prompt congelado.

## **VI. Conclusiones \- Diego**

Este estudio investigó si el formato de salida exigido a un LLM (texto libre, JSON estándar o JSON con decodificación restringida) afecta la calidad en la extracción de grafos de conocimiento narrativos. Nuestros experimentos, controlando el prompt y variando únicamente las instrucciones de formato, no encontraron diferencias estadísticamente distinguibles en el F1 de la extracción entre las distintas condiciones, en ninguno de los dos modelos evaluados. Con 30 historias, este resultado nulo es ausencia de evidencia y no evidencia de equivalencia. El tamaño del modelo, en cambio, sí produjo un efecto claro: el gpt-oss-120b superó al gpt-oss-20b en F1 (0.741–0.779 frente a 0.654–0.680) y fue considerablemente más estable entre corridas (Jaccard 0.75–0.77 frente a 0.55–0.61).

Adicionalmente, contrario a lo esperado, la validación estricta de esquemas no fue necesaria para garantizar la validez sintáctica de las salidas; el texto libre logró un 100% de parseo exitoso, y la decodificación restringida encareció el prompt un 37 % (1102 frente a 806 tokens) sin ganancia detectable en calidad. Concluimos que, para tareas de extracción con esquemas bien definidos y modelos con capacidades de razonamiento implícito, forzar la salida estructurada no mostró comprometer el desempeño analítico, aunque el tamaño de la muestra solo permite descartar efectos grandes.

El trabajo futuro deberá explorar si este comportamiento se mantiene al utilizar esquemas más complejos (ej. relaciones jerárquicas o atributos anidados) o en modelos que no integran cadenas de pensamiento previas a la generación de la respuesta.

## **VII. Trabajo Futuro** 

Este trabajo comparó tres formatos de salida (texto, JSON objeto y JSON estricto) en dos modelos de la familia GPT-OSS, sobre un conjunto reducido de historias, lo que deja abiertas varias líneas de continuación. La primera es incorporar la resolución de correferencias antes de la extracción, variable que se había considerado en el diseño original pero que se dejó fuera por restricciones de tiempo, y que podría mejorar la exactitud de las tripletas en historias con varios personajes. También sería valioso ampliar el experimento a otras familias de modelos y a un conjunto de pruebas más grande que el actual (30 historias), para dar mayor solidez a las conclusiones sobre qué formato de salida resulta preferible. De forma complementaria, una evaluación con jueces humanos ciegos a la condición permitiría confirmar si las diferencias medidas automáticamente corresponden también a diferencias reales de calidad percibida. Finalmente, queda pendiente explorar el comportamiento de las tres condiciones con temperaturas más bajas y sobre géneros de texto distintos al narrativo, para verificar si las conclusiones de este trabajo se sostienen fuera del contexto evaluado aquí.

## **Referencias**

\[1\] T. Yoo y Y.-G. Cheong, "Leveraging LLM-Constructed Graphs for Effective Goal-Driven Storytelling," en *Proceedings of the Large Knowledge-Enhanced Models Workshop (LKM@IJCAI 2024\)*, CEUR Workshop Proceedings, vol. 3818, 2024\. 

\[2\] C. Li, L. Cui, Y. Xu y N. Liu, "Logic Event Graph Enhanced Narrative Generation," en *Proceedings of the 2023 26th International Conference on Computer Supported Cooperative Work in Design (CSCWD)*, Río de Janeiro, Brasil, 2023, págs. 181–186, doi: 10.1109/CSCWD57460.2023.10152623. 

\[3\]  S. Choi y Y. Jung, "Knowledge Graph Construction: Extraction, Learning, and Evaluation," *Applied Sciences*, vol. 15, nº. 7, art. 3727, 2025, doi: 10.3390/app15073727. 

\[4\] S. B. A. B. Lamine, R. Bouhamoum y H. Baazaoui, "A Hybrid Dynamic Knowledge Graph Building Approach," en *Proceedings of the Early Research Achievement and Demo Tracks (CoopIS-ERA)*, vol. 4203, 2026, págs. 33–40.\* 

\[5\]  H. Hao, G. Si, L. Lu, Q. Liu y F. Zhou, "From data fusion to dynamic reasoning: A survey on spatio-temporal knowledge graph construction and embedding methods," *Neurocomputing*, vol. 658, art. 131590, 2025, doi: 10.1016/j.neucom.2025.131590 

\[6\] H. Huang, G. Zhong, Y. Zheng y J. Peng, "Research on the Narrative Knowledge Graph Design for Museum Artifacts," en *Proceedings of the 2024 International Conference on Computer Science and Artificial Intelligence*, Wuhan, China, 2024, doi: 10.1109/CSAI.2024.1160715 

\[7\] W. Cheng y Y. Liu, "Cross-cultural interactive generation with a multimodal knowledge graph for shadow play narratives," *Results in Engineering*, vol. 31, art. 111325, 2026, doi: 10.1016/j.rineng.2026.111325. 

\[8\]  Y. Yang, "AI-Driven Cross-Media Narrative Design for Intangible Cultural Heritage: A Knowledge-Graph-Based Educational Framework," en *Proceedings of the 2025 6th International Conference on Computer Science and Management Technology (ICCSMT)*, Dalian, China, 2026, págs. 1538–1544, doi: 10.1145/3795154.3795401. 

\[9\] S. Zhao, "Construction of Cultural Narrative Knowledge Graph for Ideological and Political Education Classrooms," en *Proceedings of the 2026 International Conference on Intelligent Education and Information Technology*, Wuhan, China, 2026, págs. 142–148, doi: 10.1145/3806980.3806999. 

\[10\] L. Yang y J. Yang, "Research on Narrative Structure Generation and Human-Computer Collaborative Optimization of Animated Comics Based on Knowledge Graph," en *Proceedings of the 2026 International Conference on Intelligent Systems and Computer Engineering*, Wuhan, China, 2026, doi: 10.1109/ISCE.2026.11607339. 

\[11\] F. Orciuoli, A. Pascuzzo y S. Senatore, "Integrating LLMs and the PrOntoNarr Ontology for Automated KG Construction in Multi-level Propaganda Narrative Analysis", en *LLM-Integrated Knowledge Graph Generation From Text (TEXT2KG) and International BiKE Challenge 2026*, CEUR Workshop Proceedings, vol. 4233, 2026, pp. 114–127 

\[12\] W. Sanyaolu y D. P. Josyula, "LLM-Augmented Semantic Integration: Scalable Knowledge Graph Construction from Unstructured Safety-Critical Narratives," en ***Proceedings of the 2026 International Conference on Semantic Computing (ICSC)***, Laguna Hills, CA, USA, 2026, págs. 397–402. 

\[13\] L. Afzal *et al.*, "NLP-Driven Knowledge Graph Construction From Informal Text Using Large Language Models," en *IEEE Access*, vol. 14, págs. 54483–54497, 2026, doi: 10.1109/ACCESS.2026.3680004. 

\[14\] D. Meher, C. Domeniconi y G. Correa-Cabrera, "LINK-KG: LLM-Driven Coreference-Resolved Knowledge Graphs for Human Smuggling Networks", en *2025 IEEE International Conference on Knowledge Graph (ICKG)*, 2025, pp. 277–284.

\[15\] F. Plötzky y W.-T. Balke, "It's the Same Old Story\! Enriching Event-Centric Knowledge Graphs by Narrative Aspects," en *Proceedings of the 14th ACM Web Science Conference 2022 (WebSci '22)*, Barcelona, España, 2022, págs. 397–402, doi: 10.1145/3501247.3531565.

\[16\]  Z. Yan y X. Tang, "Narrative Graph: Telling Evolving Stories Based on Event-centric Temporal Knowledge Graph," *Journal of Systems Science and Systems Engineering*, vol. 32, nº. 2, págs. 206–221, 2023, doi: 10.1007/s11518-023-5561-0. 

\[17\] M. Qi *et al.*, "Latent Memory-Augmented Graph Transformer for Visual Storytelling," en *Proceedings of the 29th ACM International Conference on Multimedia (MM '21)*, Virtual Event, China, 2021, págs. 397–405, doi: 10.1145/3474085.3475236.

\[18\] X. Zhang y H. Zhao, "Research on Visual Story Generation Algorithm Based on Fine-Grained Visual Features and Knowledge Graphs," en *Proceedings of the 2024 2nd International Conference on Mechatronics, IoT and Industrial Informatics (ICMIII)*, Melbourne, Australia, 2024, doi: 10.1109/ICMIII62623.2024.00055 

\[19\] Y. Zhu y R. Pan, "Simple Contrastive Learning with Knowledge Graphs for Story Generation," en *Proceedings of the 2025 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*, Hyderabad, India, 2025, doi: 10.1109/ICASSP49660.2025.10889400. 

\[20\] H. Akremi, T. Slimi, S. Zghal y A. Ben Khalifa, "Graph Matching via Multidimensional Embeddings: A Novel Approach for Complex Ontology Alignment," en *Proceedings of the 2025 11th International Conference on Control, Decision and Information Technologies (CoDIT)*, Split, Croacia, 2025, vol. 1, págs. 1–6, doi: 10.1109/CoDIT66093.2025.11321869.  

\[21\] Z. R. Tam, C.-K. Wu, Y.-L. Tsai, C.-Y. Lin, H.-y. Lee y Y.-N. Chen, "Let Me Speak Freely? A Study On The Impact Of Format Restrictions On Large Language Model Performance," en *Proceedings of the 2024 Conference on Empirical Methods in Natural Language Processing: Industry Track*, Miami, FL, USA, 2024, págs. 1218–1236, doi: 10.18653/v1/2024.emnlp-industry.91.

\[22\] H. Fan, "Capacity, Not Format: Rethinking Structured Reasoning Failures," arXiv:2606.09410, 2026.

\[23\] N. Mostafazadeh, N. Chambers, X. He, D. Parikh, D. Batra, L. Vanderwende, P. Kohli y J. Allen, "A Corpus and Cloze Evaluation for Deeper Understanding of Commonsense Stories," en *Proceedings of the 2016 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies (NAACL-HLT)*, San Diego, CA, USA, 2016, págs. 839–849, doi: 10.18653/v1/N16-1098.


