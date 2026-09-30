# narrative-kgs-study

Efecto del formato de salida en la extracción de KGs narrativos con LLMs.

- **Qué es y por qué:** [`docs/PROYECTO.md`](docs/PROYECTO.md) — fuente de verdad, las decisiones se cambian ahí primero.
- **Cómo funciona el código:** [`docs/CODIGO.md`](docs/CODIGO.md).
- **Estado del gold:** [`docs/REVISION_GOLD.md`](docs/REVISION_GOLD.md).

## Instalación

Python 3.11 o más nuevo.

```bash
python -m venv .venv
.venv/Scripts/activate      # Windows;  en macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## La API key

El código lee la variable de entorno `GROQ_API_KEY`. Se define una vez:

```powershell
setx GROQ_API_KEY "tu_key"    # PowerShell; cierra y reabre la terminal
```

```bash
export GROQ_API_KEY="tu_key"  # macOS/Linux; ponlo en tu ~/.bashrc o ~/.zshrc
```

La key nunca va en un archivo del repo. Si te falta o quieres rotarla: <https://console.groq.com/keys>.

## Correr

Datos esperados: `data/stories.csv` (`story_id, split, s1..s5`) y `data/gold.csv` (`story_id, event, rel, arg, arg_type`).

Una llamada por historia. Se corre una condición a la vez:

```bash
python run.py --model openai/gpt-oss-20b --condition texto --run 1 --split test --stories data/stories.csv
```

- `--condition`: `texto`, `json_objeto` o `json_estricto`.
- `--model`: `openai/gpt-oss-20b` o `openai/gpt-oss-120b`.
- `--run`: número de corrida (`dev1`, `dev2`, `dev3` en dev; `1`, `2` en test).
- `--split`: `dev` o `test`.

Las respuestas quedan en `runs/<modelo>/<condicion>/<corrida>/<story_id>.txt` y cada llamada agrega una fila a `runs/log.csv` con tokens, latencia y errores.

Puntuar todo lo que haya en `runs/`:

```bash
python score.py --gold data/gold.csv
```

Escribe tres archivos en `results/`:

- `metrics.csv`: precisión, recall y F1 (principal sin `next`, y por relación), % de salidas válidas, % de tipos correctos y tokens promedio, por modelo × condición × corrida.
- `stability.csv`: Jaccard entre las corridas 1 y 2.
- `bootstrap.csv`: diferencia de F1 por historia entre condiciones, con IC 95 % por bootstrap pareado.

Para probar que todo funciona sin tocar el corpus real, hay una historia inventada:

```bash
python run.py --model openai/gpt-oss-20b --condition texto --run dev1 --split dev --stories data/stories_example.csv
python score.py --gold data/gold_example.csv
```

## Tres reglas que no se rompen

1. **Nunca se llama dos veces por la misma historia.** Si ya existe la respuesta cruda, `run.py` la salta. Un error de parseo se arregla en `score.py` y se vuelve a puntuar, sin gastar cuota.
2. **Nada dentro de `runs/` se borra ni se sobrescribe.** Para rehacer una corrida hay que mover los archivos fuera a mano.
3. **Los prompts se iteran solo con dev** y se congelan con un commit antes de correr test.

## Si algo falla

- **`429`:** son los límites del plan gratuito (30 solicitudes/min, 8 000 tokens/min por modelo). `run.py` espera lo que indique la API y reintenta hasta 3 veces; si igual falla, queda anotado en `log.csv` y sigue con la siguiente historia.
- **Cualquier otro error:** se registra en la columna `error` de `runs/log.csv` y la corrida continúa. Volver a lanzar el mismo comando reintenta solo las historias sin respuesta.
- **`score.py` avisa "no tiene gold":** hay respuestas en `runs/` de historias que el gold todavía no cubre. Es normal mientras el gold de test no esté listo.
