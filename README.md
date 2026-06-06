# MELQART v175 — Antropometría completa histórica + exportador

## Cambios aplicados

- Se agrega migración interna con la serie oficial de informes antropométricos.
- Se cargan/fusionan 8 fechas antropométricas únicas:
  - 2024-01-06
  - 2024-02-03
  - 2024-04-06
  - 2024-06-01
  - 2024-08-03
  - 2024-10-19
  - 2024-12-21
  - 2025-03-01
- No se duplican fechas: si una fecha ya existe, se completa/corrige con los campos oficiales.
- Progreso > Medidas corporales ahora debe graficar:
  - composición corporal;
  - pliegues y sumatorias 6/8;
  - perímetros;
  - somatotipo.
- Exportador histórico incluye antropometría completa.
- Se incluye `melqart_antropometria_console.js` como respaldo para forzar la carga desde consola si alguna caché/sync deja datos antiguos.

## Validación técnica

- `node --check app.js` ejecutado correctamente.
- `node --check melqart_antropometria_console.js` ejecutado correctamente.

## Qué NO se tocó

- Home
- Entrenar
- Nutrición
- Agua
- Creatina
- Sueño
- Peso semanal
- Login
- Firebase/Auth
- Colores globales
- Tipografías
- Logo

## Instrucciones de prueba

1. Subir el ZIP a GitHub Pages.
2. Abrir con URL cache-busting, por ejemplo `?v=175`.
3. Entrar a Progreso > Medidas corporales.
4. Revisar que las secciones tengan datos:
   - Composición corporal
   - Pliegues
   - Perímetros
   - Somatotipo
5. Exportar historial completo y validar que aparezca la sección ANTROPOMETRÍA.

Si no aparecen los 8 registros por caché o sincronización, pegar el contenido de `melqart_antropometria_console.js` en consola con la app abierta y recargar.
