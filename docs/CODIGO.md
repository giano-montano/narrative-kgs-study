# Cómo funciona el código

> Guía de lectura del pipeline. Las decisiones viven en `PROYECTO.md`; esto solo explica cómo están implementadas.

## El flujo completo

```
data/stories.csv  ──run.py──>  runs/<modelo>/<condicion>/<corrida>/<story_id>.txt  ──score.py──>  results/metrics.csv
                       │                    + runs/log.csv                              ▲
                       │                                                                │
                  API de Groq                                              data/gold.csv
```

La idea central es que **llamar al modelo y puntuar son dos programas separados**, y la respuesta cruda en disco es la frontera entre ellos. Eso es lo que hace posible la regla 7.1: si mañana descubrimos un error de parseo, se corrige `score.py` y se vuelve a puntuar sin gastar ni una llamada. Las llamadas cuestan cuota y no son reproducibles (temperatura 1.0); el parseo es gratis y determinista.

## `schema.py`: un solo archivo, dos usos

Son 15 líneas, pero sostienen las dos mitades del pipeline:

1. **En `score.py`** valida lo que el modelo respondió.
2. **En `run.py`** es la fuente del esquema que se le manda a Groq en `json_estricto`, vía `Graph.model_json_schema()`.

Que sean el mismo objeto importa: es imposible que el esquema que exigimos y el que validamos se desincronicen.

`extra="forbid"` no es decoración. Groq exige que en modo `strict` todo objeto lleve `additionalProperties: false`, y Pydantic lo genera solo si el modelo prohíbe campos extra. Los `Literal` hacen lo propio con los `enum` de `rel` y `arg_type`.

## `run.py`: lo único que cambia entre condiciones

El experimento vale solo si las tres condiciones difieren **exclusivamente** en el formato. En el código eso son dos funciones cortas:

- `system_prompt(condition)` = `instructions.txt` + `"\n\n"` + el bloque de formato. Las instrucciones son el mismo archivo en las tres; `json_objeto` y `json_estricto` comparten `format_json.txt`, así que su prompt es idéntico byte a byte.
- `response_format(condition)` = nada / `{"type": "json_object"}` / `json_schema` con `strict: true`.

Todo lo demás es constante: `TEMPERATURE = 1.0`, `REASONING_EFFORT = "low"`, una llamada por historia.

### Guardar solo la respuesta, no el razonamiento

gpt-oss razona antes de responder. En Groq ese razonamiento llega en `message.reasoning`, aparte de `message.content`; además se pide `include_reasoning=False`. Se guarda solo `content`, igual en las tres condiciones, porque si una condición guardara razonamiento y otra no, estaríamos puntuando texto distinto.

Ojo con la factura: `completion_tokens` **sí** incluye el razonamiento. En la prueba de humo, una respuesta de 19 tripletas costó entre 417 y 533 tokens de completion. Por eso el log guarda lo que reporta la API, no lo que ocupa el archivo.

### Dos protecciones contra perder trabajo

1. Si el archivo crudo ya existe, la historia se salta sin llamar (regla 7.1).
2. El archivo se abre en modo `"x"`, que falla si el archivo existe. Es un cinturón además de los tirantes: ninguna ruta del código puede sobrescribir una respuesta.

### Errores

- **429:** se lee la cabecera `retry-after`, se espera ese tiempo y se reintenta, hasta 3 veces. El SDK se crea con `max_retries=0` para que reintentar sea decisión nuestra y quede visible.
- **Cualquier otro error:** se escribe en la columna `error` de `log.csv` y se sigue con la siguiente historia. Una historia caída no tumba una corrida de 35.

En ambos casos se agrega exactamente una fila a `log.csv` por historia procesada, con éxito o sin él.

## `score.py`: de texto a números

### 1. Parsear

Según la condición: regex línea por línea, o `json.loads` + `Graph.model_validate`.

**Regla A (validez de todo o nada).** Una salida vale entera o no vale. En JSON esto es lo que ya hace Pydantic: una sola tripleta mala invalida el grafo. En texto se aplica el mismo criterio: si una sola línea no vacía no calza con el regex, la salida entera cuenta como grafo vacío. Se eligió así para no darle al texto una reparación parcial que el JSON no tiene, lo que lo favorecería. El costo asumido: una línea de cortesía como `Here are the triples:` manda esa historia a F1 = 0.

Una salida inválida **no se descarta**: cuenta como conjunto vacío, así que arrastra el recall hacia abajo. Si se descartara, un modelo que solo responde cuando está seguro saldría campeón.

### 2. Normalizar

`key()` implementa la sección 5 y es la única definición de "acierto" en el código:

```
"Picked up" , "agent" , "the ice cream."   ->   ("s01", "picked", "agent", "cream")
                                                          │                   └── última palabra del argumento
                                                          └── primera palabra del evento
```

Minúsculas, sin puntuación, primera palabra del evento, última del argumento. Se aplica igual al gold y a la predicción: si solo se normalizara un lado, toda comparación fallaría.

`arg_type` queda fuera de la clave a propósito (sección 5): acertar la relación y acertar el tipo se miden por separado.

### 3. Comparar

Gold y predicción son **conjuntos** de esas claves, así que las tripletas repetidas colapsan y el orden no importa. Con eso:

```
tp = |pred ∩ gold|        precisión = tp / |pred|        recall = tp / |gold|
```

Las métricas son **micro**: se suman los aciertos de todas las historias y se divide una vez. Una historia larga pesa más que una corta, que es lo que queremos al medir tripletas.

Se escribe una fila por modelo × condición × corrida × grupo, donde los grupos son `all_no_next` (la métrica principal, que excluye `next`) y una por relación. Van también `tp`, `n_pred` y `n_gold` para poder revisar a mano de dónde salió cada número.

## Cómo correrlo

```bash
# una condición, una corrida
python run.py --model openai/gpt-oss-20b --condition texto --run 1 --stories data/stories_example.csv

# puntuar todo lo que haya en runs/
python score.py --gold data/gold_example.csv
```

`run.py` lee la key de `GROQ_API_KEY`. `score.py` no necesita key: recorre `runs/` entero y puntúa lo que encuentre.

## Detalles que confunden si no se avisan

- **La `/` del modelo se reemplaza por `_` en las rutas:** `openai/gpt-oss-20b` → `runs/openai_gpt-oss-20b/`. En `log.csv` se guarda el nombre real.
- **`json_estricto` cuesta más prompt:** en la prueba de humo, 835 tokens contra 701 de `json_objeto` con el mismo texto. Groq inyecta el esquema en el prompt.
- **El bloque de formato JSON es más largo que el de texto**, así que los prompts de las tres condiciones nunca cuestan lo mismo.
- **Nada dentro de `runs/` se borra ni se sobrescribe.** Para volver a correr una historia hay que moverla fuera a mano, y eso es deliberado.
