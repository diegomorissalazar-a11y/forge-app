# MELQART v179 — Fix proteína + ejes gráficos Progreso

## Cambios aplicados

- Corrige cálculo de proteína con regla final: `MAX(proteína por platos completados, proteína por detalle real)`.
- Evita que días `7/7` queden con `Prot 3`; con la pauta cerrada deben quedar en al menos `13 / 12`.
- Mantiene equivalencias cerradas:
  - Scoop proteína = 2 porciones.
  - Leche/yogurt protein = lácteo protein, no suma carnes.
  - Leche descremada = lácteo descremado, no suma carnes.
  - 2 huevos duros = 3 porciones.
  - Almuerzo = 4 porciones.
  - Cena = 4 porciones.
- Corrige heatmap de proteína para usar la proteína final calculada.
- Agrega eje vertical a gráficos de Recuperación.
- Revisa lógica general de gráficos de Progreso para que el mayor valor quede arriba y el menor abajo.
- Corrige ritmo para no invertir escala visual.

## Validaciones

- `node --check app.js` OK.

## No tocado

- Home.
- Entrenar.
- Peso.
- Antropometría.
- Login.
- Firebase/Auth.
- Logo.
- Colores globales.
- Tipografías.
