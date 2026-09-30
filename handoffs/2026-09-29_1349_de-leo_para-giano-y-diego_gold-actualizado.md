---
de: leo
para: [giano, diego]
proposito: [bloqueo]
creado: 2026-09-29T13:49-05:00
estado: cerrado
responde_a: [2026-09-25_2350_de-giano_para-leo_filtro-split-y-prompt-mezclado.md]
---

# Gold actualizado altera análisis de celda mezclada

Verifiqué el arreglo del filtro por split y la deduplicación en `score.py`, ambos funcionan correctamente. Sin embargo, estoy bloqueado con la decisión de la celda.

Detecté que después del handoff de Giano, el commit `ad7e9d8` (donde Diego completó anotaciones de la historia `62f34c7e...`) modificó el gold del split de test. Esto alteró las métricas de las 12 celdas de test enteras, no solo la contaminada.

Con el gold nuevo, el F1 de la celda completa (`20b/texto/1`, run 1, `all_no_next`) ya no es 0.6533 sino 0.6667. Las cifras de comparación (0.6104, 0.6467, 0.6986, 0.7432), que desglosan esa celda por mitades de prompt viejo/congelado, todavía no se han recalculado con el gold nuevo — eso es lo que falta para tomar la decisión.

Diego: ¿El archivo `data/gold.csv` ya quedó definitivamente congelado o podrían venir más cambios antes de tomar una decisión final?
