---
de: giano
para: [diego]
proposito: [bloqueo, pregunta]
creado: 2026-09-25T23:52-05:00
estado: cerrado
responde_a: [2026-09-25_0015_de-diego_para-leo_gold-congelado.md]
---

# Gold incompleto en una historia, el tag que falta, y la Tabla IV del paper

Auditamos el gold y los resultados. **El gold está estructuralmente limpio**: 505 filas, 35 historias, sin duplicados, `rel` y `arg_type` dentro del esquema, `Event` solo con `next`, ningún `event` ni `arg` multipalabra, ningún artículo ni posesivo. Tres cosas para ti.

## 1. `62f34c7e-...` tiene 3 filas de gold y debería tener ~14

La historia es:

> "Bryan had spent all summer sleeping in. School was starting in a few days. He would have to start getting up at six in the morning. He started going to bed earlier and trying to get up in the morning. After a few days Brian was back in the routine of getting up early."

El gold anota solo `sleeping/agent/Bryan`, `sleeping/next/starting` y `get/agent/Bryan`. Faltan `spent`, `starting`, `start`, `getting`, `started`, `going`, `trying` y casi toda la cadena `next`. La media de test es 13.7 filas por historia. Además **`sleeping next starting` apunta a un evento que no existe en el gold** — es la única cadena `next` colgada de las 505 filas.

No es el artefacto de comillas: en `06e3269` ya tenía 3 filas, y la comilla suelta que arreglaste en `189d9f7` era un typo aparte que no borraba anotaciones.

Efecto medido: los modelos sacan **tp = 0** en esa historia en las 12 celdas. Excluirla sube el F1 entre +0.005 y +0.016 **en las 12 por igual**, así que no cambia el orden ni el resultado nulo — pero infla artificialmente las falsas alarmas de todos.

**Decides tú**, que mandas en el gold: (a) completarla siguiendo las reglas 1–10 y volver a puntuar, o (b) excluirla y reportar n = 29 con la razón escrita en limitaciones. La (a) es como media hora; la (b) es honesta y cuesta una frase.

## 2. El tag `gold-test-frozen` no existe

Tu handoff `2026-09-25_0015` dice que lo creaste, pero `git tag --list` solo devuelve `prompts-frozen`. El congelamiento de facto es `06e3269` (25 sep 00:05 −05).

Buena noticia: **la regla 7.3 se cumplió en lo sustantivo.** Revisamos el historial y el único cambio de `data/gold.csv` posterior a `06e3269` es el de `189d9f7`, que quita una comilla suelta — 2 líneas, sin tocar ninguna anotación. Verificado con `git show`. Falta solo crear y empujar el tag sobre `06e3269` para que quede constancia.

## 3. La Tabla IV del paper promedia intervalos de confianza

`results/bootstrap.csv` tiene **12 filas** (3 pares × 2 modelos × **2 corridas**). La Tabla IV del borrador tiene 6 y dice "las seis comparaciones evaluadas": los valores son el promedio aritmético de las dos corridas, **incluidos los límites del IC**. Por ejemplo, 120b texto vs json_objeto: −0.0305 = (−0.0374 + −0.0236)/2, y el IC inferior −0.0887 = (−0.0931 + −0.0842)/2.

Promediar dos límites de confianza no da un intervalo de confianza del 95 %, y un revisor lo va a marcar. **La conclusión no cambia** — recalculamos los 12 y los 12 incluyen el 0 — pero hay que reemplazar la tabla por las 12 filas reales de `bootstrap.csv`, o reportar una corrida y decir que la otra coincide.

## 4. Un número de la Tabla III cambia

Por un bug de `score.py` (ya le escribimos a Leo), la celda `20b/texto/1` se puntuaba con 35 historias porque incluía las 5 de dev. Corregida:

| | borrador | correcto |
|---|---|---|
| `20b/texto` run 1 | 0.6676 | 0.6533 |
| `20b/texto` promedio | **0.6811** | **0.6740** |

Es el único número que cambia de las 18 celdas. El patrón que describís se mantiene: el 120b sube de `texto` a `json_estricto` y el 20b va al revés.

La tabla verificada completa (F1, % válidas, % tipos, tokens, estabilidad, los 12 intervalos y el desglose por relación) está en `internals/2026-09-25_2345_tabla-resultados-verificada.md`. Esa carpeta no se pushea: pedila y te la pasamos, o la movemos a `docs/` si la querés versionada.
