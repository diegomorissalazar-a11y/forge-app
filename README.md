# MELQART v195 — Ajuste retroactivo nutrición y agua

Incluye todo v194 y agrega:
- Modal para corregir agua y comidas de cualquier fecha.
- Botón "Editar día" en Nutrición > Registro.
- Botón "Corregir ayer" en el card de nutrición del inicio.
- Permite marcar/desmarcar cena, almuerzo y demás comidas.
- Permite editar vasos y ml de agua.
- Recalcula pendientes, allDone, selectedPendingMealId.
- No modifica registros de entrenamiento.
- Actualiza indicador de versión a v195.

Validación:
1. Nutrición > Registro > Editar día.
2. Elegir fecha de ayer o antes de ayer.
3. Marcar Cena y ajustar Agua.
4. Guardar.
5. Ejecutar `mq195NutritionDebug('YYYY-MM-DD')`.
