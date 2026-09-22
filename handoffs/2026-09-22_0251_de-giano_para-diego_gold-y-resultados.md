---
de: giano
para: [diego]
proposito: [continuar]
creado: 2026-09-22T02:51-05:00
estado: abierto
responde_a: []
---

# Gold, reglas y resultados

> Escrito por el agente de Giano (Claude Code). Giano orquesta pero no decide: las decisiones de gold, reglas y resultados son de Diego.

Diego se encarga de todo lo del gold y de los resultados. Primero hay que escribir en el documento, en el prompt y en el gold las reglas que Diego ya decidió (D1–D3, **hoy**, porque Leo las necesita para correr dev). Después vienen el gold de test (D4–D5, **mié 23**), la mitad de las corridas de test (D6) y el scoring final con tablas y gráficas (D7), ambos el **jue 24**.

## Para el agente de Diego

- Lee primero `AGENTS.md`, `docs/PROYECTO.md` y `docs/REVISION_GOLD.md`.
- **Un ticket a la vez:** muestra el cambio a Diego, espera su OK, haz commit `D<n>: <resumen>` y push.
- **Nunca escribas ni propongas filas del gold.** El gold lo escribe Diego; si lo escribe un modelo, el experimento no vale.
- **Hasta terminar D5, no abras nada en `runs/`:** Diego no debe ver respuestas del modelo mientras anota (regla 7.3).

## Tickets

### D1: reglas nuevas en `docs/PROYECTO.md`

En la sección 4, después de la regla 5, pega esto:

```markdown
6. **Coordinación:** si un evento tiene dos argumentos unidos por "and" u "or" en la misma relación, se escribe una fila por cada uno ("the windshield and body" → `windshield` y `body`).
7. **Pronombres plurales:** si un pronombre plural refiere a varias entidades, se escribe una fila por cada una ("they" = Joana y su madre → `Joana` y `mother`).
8. **Agente:** se anota solo si es el sujeto gramatical de ese verbo, o el sujeto explícito del verbo principal del que depende ("Joana decided to sell" → `sell` tiene agente `Joana`). Si para saber quién hace la acción hay que deducirlo de otra parte ("bought a blanket to keep her warm"), ese evento no lleva `agent`.
9. **Un nombre por entidad:** si el texto nombra a la misma entidad con palabras distintas ("grandparent", "grandpa"), se usa siempre la primera que aparece en el texto.
```

Antes del commit, **pregúntale a Diego estas tres cosas**:

1. **¿La regla 8 dice lo que quiso?** Con ese texto, solo `keep/blanket` sale del gold; `sell/Joana`, `save/guard`, `helping/Terry` y `close/eyes` se quedan.
2. **`side` quedó como `Object` a propósito.** Si la regla es "el tipo describe la cosa", `truck` y `rock` también deberían ser `Object`, y hoy son `Location`. Si la regla es "un `location` siempre es `Location`", entonces `side` pasa a `Location`. La respuesta se escribe como regla 10.
3. **`wearing` y `drowning` quedaron fuera,** pero la regla 1 los incluye, así que el modelo los va a extraer y contará como error. ¿Se agregan, se escribe una excepción en la regla 1, o se deja así?

### D2: las mismas reglas en `prompts/instructions.txt`

Al final de "Annotation rules", pega esto. Si D1 cambió algo, tradúcelo igual:

```
6. Coordination: if an event has two arguments joined by "and" or "or" in the same relation, write one triple for each ("the windshield and body" -> "windshield" and "body").
7. Plural pronouns: if a plural pronoun refers to several entities, write one triple for each ("they" = Joana and her mother -> "Joana" and "mother").
8. Agent: write an agent only if it is the grammatical subject of that verb, or the explicit subject of the main verb it depends on ("Joana decided to sell" -> "sell" has agent "Joana"). If finding who does the action requires deducing it from elsewhere ("bought a blanket to keep her warm"), that event has no agent.
9. One name per entity: if the text names the same entity with different words ("grandparent", "grandpa"), always use the first one that appears in the text.
```

No toques `format_text.txt` ni `format_json.txt`.

### D3: corregir el gold de dev (`data/gold.csv`)

1. **Borrar** la fila `c7b2536a-a3ee-48c0-af1d-081d76d67872,keep,agent,blanket,Object`.
2. **Cambiar** `grandpa` por `grandparent` en `d995bb60-e6dc-49f2-965e-66f80ab2b94e,pass,agent,grandpa,Character`.
3. **Agregar** `86983498-bc58-4d37-a2de-9297ee03f03d,continued,patient,windshield,Object`.
4. **Agregar** `862821f2-5f1d-4d9f-b433-371dfcc5e7ed,lack,agent,mother,Character`.
5. **Tipos:** lo que Diego respondió en la pregunta 2 de D1.

**Listo cuando:** quedan 95 filas y el script de abajo dice `OK` con `dev`.

**Después de D3:** escribe un handoff a Leo (`..._de-diego_para-leo_reglas-listas.md`) avisando que puede correr dev.

### D4: gold de test, de a 5 historias

- **Diego** anota las historias `test` de `data/stories.csv` en orden, agregando filas al final de `data/gold.csv`.
- **Después de cada tanda de 5, el agente:**
  - corre el script de abajo con `test`;
  - revisa la tanda contra las reglas y **solo señala** problemas, citando el número de regla (nunca escribe filas);
  - con el OK de Diego, hace commit.

### D5: congelar el gold de test (mié 23)

```bash
git tag gold-test-frozen
git push --tags
```

Después de esto, `data/gold.csv` ya no se cambia.

Escribe un handoff a Leo (`..._de-diego_para-leo_gold-congelado.md`).

### D6: correr tu mitad de test (filas 15–29)

- **Espera a:** D5, y a que Leo avise que los prompts están congelados (tag `prompts-frozen`).
- **Usa tu propia API key de Groq.** Si no la tienes configurada, mira `README.md`.

```powershell
git pull
git diff prompts-frozen -- prompts/     # tiene que salir vacío
foreach ($r in "1", "2") {
  foreach ($m in "openai/gpt-oss-20b", "openai/gpt-oss-120b") {
    foreach ($c in "texto", "json_objeto", "json_estricto") {
      python run.py --model $m --condition $c --run $r --split test --start 15 --end 30 --stories data/stories.csv
    }
  }
}
git add runs/
git commit -m "D6: test filas 15-29"
git pull --rebase
git push
```

Si algo falla, vuelve a correr el mismo bucle: las historias que ya tienen respuesta se saltan.

### D7: scoring final, tablas y gráficas (jue 24)

- **Espera a:** D6, a las filas 0–14 de Leo y a que Leo avise que las métricas están listas.
- **Comprueba que están las 360 respuestas:**

```bash
python -c "import pathlib; print(len([p for p in pathlib.Path('runs').glob('*/*/[12]/*.txt') if not p.stem.startswith('ex_')]))"
```

  Tiene que salir `360`.

- **Corre el scoring:**

```bash
python score.py --gold data/gold.csv
```

  Esto genera `results/metrics.csv`, `results/stability.csv` y `results/bootstrap.csv`. Haz commit y push de `results/`.

Con eso Diego arma las tablas y gráficas de la sección V del paper. **No hay librería de gráficos en el repo:** hazlas en Excel o Sheets a partir de los CSV.

Lo principal a mostrar:
- el F1 sin `next` por modelo y condición;
- las diferencias con su intervalo de `bootstrap.csv` (si el intervalo no incluye el 0, la diferencia es real);
- el % de salidas válidas.

## Si algo se atrasa

| si... | entonces |
|---|---|
| Diego no puede responder las preguntas de D1 | commitea las reglas 6–9 igual; los tipos (pregunta 2) se arreglan después, porque no cambian el F1 |
| el jue 24 a las 12:00 Leo todavía no congeló los prompts | escríbele un handoff `bloqueo` |
| Diego no llega a correr D6 el jue 24 a las 15:00 | Leo está autorizado a correr las filas 15–29 con su propia key |

## Script de validación

Guárdalo **fuera del repo**, por ejemplo en `C:\temp\check_gold.py`. Córrelo desde la raíz del repo con `python C:\temp\check_gold.py dev` o `python C:\temp\check_gold.py test`. No se commitea.

```python
import sys
sys.path.insert(0, ".")  # importa schema.py y score.py del repo
import pandas as pd
from pydantic import ValidationError
from schema import Triple
from score import key

SPLIT = sys.argv[1]
stories = pd.read_csv("data/stories.csv", dtype=str)
gold = pd.read_csv("data/gold.csv", dtype=str)
text = {r.story_id: " ".join([r.s1, r.s2, r.s3, r.s4, r.s5]).lower()
        for r in stories.itertuples() if r.split == SPLIT}
gold = gold[gold.story_id.isin(text)]
errors = []

if list(gold.columns) != ["story_id", "event", "rel", "arg", "arg_type"]:
    errors.append(f"columnas incorrectas: {list(gold.columns)}")
for i, r in gold.iterrows():
    fila = f"fila {i + 2} ({r.story_id[:8]}, {r.event}, {r.rel}, {r.arg})"
    try:
        Triple(event=r.event, rel=r.rel, arg=r.arg, arg_type=r.arg_type)
    except ValidationError:
        errors.append(f"{fila}: rel o arg_type fuera del esquema")
    if r.event.lower() not in text[r.story_id]:
        errors.append(f"{fila}: el evento no aparece literal en el texto")
    if r.rel != "next" and r.arg.lower() not in text[r.story_id]:
        errors.append(f"{fila}: el argumento no aparece literal en el texto")
    if (r.rel == "next") != (r.arg_type == "Event"):
        errors.append(f"{fila}: next va con Event y Event solo con next")
keys = [key(r.story_id, r.event, r.rel, r.arg) for r in gold.itertuples()]
if len(keys) != len(set(keys)):
    errors.append(f"{len(keys) - len(set(keys))} filas repetidas tras normalizar")
for sid, sub in gold.groupby("story_id"):
    events = list(dict.fromkeys(sub.event))
    nxt = sub[sub.rel == "next"]
    if nxt.event.duplicated().any():
        errors.append(f"{sid[:8]}: un evento tiene mas de un next")
    if not set(nxt.arg) <= set(events):
        errors.append(f"{sid[:8]}: next apunta a eventos sin filas propias: {set(nxt.arg) - set(events)}")
    if len(events) - len(nxt) != 1:
        errors.append(f"{sid[:8]}: la cadena next deberia dejar exactamente 1 evento final")

print(f"split={SPLIT}: {gold.story_id.nunique()}/{len(text)} historias anotadas, {len(gold)} filas")
print("\n".join(errors) if errors else "OK: sin errores")
```

El script revisa el formato y las cadenas `next`, **no** si la anotación es correcta: eso lo revisa Diego leyendo con las reglas en la mano.
