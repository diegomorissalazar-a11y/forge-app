# MELQART v119 — Home plan unificado

Corrige que la Home mostrara plan, KPIs y seguimiento como bloques separados.

## Cambios
- `home-plan-banner` ahora renderiza una tarjeta única `home-plan-unified`.
- `home-stats` y `home-streak-banner` quedan ocultos.
- Mantiene datos funcionales: plan, semana, sesiones de la semana, racha, total y mejor semana.
- Barra de progreso en Púrpura Fenicio `#5B2A86`.

## No tocado
- Firebase/Auth
- Nutrición
- Agua
- Sesiones
- Exportar
- Entrenar


## v122 typography consistency
- Base: v119 home plan unified.
- Preserva la tarjeta de plan unificada.
- No toca layout, colores, textos ni funciones.
- Quita la vela/antorcha del anillo de progreso, dejando solo porcentaje + label.
- Unifica la familia tipográfica en letras y números con Montserrat.
- Números con font-variant-numeric: tabular-nums.
- Firebase/Auth/Nutrición/Agua/Sesiones/Exportar no fueron modificados.
