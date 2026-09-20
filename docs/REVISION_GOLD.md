# Revisión del gold de dev

> Archivos revisados: `golden/stories.csv` (35 historias) y `golden/gold (1).csv` (94 filas, 5 historias).
> Revisión del 19 sep 2026, contra el texto.

## Veredicto

La entrega está **completa y es usable**. El gold cubre exactamente las 5 historias de dev, todo valida contra el esquema, y todas las anotaciones que revisé contra el texto son correctas o defendibles. No hay que rehacer nada.

Quedan un error menor de tipo, dos eventos que faltan y cuatro convenciones que conviene fijar por escrito **antes** de que Diego anote las 30 historias de test, porque son casos que se van a repetir.

## Lo que está verificado

**El corpus:**

- 35 historias, 5 dev y 30 test, sin nulos ni IDs duplicados. Coincide con el muestreo de la sección 3.
- Las columnas son las de la sección 6: `story_id, split, s1..s5`.
- Los `story_id` del gold son exactamente los 5 de dev. No hay ninguna fila de gold sobre test, que es lo correcto: el gold de test se anota después y sin ver salidas del modelo (regla 7.3).

**El gold:**

- 94 filas, sin nulos ni duplicados; las 94 validan contra `schema.py`.
- Ningún `event` ni `arg` trae espacios ni puntuación, y no hay dos filas que colapsen en la misma clave al normalizar.
- **Todos los `event` y todos los `arg` aparecen literalmente en el texto.** Nada está lematizado ni parafraseado.
- Las 5 cadenas `next` están impecables: un solo `next` por evento, ningún destino inexistente, un único evento final y todo evento con su fila `agent`.
- Los pronombres están bien resueltos en todos los casos que revisé: "He"→`Kyle`, "her"→`Carrie`, "him"→`grandparent`, "they"→`cops`, "it"→`shoes`.
- Los phrasal verbs están bien recortados: "bashed in"→`bashed`, "finished up"→`finished`, "pass on"→`pass`.
- *be*, *have* y los modales están correctamente excluidos: "was always cold", "had to dive" y "would get better" no generan eventos propios, pero sí lo hacen `dive` y `get`.

Corrijo una revisión anterior que hice sin el texto: había marcado `dive`, `lack` y `grandparent` como sospechosos de estar lematizados o inventados, y había supuesto que faltaba un evento `found` en la historia de Carrie. **Las cuatro sospechas eran falsas.** El texto dice "had to dive", "they lack out of money", "his grandparent" y nunca dice "found out". El error fue mío por revisar sin el corpus.

## Lo que hay que corregir

### 1. Un `arg_type` contradice su relación

```
d995bb60, stayed, location, side, Object
```

"Terry stayed by his side": `side` como `location` debería llevar tipo `Location`, no `Object`. Es la única fila del gold con `rel=location` y tipo distinto de `Location`. No afecta el F1 principal, porque `arg_type` no entra en la clave del acierto, pero sí la métrica de "porcentaje de tipos correctos" de la sección 5.

### 2. Faltan dos eventos

Ambos son verbos que expresan acción y ninguno es *be*, *have/do* ni modal, así que por la regla 1 entran:

| historia | texto | evento faltante |
|---|---|---|
| 862821f2 | "Joana loves buying shoes but **not wearing** it." | `wearing`, con `agent Joana` y `patient shoes` |
| c152ae65 | "to save him **from drowning**" | `drowning`, con `agent Kyle` |

`wearing` es el caso claro: es un verbo pleno, paralelo a `buying`, que sí está anotado. `drowning` es más discutible por ser complemento de "from", pero la regla 1 no distingue.

Importa porque el modelo probablemente los extraiga: cada evento que el gold omite pero el modelo sí produce baja la precisión. Y ojo: agregar un evento obliga a reencadenar el `next` de esa historia.

## Convenciones que hay que fijar antes del gold de test

Ninguna de estas es un error: son vacíos del documento que Diego resolvió de una forma razonable. El problema es que, si en test los resuelve de otra, el gold queda inconsistente consigo mismo.

**a) Argumentos coordinados.** "She continued on to the windshield and body" está anotado solo como `continued, patient, body`. La regla 2 dice "el último sustantivo", pero esa regla es para elegir el núcleo de un sintagma ("her dog"→`dog`), no para descartar uno de dos argumentos distintos. Hay que decidir si una coordinación genera dos filas o una. **Mi recomendación: dos filas**, porque el modelo casi seguro va a producir ambas.

**b) Agente implícito.** "bought a blanket **to keep** her warm" está anotado como `keep, agent, blanket`. El agente no está explícito en el texto, y la regla 5 dice no inferir. Hay que decidir si en construcciones de propósito se anota el agente implícito o se omite la fila.

**c) Pronombres plurales.** "they lack out of money" se anotó como `lack, agent, Joana`, pero "they" son Joana y su madre. Con argumentos de una sola palabra no hay forma de representar dos referentes. Hay que decidir: se elige el referente principal, se generan dos filas, o se omite.

**d) La misma persona con dos nombres.** En `d995bb60` el abuelo aparece como `grandparent` (s1, s3) y como `grandpa` (s4, s5). Las dos palabras están en el texto y la anotación es literalmente correcta, así que **no es un error**. Pero como la comparación es exacta, si el modelo dice `grandpa` donde el gold dice `grandparent`, falla sin equivocarse de verdad. Hay que decidir si se unifica al primer nombre usado o se deja como está, y en cualquier caso vale la pena mencionarlo en las limitaciones del paper: el emparejamiento exacto castiga la variación léxica del propio texto.

**e) Caso menor:** "took his surfboard **from the truck**" está anotado como `took, location, truck`. "From" marca origen, no lugar del evento. Es defendible y no lo cambiaría, pero conviene que la decisión sea consciente.

## Qué toca en implementación

El código **no necesita ningún cambio**. El gold entra tal cual en `score.py`, los UUIDs funcionan como nombre de archivo en `runs/` y el formato de `stories.csv` es el que `run.py` espera.

Lo que falta es acomodar la entrega y correr dev:

1. **Mover los dos archivos a donde dice la sección 6:** `golden/stories.csv` → `data/stories.csv`, y `golden/gold (1).csv` → `data/gold.csv`. La carpeta `golden/` no existe en el diseño y el ` (1)` es el sufijo de una descarga del navegador. Después se elimina `golden/`.
2. **Aplicar la corrección 1** (`side` → `Location`) y decidir con Diego los puntos 2, a, b, c y d.
3. **Correr dev:** 5 historias × 3 condiciones × 2 modelos = 30 llamadas, y puntuar con `score.py --gold data/gold.csv`. Esto también resuelve el pendiente de la sección 12 sobre si `json_estricto` restringe de verdad en Groq: se comprueba con 100 % de salidas válidas.
4. **Congelar los prompts con un commit** antes de tocar test (regla 7.2).

Ojo con el orden: correr dev **no** depende de cerrar las convenciones de arriba, porque las respuestas crudas se guardan una sola vez y el gold se puede corregir después sin volver a llamar (regla 7.1). Conviene lanzar las 30 llamadas ya e ir arreglando el gold en paralelo.

Una cosa que no haría todavía: un `check_gold.py` con estas verificaciones. Las corrí a mano y no están en la sección 6. Si se quiere dejarlas para el gold de test —30 historias donde revisar a ojo sí duele—, primero hay que agregarlo al documento.

## Para preguntarle a Diego

1. `side` con tipo `Object`, ¿error o intencional?
2. ¿Agregamos `wearing` y `drowning`? Si sí, hay que reencadenar el `next` de esas dos historias.
3. Coordinación ("windshield **and** body"): ¿una fila o dos?
4. Agente implícito ("to keep her warm"): ¿se anota o se omite?
5. "they" con dos referentes: ¿referente principal, dos filas, u omitir?
6. `grandparent` vs `grandpa`: ¿se unifica o se deja la variación del texto?
