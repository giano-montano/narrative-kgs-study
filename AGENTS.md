@docs/PROYECTO.md

## Convenciones de código

- Python 3.11+. Sin clases salvo los modelos Pydantic; funciones cortas; sin frameworks.
- Ninguna dependencia fuera de `requirements.txt`.
- Nombres en inglés; comentarios en español, breves.
- Nada de abstracciones "para el futuro": solo lo que pide el documento.
- Si algo del documento es ambiguo, preguntar en vez de decidir.
- Nunca borrar ni sobrescribir nada dentro de `runs/`.
- En `runs/`, la `/` del nombre del modelo se reemplaza por `_` (`openai_gpt-oss-20b`).
- P/R/F1 son micro (aciertos sumados sobre todas las historias).

## Trabajo con handoffs

El equipo se coordina con archivos en `handoffs/`. Un handoff es un mensaje escrito de una persona (o su agente) a otra.

### Quién decide qué

| persona | se encarga de | decide sobre |
|---|---|---|
| Diego | gold, reglas de anotación, resultados | reglas (sección 4 de `PROYECTO.md`), `data/gold.csv`, tablas y gráficas de resultados |
| Leo | implementación y corridas | `run.py`, `score.py`, `prompts/`, cuándo congelar prompts |
| Giano | orquestación | nada: no decide ni implementa |

Si necesitas algo que le toca a otra persona, escríbele un handoff. Un agente nunca decide por su humano: le pregunta.

### Al empezar cada sesión, el agente:

1. Hace `git pull`.
2. Lee los archivos de `handoffs/` que tengan a su humano en `para:` y `estado: abierto`.

### Nombre del archivo

```
AAAA-MM-DD_HHMM_de-<quien>_para-<quien>_<tema>.md
```

- Hora de Lima en 24 h: `2026-09-22_1830_de-leo_para-diego_prompts-congelados.md`.
- Todo en minúsculas, sin tildes ni espacios.
- Si va para dos personas: `para-leo-y-diego`.

### Contenido

```markdown
---
de: leo
para: [diego]
proposito: [avance]      # uno o varios: continuar, avance, decision, bloqueo, pregunta
creado: 2026-09-22T18:30-05:00
estado: abierto          # abierto | cerrado
responde_a: []           # nombres de handoffs a los que contesta
---

# <título corto>

<2 a 4 líneas: qué pasó y qué tiene que hacer quien lo recibe>
```

Después del resumen, agrega solo lo que haga falta: tickets, decisiones tomadas, preguntas o bloqueos.

- **`continuar`:** pasas trabajo para que otro lo siga.
- **`avance`:** terminaste algo que el otro esperaba.
- **`decision`:** decidiste algo que afecta al otro.
- **`bloqueo`:** no puedes seguir hasta que el otro haga algo.
- **`pregunta`:** necesitas que el otro decida algo de su área.

### Reglas

- Quien recibe el handoff solo cambia `estado` a `cerrado` al terminar. No edita nada más.
- Para responder, se crea un handoff **nuevo** con `responde_a`.
- Se commitea y se pushea enseguida: si no está en `main`, el otro no lo ve.
