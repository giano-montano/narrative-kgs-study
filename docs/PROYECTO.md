# Preprint: efecto del formato de salida en la extracción de KGs narrativos con LLMs

> Fuente de verdad del proyecto. Si una decisión cambia, se cambia primero aquí.
> Estado al 29 sep 2026: experimento cerrado; resultados finales en `results/` (gold de `ad7e9d8`). Falta el paper.

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

1. **Evento:** todo verbo que exprese una acción o suceso. No cuentan _be_, los auxiliares _have/do_ ni los modales (_can, could, will, would, should, may, might, must_). "decided to buy" son dos eventos: `decided` y `buy`. En un phrasal verb solo cuenta el verbo ("picked up" → `picked`). Los verbos que actúan como complementos o nombres secundarios (ej. "wearing", "drowning") se pueden omitir.
2. **Argumento:** el nombre propio si existe; si no, el último sustantivo, sin artículos ni posesivos ("her dog" → `dog`, "ice cream" → `cream`).
3. **Pronombres:** se reemplazan por el nombre o núcleo al que refieren ("She" → `Maria`). El narrador es `I`.
4. **`next`:** encadena todos los eventos en el orden del texto.
5. **Solo lo explícito:** no se infiere nada.
6. **Coordinación:** si un evento tiene dos argumentos unidos por "and" u "or" en la misma relación, se escribe una fila por cada uno ("the windshield and body" → `windshield` y `body`).
7. **Pronombres plurales:** si un pronombre plural refiere a varias entidades, se escribe una fila por cada una ("they" = Joana y su madre → `Joana` y `mother`).
8. **Agente:** se anota solo si es el sujeto gramatical de ese verbo, o el sujeto explícito del verbo principal del que depende ("Joana decided to sell" → `sell` tiene agente `Joana`). Si para saber quién hace la acción hay que deducirlo de otra parte ("bought a blanket to keep her warm"), ese evento no lleva `agent`.
9. **Un nombre por entidad:** si el texto nombra a la misma entidad con palabras distintas ("grandparent", "grandpa"), se usa siempre la primera que aparece en el texto.
10. **Tipos de argumento:** el tipo de argumento describe la naturaleza del elemento y no la relación (ej. "side" como location es de tipo `Object`).

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
AGENTS.md              importa este documento + convenciones de código y handoffs
data/stories.csv       story_id, split, s1..s5                  (Diego)
data/gold.csv          story_id, event, rel, arg, arg_type      (Diego)
prompts/instructions.txt   reglas de la sección 4, en inglés
prompts/format_text.txt    bloque de formato de `texto`
prompts/format_json.txt    bloque de formato de ambas condiciones JSON
schema.py              modelos Pydantic Triple y Graph
run.py                 llama al modelo y guarda la respuesta cruda
score.py               parsea, normaliza, compara y calcula métricas
runs/<modelo>/<condicion>/<corrida>/<story_id>.txt   respuesta cruda
runs/log.csv           timestamp, model, condition, run (dev1-3, 1-2), story_id,
                       prompt_tokens, completion_tokens, latency_s, error
results/metrics.csv    precisión, recall, F1, tokens, % tipos, % válidas
results/stability.csv  estabilidad Jaccard entre corridas 1 y 2
results/bootstrap.csv  IC 95 % por bootstrap pareado
handoffs/              mensajes de coordinación entre el equipo
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

| Quién | Entregable                                                  | Fecha          |
| ----- | ----------------------------------------------------------- | -------------- |
| Diego | `stories.csv` + gold de dev (5 historias)                   | sáb 19 (hecho) |
| Giano | Pipeline de punta a punta con una historia inventada        | sáb 19 (hecho) |
| Diego | Reglas nuevas en sección 4 y prompt; gold de dev corregido  | mar 22         |
| Leo   | CLI de reparto + métricas faltantes de la sección 5         | mar 22 – mié 23 |
| Leo   | Corrida de dev y prompts congelados                         | mié 23         |
| Diego | Gold de test (30 historias), congelado                      | mié 23         |
| Leo   | Corridas de test, filas 0–14                                | mié 23         |
| Diego | Corridas de test, filas 15–29 (después de congelar el gold) | jue 24         |
| Diego | Scoring final, tablas y gráficas                            | jue 24         |
| Leo   | Paper: IV. Desarrollo y Ejecución; VII. Trabajo Futuro      | vie 25         |
| Diego | Paper: V. Resultados y Discusión; VI. Conclusiones          | vie 25         |

Meta: todo el desarrollo termina el **jue 24**. Giano orquesta con handoffs y no decide ni implementa. Cada persona decide sobre su área (ver `AGENTS.md`).

Entregas entre personas, todas con un handoff en `handoffs/`:

1. Reglas nuevas y gold de dev corregido: Diego → Leo.
2. Prompts congelados: Leo → Diego.
3. Gold de test congelado: Diego → Leo.
4. Métricas implementadas y filas 0–14 de test: Leo → Diego.

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
- Las tres condiciones dieron 100 % de salidas válidas en ambos modelos y corridas, así que la hipótesis sobre salidas inválidas no se pudo poner a prueba.
- En `20b/texto/1`, 15 de las 30 historias de test se corrieron con el prompt anterior a `prompts-frozen` (viola 7.2). Leo decidió conservar la celda: en ese subconjunto la diferencia entre corridas es −0.010, menor que la del subconjunto con prompt congelado en ambas (−0.045). El costo en tokens de `texto` se reporta con las celdas limpias (806), no con esta (679).
- El gold de test se completó después de puntuar: `62f34c7e` pasó de 3 a 19 filas en `ad7e9d8`, marcada por la auditoría por motivos estructurales (un `next` colgado y muchas menos filas que el resto), sin mirar predicciones. Se volvió a puntuar. El tag `gold-test-frozen` marca el gold anterior (505 filas); el definitivo es `ad7e9d8` (521 filas).

## 12. Pendientes por verificar

- ~~Que `json_estricto` realmente restrinja en gpt-oss en Groq~~ **Verificado:** 0 salidas inválidas en los 390 archivos con gold, reparseados de forma independiente. Las otras dos condiciones también dieron 100 %.
- ~~Que la respuesta guardada contenga solo el contenido final~~ **Verificado:** los 390 archivos parsean completos bajo la regla de todo o nada, así que ninguno trae texto de razonamiento.
- ~~Tokens reales por llamada~~ **Medido:** prompt 806 / 968 / 1102 (`texto` / `json_objeto` / `json_estricto`); total por llamada entre ≈1200 y ≈1920, bajo el umbral de 2 500 de la regla 7.5.
- Si el caché de prompts aplica a gpt-oss.
- Condiciones de uso de ROCStories. **Revisado el 29 sep** en <https://cs.rochester.edu/nlp/rocstories/>: el acceso es gratuito y exige llenar un formulario; ni la página ni el correo de acceso publican una licencia o dicen algo sobre redistribuir los textos (el CC BY 4.0 que circula viene de una réplica de terceros en Hugging Face, no de los autores). Como no hay permiso explícito, se mantiene la regla 7.6: al publicar se comparten IDs y anotaciones, no `data/stories.csv` ni los textos. Cita que pide el correo: Mostafazadeh, Chambers, He, Parikh, Batra, Vanderwende, Kohli y Allen (2016). *A Corpus and Cloze Evaluation for Deeper Understanding of Commonsense Stories*. NAACL-HLT. (En arXiv:1604.01696 figura con otro título.) Contacto para dudas: me@nasrin.info.

## 13. Referencias clave

- Mostafazadeh et al. (2016). ROCStories. NAACL.
- Mostafazadeh et al. (2016). CaTeRS. Workshop on Events, NAACL.
- Mihindukulasooriya et al. (2023). Text2KGBench. ISWC.
- Zhang & Soh (2024). Extract, Define, Canonicalize (EDC). EMNLP.
- Mo et al. (2025). KGGen. NeurIPS.
- Tam et al. (2024). Let Me Speak Freely? EMNLP Industry.
- Fan (2026). Capacity, Not Format. arXiv, sin revisión de pares.
