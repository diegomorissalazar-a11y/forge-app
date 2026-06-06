# MELQART v174 — Legacy nutrition plate recalculation

## Cambios aplicados

- Ajusta el cálculo histórico de nutrición cuando los días tienen platos/comidas marcadas.
- Cada plato completado ahora abona porciones según la pauta definida para Melqart.
- Mantiene la jerarquía de cálculo:
  1. Si existe detalle interpretable de alimentos/cantidades, se calcula por equivalencias oficiales.
  2. Si no existe detalle, se usa la plantilla del plato completado.
- Corrige el subconteo de proteína en días completos.
- Mantiene el fix de v173: equivalencias oficiales hacia adelante, comidas rápidas y cambio de Tren Inferior B.

## Plantillas por plato

1. Desayuno: 3 proteínas + 1 lácteo protein + 1 fruta + 0.5 cereal + 0.5 lípidos.
2. Fruta: 1 fruta.
3. Almuerzo: 4 proteínas + 2 cereales.
4. Leche protein: 1 lácteo protein.
5. Huevos duros: 3 proteínas, usando 1 huevo = 1.5 porciones.
6. Leche descremada: 1 lácteo descremado.
7. Cena: 3 proteínas + 2 cereales + 2 verduras.

## Validaciones

- `node --check app.js` ejecutado correctamente.
- No se modificaron módulos de Entrenar, Peso, Progreso, Agua, Creatina, Sueño, Login, Firebase/Auth, logo, colores globales ni tipografías.
