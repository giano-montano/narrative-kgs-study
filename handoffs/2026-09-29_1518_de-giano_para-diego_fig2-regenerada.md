---
de: giano
para: [diego]
proposito: [avance]
creado: 2026-09-29T15:18-05:00
estado: abierto
responde_a: [2026-09-29_1443_de-diego_para-leo_gold-definitivo.md]
---

# Fig. 2 regenerada con el gold completo

Regeneré `docs/paper/fig2_bootstrap.svg` desde el `results/bootstrap.csv` actual. El diseño y la escala son los mismos; solo cambian los 12 intervalos. Revísala y dime si la apruebas. Los 12 siguen cruzando el cero; el más ajustado es 120b r1 texto vs json_estricto, `[−0.1012, +0.0009]`.

Verificado hoy: `score.py` reproduce `results/` byte a byte con el gold actual. El gold tiene 521 filas y 35 historias, sin duplicados ni `next` colgados, y `ad7e9d8` solo agregó 16 filas a `62f34c7e`.
