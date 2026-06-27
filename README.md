# MELQART v194 — Versión visible corregida

Incluye todo v193:
- Ritmos parciales de carrera.
- Seguridad v192 para no ocultar rutinas/sesiones de jueves.
- Fix duración de trote v189.

Nuevo:
- Corrige el número de versión visible en el menú de usuario.
- Cambia el hardcode v144 por v194.
- Agrega `window.MELQART_VERSION = 'v194'`.
- Agrega `id="um-version"` al indicador de versión.

Validar:
1. Abrir menú de usuario.
2. Debe decir v194, no v144.
3. En consola: `MELQART_VERSION` debe devolver `"v194"`.
