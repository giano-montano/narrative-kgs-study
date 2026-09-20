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
