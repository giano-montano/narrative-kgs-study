---
de: giano
para: [leo]
proposito: [continuar]
creado: 2026-09-22T02:51-05:00
estado: abierto
responde_a: []
---

# Implementación restante y corridas

> Escrito por el agente de Giano (Claude Code). Giano orquesta pero no decide: las decisiones de código, prompts y corridas son de Leo.

Leo se encarga de lo que falta implementar:

- adaptar `run.py` para repartir las corridas (L1, **hoy, urgente**);
- las 4 métricas que le faltan a `score.py` (L2–L4);
- correr dev y congelar los prompts (L5);
- correr la mitad de test (L6).

Diego corre la otra mitad y hace el scoring final. Todo el desarrollo termina el **jue 24**.

## Para el agente de Leo

- Lee primero `AGENTS.md`, `docs/PROYECTO.md` y `docs/CODIGO.md`, y después `run.py` y `score.py`.
- **Un ticket a la vez:** corre las pruebas, muestra el cambio a Leo, espera su OK, haz commit `L<n>: <resumen>` y push.
- **Nunca crees, borres ni edites archivos en `runs/`.** Las pruebas de abajo no usan archivos.
- **No llames a la API** fuera de L5 y L6.
- Hasta que Diego congele el gold de test (mié 23), no le mandes respuestas del modelo en un handoff: no debe verlas mientras anota.

## Tickets

### L1: `run.py` para repartir corridas (urgente)

**Por qué:**
- Hoy `run.py` corre las 35 historias juntas, mezclando dev y test.
- Guarda dev y test en la misma carpeta `1/`, así que `score.py` los mezclaría.
- No deja correr solo un rango de historias.

**Cambios en `run.py`:**

1. `--run` pasa a ser texto: `choices=["dev1", "dev2", "dev3", "1", "2"]`. `dev1`–`dev3` son las pruebas de prompt en dev; `1` y `2` son las dos corridas de test.
2. Nuevo `--split`, obligatorio: `choices=["dev", "test"]`.
3. **Función `check_run_split(run, split)`:** lanza `ValueError` si `run` empieza con `dev` y el split no es `dev`, o si `run` es `1` o `2` y el split no es `test`. En `main()`, llámala antes de crear el cliente de Groq y convierte el error en `parser.error(...)`.
4. Nuevos `--start` y `--end`, opcionales: filas dentro del split, desde 0 y con `end` excluido, igual que `[start:end]` en Python. Por defecto, todo el split.
5. **Función `select_stories(stories, split, start, end)`:** filtra por split, resetea el índice y aplica el rango. Si no se cumple `0 <= start < end <= n`, lanza `ValueError` indicando el `n` real.
6. Antes de empezar, imprime cuántas historias va a procesar y cuáles son la primera y la última.

**Cambios fuera de `run.py`:**
- En `.gitattributes`, agrega la línea `runs/log.csv merge=union`. Así git junta las filas de `log.csv` que agregan dos personas, en vez de marcar conflicto.
- En `README.md`, agrega `--split` y las etiquetas nuevas a los comandos de ejemplo.

**Pruebas.** Cada una tiene que dar exactamente lo indicado. No pruebes `run.py` desde la línea de comandos: haría llamadas reales.

```bash
python -c "import pandas as pd; from run import select_stories; s = pd.read_csv('data/stories.csv', dtype=str); x = select_stories(s, 'test', 0, 15); print(len(x), x.story_id.iloc[0][:8], x.story_id.iloc[-1][:8])"
# 15 a6147736 46919d93
python -c "import pandas as pd; from run import select_stories; s = pd.read_csv('data/stories.csv', dtype=str); x = select_stories(s, 'test', 15, 30); print(len(x), x.story_id.iloc[0][:8], x.story_id.iloc[-1][:8])"
# 15 2bec0512 35e60606
python -c "import pandas as pd; from run import select_stories; s = pd.read_csv('data/stories.csv', dtype=str); select_stories(s, 'test', 20, 31)"
# ValueError (debe mencionar 30)
python -c "from run import check_run_split; check_run_split('1', 'dev')"
# ValueError
python -c "from run import check_run_split; check_run_split('dev1', 'dev'); check_run_split('2', 'test'); print('ok')"
# ok
git check-attr merge runs/log.csv
# runs/log.csv: merge: union
```

---

### Qué miden las métricas de L2 a L4

- **Tipos correctos:** entre las tripletas acertadas, qué porcentaje trae bien también el `arg_type`. El acierto no mira el tipo, así que esto se mide aparte.
- **Tokens promedio:** cuánto cuesta cada condición.
- **Estabilidad (Jaccard):** la temperatura es 1.0, así que dos corridas iguales dan respuestas distintas. Jaccard mide cuánto coinciden: 1 si son idénticas, 0 si no comparten nada.
- **Bootstrap pareado:** es la métrica central del paper. Con 30 historias, una diferencia de F1 entre dos condiciones puede ser suerte.
  - Se calcula la diferencia de F1 historia por historia.
  - Se remuestrean las historias 1000 veces.
  - Se toma el rango donde cae el 95 % de los promedios.
  - Si ese rango **no incluye el 0**, la diferencia es real con estos datos.

**Reglas para las cuatro métricas:**
- Una salida inválida cuenta como vacía.
- Se usan solo las relaciones `agent`, `patient` y `location` (grupo `all_no_next`).
- Estabilidad y bootstrap usan solo las corridas `1` y `2`, nunca `dev*`.

---

### L2: tipos correctos y tokens (en `results/metrics.csv`)

**Tipos correctos:**
- `load_gold` pasa a devolver un `dict` `{clave: arg_type}`. Donde se necesite como conjunto, usa `set(gold)`.
- Para las predicciones, arma el mismo `dict`. Si una clave se repite con tipos distintos, queda el primero.
- **Función `type_accuracy(pred_types, gold_types)`:** devuelve el porcentaje (0–100) de claves compartidas con el mismo tipo, o `None` si no comparten ninguna.
- Agrégala como columna `pct_type_correct` de `metrics.csv`.

**Tokens:**
- **Función `mean_tokens(log, model_dir, condition, run, story_ids)`:**
  - `log` es `runs/log.csv` leído con `dtype=str`.
  - Filtra por modelo (con `/` cambiado por `_`), condición, corrida, historias en `story_ids` y `error` vacío.
  - Devuelve el promedio de `prompt_tokens` y el de `completion_tokens`, o `(None, None)` si no quedan filas.
- Agrégalos como columnas `mean_prompt_tokens` y `mean_completion_tokens`.

**Pruebas:**

```bash
python -c "from score import type_accuracy; print(type_accuracy({'a':'Character','b':'Location','c':'Object'}, {'a':'Character','b':'Object','z':'Object'}), type_accuracy({'a':'X'}, {'b':'X'}))"
# 50.0 None
python -c "import pandas as pd; from score import mean_tokens; log = pd.read_csv('runs/log.csv', dtype=str); print(mean_tokens(log, 'openai_gpt-oss-20b', 'json_estricto', '1', {'ex_01'}), mean_tokens(log, 'openai_gpt-oss-20b', 'json_estricto', '1', {'otro'}))"
# (835.0, 533.0) (None, None)
python score.py --gold data/gold_example.csv
# tiene que correr sin errores
```

---

### L3: estabilidad (en `results/stability.csv`)

- **Función `jaccard(a, b)`:** `len(a & b) / len(a | b)`. Si ambos están vacíos, devuelve `1.0`.
- **Para cada modelo y condición:**
  1. Toma las historias que existen en la corrida `1` y en la `2` y que están en el gold.
  2. Calcula el Jaccard de cada historia.
  3. Promedia.
- Columnas del archivo: `model, condition, n_stories, mean_jaccard`.

```bash
python -c "from score import jaccard; print(round(jaccard({1,2},{2,3}),4), jaccard(set(),set()), jaccard({1},set()))"
# 0.3333 1.0 0.0
```

---

### L4: bootstrap pareado (en `results/bootstrap.csv`)

- **Función `story_f1(pred_keys, gold_keys)`:** F1 de una historia, usando `prf`, que ya existe.
- **Función `bootstrap_ci(diffs, n_resamples=1000, seed=42)`,** exactamente así:

  ```python
  d = np.asarray(diffs, dtype=float)
  rng = np.random.default_rng(seed)
  idx = rng.integers(0, len(d), size=(n_resamples, len(d)))
  means = d[idx].mean(axis=1)
  low, high = np.percentile(means, [2.5, 97.5])
  return d.mean(), low, high
  ```

- **Para cada modelo, cada corrida (`1` y `2`) y cada par de condiciones** `(texto, json_objeto)`, `(texto, json_estricto)` y `(json_objeto, json_estricto)`:
  1. Toma las historias presentes en ambas condiciones y en el gold.
  2. Calcula `d = F1_A − F1_B` por historia.
  3. Aplica `bootstrap_ci(d)`.
- Columnas del archivo: `model, run, cond_a, cond_b, n_stories, mean_diff, ci_low, ci_high`.

```bash
python -c "from score import bootstrap_ci; print([round(float(x),4) for x in bootstrap_ci([0.1]*30)])"
# [0.1, 0.1, 0.1]
python -c "from score import bootstrap_ci; print([round(float(x),4) for x in bootstrap_ci([0.0, 0.5, 1.0, 0.2, -0.3])])"
# [0.28, -0.0805, 0.7]
python -c "from score import story_f1; print(round(story_f1({1,2,3},{2,3,4,5}),4), story_f1(set(),{1}))"
# 0.5714 0.0
```

**Al terminar L4:** escribe un handoff a Diego (`..._de-leo_para-diego_metricas-listas.md`) avisando que `score.py` genera los tres archivos.

---

### L5: correr dev y congelar los prompts

**Espera a:** el handoff de Diego que avisa que las reglas están listas (D2 y D3). Mientras tanto, avanza con L2–L4.

**Correr dev:**

```powershell
git pull
foreach ($m in "openai/gpt-oss-20b", "openai/gpt-oss-120b") {
  foreach ($c in "texto", "json_objeto", "json_estricto") {
    python run.py --model $m --condition $c --run dev1 --split dev --stories data/stories.csv
  }
}
python score.py --gold data/gold.csv
git add runs/ results/
git commit -m "L5: dev1"
git push
```

**Qué decide Leo al mirar `results/metrics.csv`:**

- **Por defecto se congela.** No se cambia el prompt para subir el F1: con 5 historias eso sería ajustarlo a dev.
- **Solo se itera si** en `texto` o `json_objeto` hay 2 o más salidas inválidas de 5 por no entender el formato. En ese caso, aclara **solo** el bloque de formato (`prompts/format_*.txt`) y corre de nuevo con `--run dev2`. El máximo es `dev3`.
- **Si el problema es de una regla de anotación,** no la cambies: escríbele un handoff a Diego con tipo `pregunta`.
- **Si `json_estricto` no da 100 % válidas,** no se itera: es un hallazgo para el paper. Anótalo en el handoff a Diego.
- **Si el promedio de tokens por llamada pasa de 2 500,** test se corre con una sola corrida (regla 7.5): solo `--run 1`.

**Para congelar:**

```bash
git tag prompts-frozen
git push --tags
```

Después escribe un handoff a Diego (`..._de-leo_para-diego_prompts-congelados.md`).

---

### L6: correr test, filas 0–14 (mié 23)

**Espera a:** L5.

```powershell
git pull
git diff prompts-frozen -- prompts/     # tiene que salir vacío
foreach ($r in "1", "2") {
  foreach ($m in "openai/gpt-oss-20b", "openai/gpt-oss-120b") {
    foreach ($c in "texto", "json_objeto", "json_estricto") {
      python run.py --model $m --condition $c --run $r --split test --start 0 --end 15 --stories data/stories.csv
    }
  }
}
git add runs/
git commit -m "L6: test filas 0-14"
git pull --rebase
git push
```

- **Si algo falla:** vuelve a correr el mismo bucle; las historias que ya tienen respuesta se saltan.
- **Si `git pull --rebase` marca conflicto en `runs/log.csv`:** conserva todas las filas de ambos lados y borra solo las líneas `<<<<<<<`, `=======` y `>>>>>>>`.

Diego corre las filas 15–29.

---

### L7: documentación

- **`docs/PROYECTO.md`, sección 6:** agrega `results/stability.csv`, `results/bootstrap.csv`, las etiquetas de corrida, `AGENTS.md` (antes `CLAUDE.md`) y `handoffs/`.
- **`docs/CODIGO.md`:** un párrafo por métrica nueva y los flags nuevos de `run.py`.

---

## Si algo se atrasa

| si... | entonces |
|---|---|
| Diego no avisa que las reglas están listas antes del mié 23 a las 12:00 | handoff `bloqueo` a Diego; mientras tanto, sigue con L2–L4 y L7 |
| Diego no corrió las filas 15–29 el jue 24 a las 15:00 | estás autorizado a correrlas tú con tu key (`--start 15 --end 30`) |

## Para el paper (sección IV)

El borrador de la sección IV habla de "A: extracción libre / B: esquema en el prompt y JSON validado" y de resolver correferencias. **Ese no es el diseño del experimento:** es justo el que la sección 10 de `PROYECTO.md` descarta, porque comparar así es circular.

El experimento real, descrito en las secciones 3 a 5 de `PROYECTO.md`:
- Las **mismas reglas** en el prompt para las tres condiciones.
- Lo único que cambia es **cómo se escribe la salida**: `texto`, `json_objeto` o `json_estricto`.
- Se prueba con dos modelos.

La sección IV tiene que describir eso. La resolución de correferencias queda fuera de alcance: puede ir en VII (Trabajo Futuro).
