# MELQART v173 — Protein equivalences + quick meals + plan B update

## Cambios incluidos

1. **Plan de entrenamiento**
   - Miércoles / Tren Inferior B mantiene el reemplazo: `Peso Muerto Rumano` → `Curl Femoral Tumbado`.
   - Lunes / Tren Inferior A queda intacto con `Peso Muerto (Barra)`.

2. **Nutrición: equivalencias oficiales hacia adelante**
   - Proteína se calcula desde cantidades registradas cuando existen gramos, huevos o scoop.
   - Lácteos no suman proteína.
   - Leche descremada cuenta como lácteo descremado.
   - Yogurt/leche protein cuenta como lácteo semidescremado protein.

3. **Registro rápido: comidas rápidas**
   - Agrega combinaciones de pollo, vacuno, tilapia, merluza, reineta, cojinova, salmón y atún.
   - Cada comida rápida registra 200 g de proteína + 2 porciones de cereales.
   - Opciones disponibles con arroz, papas o fideos.

4. **Exportador**
   - Agrega bloque nutricional con proteína objetivo, proteína consumida y % cumplimiento.
   - Agrega detalle del cálculo cuando existe información interpretable.

## Equivalencias implementadas

- Pollo / vacuno / cerdo: 50 g = 1 porción proteína.
- Atún / jurel: 60 g = 1 porción proteína.
- Merluza / tilapia / reineta / congrio / cojinova / salmón: 80 g = 1 porción proteína.
- Camarón: 120 g = 1 porción proteína.
- 1 huevo = 1.5 porciones proteína.
- 1 scoop proteína = 2 porciones proteína.
- 200 ml leche descremada = 1 lácteo descremado.
- Yogurt/leche protein = 1 lácteo semidescremado protein.

## No incluido en esta versión

- Recalculo histórico legacy de días 7/7.
- Corrección masiva histórica sin detalle de alimentos.
- Cambios visuales globales.
- Cambios en Home, sueño, creatina, agua, peso o progreso.

## Validación realizada

- `node --check app.js` aprobado.
