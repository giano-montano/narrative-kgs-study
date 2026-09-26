---
de: giano
para: [leo]
proposito: [bloqueo, decision]
creado: 2026-09-25T23:50-05:00
estado: abierto
responde_a: [2026-09-24_2038_de-leo_para-diego_metricas-listas.md, 2026-09-24_2346_de-leo_para-diego_prompts-congelados.md]
---

# `score.py` puntúa dev dentro de test, y una celda mezcla dos prompts

Auditamos las 12 celdas de test con un scoring independiente: **tu aritmética está bien, reproduce 11 de 12 celdas dígito a dígito.** Pero `score.py` no filtra por split y una celda quedó contaminada, y además descubrimos que la mitad de esa misma celda se corrió con el prompt anterior al congelamiento. Necesitamos dos cosas de ti antes de que Diego cierre la sección V.

## 1. Filtrar por split en `score.py` (arreglo)

`runs/openai_gpt-oss-20b/texto/1/` tiene 36 archivos: las 30 de test, `ex_01` y **las 5 historias de dev**. `score.py:214` solo descarta un archivo si no tiene gold, así que filtra `ex_01` pero las 5 de dev sí tienen gold y se puntúan dentro de la celda de test. Por eso esa fila de `metrics.csv` dice `n_stories = 35`.

El arreglo: comparar `data/stories.csv` contra la etiqueta de corrida — `dev*` acepta solo historias `dev`, `1` y `2` solo `test`. **No borres nada de `runs/`** (`AGENTS.md`), basta ignorarlas al puntuar.

Un segundo detalle del mismo arreglo: `mean_tokens` (`score.py:106`) excluye bien las filas con error, pero **no deduplica `log.csv`**. En esa celda hay 45 filas exitosas para 30 historias, y el promedio sale 628 en vez de 806.

Verificación después del arreglo: las 18 celdas deben quedar con `n_stories` 30 o 5, y `mean_prompt_tokens` ≈ 806 / 968 / 1102 según condición.

Ya medimos el resultado: **cambia una sola celda.**

| | hoy | corregido |
|---|---|---|
| `20b/texto/1`, F1 `all_no_next` | 0.6676 | 0.6533 |

`stability.csv` y `bootstrap.csv` no cambian ni un dígito (ya intersectaban 30 historias).

## 2. Decisión tuya: `20b/texto/1` mezcla dos prompts

De las 30 respuestas de test de esa celda, **15 se generaron el 19–20 sep con el prompt anterior a `prompts-frozen`** y 15 el 25 sep con el prompt congelado. Evidencia: en `runs/log.csv` esa celda tiene dos regímenes de `prompt_tokens` (537–573 el 20 sep; 793–827 el 25 sep), mientras las otras 11 celdas tienen un rango único. `prompts/instructions.txt` cambió el 24 sep en `224b6d9`, después de esas 15 llamadas. Los archivos viejos entraron en `bb6f7da` ("chore: save local runs before pull"); los tuyos, en `cd3b3d3`. **No sobrescribiste nada** — `run.py` abre en modo `"x"`; los 15 tuyos simplemente no existían en la copia que corrió el 20 sep.

Formalmente viola la regla 7.2. Pero lo medimos y el efecto residual es chico:

| subconjunto | run 1 | run 2 | delta |
|---|---|---|---|
| las 15 con prompt viejo en run 1 | 0.6104 | 0.6467 | −0.036 |
| las 15 con prompt congelado en ambas | 0.6986 | 0.7432 | −0.045 |

La brecha entre mitades es dificultad de las historias, no versión del prompt: la corrida 2 la reproduce usando el mismo prompt en las 30. Y la diferencia entre corridas es *igual de grande* donde ambas usan el prompt congelado.

**Lo que recomendamos:** conservar la celda y declararlo como limitación. Descartarla dejaría `20b/texto` con una sola corrida y sin estabilidad. **Pero la decisión es tuya**, que mandas en corridas: dinos si preferís (a) conservarla con nota, (b) descartar `20b/texto/1` y reportar esa condición con una corrida, o (c) re-correr las 15 historias en una carpeta nueva (`runs/.../texto/1b/`) si te alcanza la cuota — sin borrar nada.

Detalle relacionado, sin urgencia: `runs/log.csv` tiene 102 filas con error (70 `AuthenticationError` 401 en esta misma celda, 31 `APIConnectionError`, 1 error 520). Ninguna historia quedó sin archivo, así que no falta nada.

El informe completo con la evidencia archivo por archivo está en `internals/2026-09-25_2340_informe-auditoria-final.md` (esa carpeta no se pushea; pídelo si lo querés).
