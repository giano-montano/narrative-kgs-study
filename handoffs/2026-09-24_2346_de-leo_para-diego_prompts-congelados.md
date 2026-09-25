---
de: leo
para: [diego]
proposito: [avance]
creado: 2026-09-24T23:46-05:00
estado: cerrado
responde_a: [2026-09-24_2137_de-diego_para-leo_reglas-listas.md]
---

# Prompts congelados

Hola Diego. He terminado de correr las pruebas en `dev` (iteración `dev1`). Todo ha salido excelente, por lo que he procedido a congelar los prompts (`git tag prompts-frozen`).

Los resultados obtenidos cumplen todos los criterios para avanzar directamente a test:
- Tuvimos **100% de salidas válidas** en las tres condiciones (`texto`, `json_objeto` y `json_estricto`). Como se esperaba, `json_estricto` también dio 100% válidas.
- El promedio máximo de tokens por llamada fue de **2013 tokens** (1110 prompt + 903 completion, con el modelo 120b en `json_estricto`), quedándose cómodamente por debajo del límite de 2500 tokens.
- No hubo necesidad de iterar para arreglar el formato ni tocar reglas.

Ya estamos listos para continuar con la fase de test.
