# Preprint: efecto del formato de salida en la extracción de KGs narrativos con LLMs

> Fuente de verdad del proyecto. Si una decisión cambia, se cambia primero aquí.
> Estado al 17 sep 2026: diseño cerrado, implementación por empezar.

## 1. Qué es

Preprint corto de investigación estudiantil en el marco de IEEE CS PUCP. El valor buscado es que sea reproducible y honesto. Código en inglés

Equipo: Giano (implementación solo por ahora), Diego (corpus y gold por ahora), Leo (redacción: introducción, objetivos, estado del arte por ahora).

## 2. Pregunta de investigación

¿Cambia la calidad de un KG narrativo extraído por un LLM según cómo se le exige escribir la salida (texto libre, JSON sin garantía de esquema, JSON con decodificación restringida)? ¿Depende ese efecto del tamaño del modelo?

Por qué importa: la salida estructurada es el default al construir KGs con LLMs, pero los estudios sobre su costo miden sobre todo matemática y lógica, no extracción.

Qué se espera (hipótesis, no resultados):

- Modelo grande: poca o ninguna diferencia entre condiciones.
- Modelo chico: si hay efecto, aparece aquí; la dirección no está garantizada.
- `json_estricto`: 0 % de salidas inválidas por construcción; las otras dos condiciones, algunas.
- Un resultado nulo con intervalos de confianza es un resultado válido y se reporta.

Fuera de alcance: generación de historias, causalidad, proponer un método nuevo.

## 3. Diseño experimental

| Factor            | Niveles                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Formato de salida | `texto`, `json_objeto`, `json_estricto`                           |
| Modelo            | `openai/gpt-oss-20b`, `openai/gpt-oss-120b` (Groq, plan gratuito) |

Constantes: el texto de instrucciones es idéntico en las tres condiciones y solo cambia el bloque de formato; `json_objeto` y `json_estricto` comparten el mismo bloque. `reasoning_effort="low"`, temperatura fija, una llamada por historia.

| Condición       | Bloque de formato                                            | `response_format`                |
| --------------- | ------------------------------------------------------------ | -------------------------------- |
| `texto`         | Una tripleta por línea: `lost \| agent \| Maria [Character]` | ninguno                          |
| `json_objeto`   | JSON `{"triples": [...]}`                                    | `{"type": "json_object"}`        |
| `json_estricto` | Idéntico a `json_objeto`                                     | `json_schema` con `strict: true` |

Corpus: ROCStories (historias de 5 oraciones), obtenido por el formulario oficial. Se muestrean 35 historias con `random_state=42`: 5 de dev y 30 de test.

Corridas: en dev, 1 corrida y un máximo de 3 iteraciones de prompt; en test, 2 corridas. Total aproximado: 225 llamadas por modelo.

## 4. Esquema (constante del experimento)

Cada fila del gold y de la salida del modelo es una tripleta `(event, rel, arg, arg_type)`.

| Campo      | Valores                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`    | Una palabra: el verbo tal como aparece en el texto (`lost`, no `lose`)                                                                          |
| `rel`      | `agent` (quién hace), `patient` (a quién o qué afecta directamente), `location` (dónde ocurre), `next` (evento siguiente en el orden del texto) |
| `arg`      | Una palabra: nombre propio o sustantivo núcleo; para `next`, otro evento                                                                        |
| `arg_type` | `Character` (personas y animales), `Object`, `Location`, `Event` (solo con `next`)                                                              |

Reglas de anotación, que son también el contenido del prompt:

1. **Evento:** todo verbo que exprese una acción o suceso. No cuentan _be_, los auxiliares _have/do_ ni los modales (_can, could, will, would, should, may, might, must_). "decided to buy" son dos eventos: `decided` y `buy`. En un phrasal verb solo cuenta el verbo ("picked up" → `picked`).
2. **Argumento:** el nombre propio si existe; si no, el último sustantivo, sin artículos ni posesivos ("her dog" → `dog`, "ice cream" → `cream`).
3. **Pronombres:** se reemplazan por el nombre o núcleo al que refieren ("She" → `Maria`). El narrador es `I`.
4. **`next`:** encadena todos los eventos en el orden del texto.
5. **Solo lo explícito:** no se infiere nada.

Ejemplo: _"Maria lost her dog in the park. She searched every bench."_

```
lost, agent, Maria, Character
lost, patient, dog, Character
lost, location, park, Location
lost, next, searched, Event
searched, agent, Maria, Character
searched, patient, bench, Object
```

Por qué este esquema:

- Las relaciones son cerradas, así que la comparación es exacta.
- Los eventos como nodos permiten representar el orden y el lugar.
- Las etiquetas de una palabra evitan la coincidencia difusa.

## 5. Evaluación

- **Normalización:** minúsculas y sin puntuación. Si `event` trae varias palabras, se toma la primera; si `arg` trae varias, la última.
- **Acierto:** `(story_id, event, rel, arg)` coincide exactamente con el gold. `arg_type` no entra en la clave.
- **Salida inválida** (no parsea o no valida): cuenta como grafo vacío. La validez es de la salida completa y se juzga igual en las tres condiciones: si una sola tripleta o línea falla, toda la salida cuenta como vacía. En texto eso significa que basta una línea que no calce con el formato.

Métricas por modelo × condición:

- Precisión, recall y F1. La métrica principal excluye `next`; también se reporta por relación.
- Porcentaje de salidas válidas.
- Porcentaje de tipos correctos entre los aciertos.
- Tokens promedio por llamada.
- Estabilidad: Jaccard entre la corrida 1 y la 2.
- Diferencia de F1 por historia entre condiciones, con IC 95 % por bootstrap pareado (1000 remuestreos de historias).

## 6. Repositorio

```
docs/PROYECTO.md       este documento
CLAUDE.md              importa este documento + convenciones de código
data/stories.csv       story_id, split, s1..s5                  (Diego)
data/gold.csv          story_id, event, rel, arg, arg_type      (Diego)
prompts/instructions.txt   reglas de la sección 4, en inglés
prompts/format_text.txt    bloque de formato de `texto`
prompts/format_json.txt    bloque de formato de ambas condiciones JSON
schema.py              modelos Pydantic Triple y Graph
run.py                 llama al modelo y guarda la respuesta cruda
score.py               parsea, normaliza, compara y calcula métricas
runs/<modelo>/<condicion>/<corrida>/<story_id>.txt   respuesta cruda
runs/log.csv           timestamp, model, condition, run, story_id,
                       prompt_tokens, completion_tokens, latency_s, error
results/metrics.csv
```

Dependencias: `groq`, `pydantic`, `pandas`, `numpy`. No se agrega ninguna otra sin discutirlo. La API key se lee de la variable de entorno `GROQ_API_KEY`.

## 7. Reglas de trabajo

1. Nunca volver a llamar al LLM si ya existe la respuesta cruda. Los errores de parseo se arreglan re-parseando offline.
2. Los prompts se iteran solo con dev y se congelan con un commit antes de correr test.
3. El gold de test se anota sin ver salidas del modelo y se congela con un commit antes de puntuar.
4. Toda respuesta cruda y su metadata se versionan.
5. Si el promedio de tokens por llamada pasa de 2 500, el test baja a 1 corrida.
6. El repo es privado hasta verificar las condiciones de uso de ROCStories. Al publicar, se comparten IDs y anotaciones, no los textos.

## 8. Límites de la API

Plan gratuito de Groq, por modelo (verificar en la consola): 30 solicitudes/min, 1 000 solicitudes/día, 8 000 tokens/min, 200 000 tokens/día. Los tokens en caché no cuentan para los límites.

## 9. Reparto y entregas

| Quién | Entregable                                           | Fecha           |
| ----- | ---------------------------------------------------- | --------------- |
| Diego | `stories.csv` + gold de dev (5 historias)            | sáb 19          |
| Diego | Gold de test (30 historias), congelado               | mié 23          |
| Diego | Sección de datos del paper                           | vie 25          |
| Leo   | Pregunta, objetivos, hipótesis e introducción        | dom 20          |
| Leo   | Estado del arte + plantilla TechRxiv                 | mié 23          |
| Leo   | Discusión, conclusiones y ensamblado final           | dom 27          |
| Giano | Pipeline de punta a punta con una historia inventada | sáb 19          |
| Giano | Prompts congelados con dev                           | lun 21          |
| Giano | Corridas de test (no dependen del gold)              | lun 21 – mar 22 |
| Giano | Scoring y tabla de resultados                        | mié 23 – jue 24 |
| Giano | Secciones de método y resultados                     | sáb 26          |

Únicas entregas entre personas:

1. `stories.csv` y gold de dev: Diego → Giano.
2. Gold de test congelado: Diego → Giano.
3. Tabla de resultados: Giano → Leo.

## 10. Decisiones descartadas (no reintroducir)

- **Comparar extracción libre vs guiada por esquema usando un gold en el esquema de la guiada:** es circular.
- **Relación `causes`:** es subjetiva y tiene acuerdo moderado incluso entre expertos.
- **PydanticAI:** inyecta texto propio en el prompt y usa tool-calling por defecto, lo que mezcla las condiciones.
- **Neo4j:** no aporta a las métricas.
- **Coincidencia difusa con umbrales, bandas y adjudicación:** reemplazada por etiquetas de una palabra y coincidencia exacta.
- **Modelos de pago.**

## 11. Limitaciones conocidas (para el paper)

- Gold de un solo anotador, sin medición de acuerdo entre anotadores.
- No hay relaciones entidad-entidad (posesión, parentesco) ni modificadores.
- `next` casi siempre coincide con el orden textual; por eso se excluye de la métrica principal.
- Con 30 historias solo se detectan diferencias grandes.
- Posible contaminación: ROCStories probablemente está en el preentrenamiento.
- gpt-oss razona antes de responder, lo que puede atenuar el efecto del formato.

## 12. Pendientes por verificar

- Que `json_estricto` realmente restrinja en gpt-oss en Groq (hubo un reporte de regresión en 2025). Se comprueba con 100 % de salidas válidas en dev.
- Que la respuesta guardada contenga solo el contenido final y no el razonamiento del modelo.
- Tokens reales por llamada.
- Si el caché de prompts aplica a gpt-oss.
- Condiciones de uso de ROCStories.

## 13. Referencias clave

- Mostafazadeh et al. (2016). ROCStories. NAACL.
- Mostafazadeh et al. (2016). CaTeRS. Workshop on Events, NAACL.
- Mihindukulasooriya et al. (2023). Text2KGBench. ISWC.
- Zhang & Soh (2024). Extract, Define, Canonicalize (EDC). EMNLP.
- Mo et al. (2025). KGGen. NeurIPS.
- Tam et al. (2024). Let Me Speak Freely? EMNLP Industry.
- Fan (2026). Capacity, Not Format. arXiv, sin revisión de pares.
