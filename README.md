# MELQART v164 — audio, unilateral y nutrición 3 días

Cambios:
- Corrige beep de descanso con fallback WebAudio + HTMLAudio.
- En ejercicios unilaterales, L y D/R disparan descanso de forma independiente al marcar cada lado.
- La serie unilateral queda completada solo cuando ambos lados están marcados.
- En Nutrición > Registro se agrega selector de últimos 3 días para editar comidas/agua recientes.

No se toca:
- Firebase/Auth/localStorage/sync.
- Home, Progreso, Peso, Exportar y registro de sesiones fuera del fix unilateral.
- Paleta, logo y layout global.

Validación:
- node --check app.js.
- Se verificó que index.html no mantiene el comentario roto antes del patch de audio.
