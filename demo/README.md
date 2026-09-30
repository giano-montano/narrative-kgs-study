# Demo: grafos narrativos en vivo

Página web desplegada en Cloudflare Workers. Se elige una historia de `data/stories.csv`, un modelo y una condición. El Worker llama a Groq con el mismo prompt, temperatura y `reasoning_effort` que `run.py`, y la página dibuja el grafo (D3) mientras llega la respuesta. Después lo compara con `data/gold.csv` usando las mismas reglas de `score.py`.

No forma parte del experimento: no escribe en `runs/` ni en `results/`.

## Archivos

```
build_data.py     empaqueta historias, gold, prompts, esquema y resultados en public/data.json
src/worker.js     /api/extract: arma el prompt y reenvía el stream de Groq
public/           página: index.html, style.css, app.js, data.json
wrangler.jsonc    config del Worker (assets + límite de 6 llamadas/min por IP)
```

## Streaming por condición

Groq solo transmite token a token en `texto`. En `json_objeto` y `json_estricto` valida el JSON antes de enviarlo, así que el contenido llega en un solo bloque. En esos casos, mientras tanto, se muestra el razonamiento en vivo y las tripletas se animan una por una cuando llegan.

## Uso

Si cambian `data/`, `prompts/`, `schema.py` o `results/`, regenerar los datos desde la raíz del repo:

```bash
python demo/build_data.py
```

Local (lee `GROQ_API_KEY` del entorno):

```bash
cd demo
CLOUDFLARE_INCLUDE_PROCESS_ENV=true npx wrangler dev
```

Deploy (una sola vez: `npx wrangler login` y `npx wrangler secret put GROQ_API_KEY`):

```bash
cd demo
npx wrangler deploy
```

No hace falta `npm install`: `npx` descarga wrangler y D3 se carga desde cdnjs.
