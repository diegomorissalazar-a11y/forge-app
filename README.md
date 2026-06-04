# MELQART v174 — Nutrición crítica + heatmaps de seguimiento

## Cambios aplicados
- Corrige cálculo nutricional usando equivalencias de proteína y pauta mínima en días 7/7.
- Home y Tab Nutrición usan el mismo cálculo de porciones.
- Actualiza alimentos frecuentes: huevo duro = 1.5 proteína; scoop = 2; pollo/pescado según equivalencias.
- Agrega comidas rápidas: pollo, vacuno y pescados con arroz/papas/fideos.
- Exportador nutricional agrega % de proteína y origen del cálculo.
- Heatmap de pauta nutricional usa cálculo corregido.
- Agrega heatmap de proteínas completas.
- Heatmap de agua usa meta de 10 vasos.
- Agrega heatmap de creatina.
- Días entrenados se basan en día con sesión registrada.

## Validación
- app.js validado con `node --check app.js`.

## No tocado
- Login/Auth/Firebase.
- Peso de Home.
- Sueño.
- Progreso antropométrico.
- Rutinas ya validadas.
- Colores globales y tipografías.
