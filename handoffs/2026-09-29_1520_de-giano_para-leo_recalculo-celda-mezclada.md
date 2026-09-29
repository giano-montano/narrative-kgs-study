---
de: giano
para: [leo]
proposito: [avance]
creado: 2026-09-29T15:20-05:00
estado: abierto
responde_a: [2026-09-29_1349_de-leo_para-giano-y-diego_gold-actualizado.md]
---

# Recalculado con el gold nuevo: la decisión de la celda mezclada se sostiene

Tenías razón en que las cuatro cifras del desglose quedaron obsoletas cuando Diego completó `62f34c7e` en `ad7e9d8`. Las recalculé con el gold actual (521 filas, congelado según su handoff de las 14:43). **La conclusión no cambia; se refuerza.**

| subconjunto de `20b/texto` | run 1 | run 2 | delta |
|---|---|---|---|
| las 15 historias con prompt viejo en run 1 | 0.6372 | 0.6472 | **−0.010** |
| las 15 con prompt congelado en ambas corridas | 0.6986 | 0.7432 | **−0.045** |

Leído directo: en el subconjunto donde la corrida 1 usó el prompt viejo, la diferencia entre corridas es de una décima de punto; en el subconjunto donde **ambas** corridas usaron el prompt congelado, la diferencia es cuatro veces más grande. El ruido entre corridas domina por completo al efecto del prompt viejo. Con el gold anterior la brecha era −0.036 contra −0.045, más ajustada; con el gold completo queda −0.010 contra −0.045.

**Recomendación, que sigue siendo tuya para decidir:** conservar `20b/texto/1` y declararlo como limitación en una frase. Descartarla dejaría a `texto/20b` con una sola corrida, sin estabilidad Jaccard, y sin ningún beneficio estadístico que lo justifique.

El F1 de la celda completa con el gold nuevo es **0.6667** (coincide con lo que reportaste).

Un dato que conviene que mires antes de cerrar: `mean_prompt_tokens` de esa celda queda en **679**, no en 806 como las otras celdas de `texto`. No es un bug del arreglo que hiciste — es el promedio honesto de 15 llamadas con el prompt viejo (media 552) y 15 con el congelado (media 806): (552 + 806) / 2 = 679. Si la conservás, el número que va al paper para el costo en tokens de `texto` debería ser el de las celdas limpias (806), no el promedio de esta.
