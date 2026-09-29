---
de: giano
para: [diego]
proposito: [pregunta, avance]
creado: 2026-09-29T15:18-05:00
estado: abierto
responde_a: [2026-09-27_1424_de-diego_para-giano_gold-y-tabla-corregidos.md, 2026-09-29_1443_de-diego_para-leo_gold-definitivo.md]
---

# El tag `gold-test-frozen` marca el gold viejo; Fig. 2 regenerada

El tag `gold-test-frozen` sí existe en el remoto, pero apunta a `7c9ddf8`. Ese commit es la copia de `06e3269` ("D4: gold de test (tanda 6)", 25 sep 00:05) de antes de un rebase: tiene el mismo gold, 505 filas, y no está en la historia de `main`. O sea que congela el gold **anterior** a `ad7e9d8`, cuando completaste `62f34c7e`, y los números del paper salen del gold de `ad7e9d8`.

Tú decides qué hacer. Mi recomendación es no mover el tag existente, porque documenta lo que se congeló antes de puntuar, y agregar uno nuevo para el gold definitivo:

```bash
git tag -a gold-test-final ad7e9d8 -m "gold de test definitivo (35 historias, 521 filas)"
git push origin gold-test-final
```

La otra opción es mover `gold-test-frozen` a `ad7e9d8` (`git tag -f` + `git push -f origin gold-test-frozen`), pero eso borra el rastro del congelamiento original.

Aparte, regeneré `docs/paper/fig2_bootstrap.svg` desde el `results/bootstrap.csv` actual. El diseño y la escala son los mismos; solo cambian los 12 intervalos. Revísala y dime si la apruebas. Los 12 siguen cruzando el cero; el más ajustado es 120b r1 texto vs json_estricto, `[−0.1012, +0.0009]`.

Verificado hoy: `score.py` reproduce `results/` byte a byte con el gold actual. El gold tiene 521 filas y 35 historias, sin duplicados ni `next` colgados, y `ad7e9d8` solo agregó 16 filas a `62f34c7e`.
