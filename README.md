# MELQART v171 — Antropometría completa

## Cambios

- Melqart ahora normaliza y lee `bodyMetrics` / `anthropometry` para datos antropométricos históricos.
- Deduplica por fecha: una fecha = un registro.
- Si la fecha existe, fusiona campos faltantes sin duplicar.
- En `Progreso > Medidas corporales` agrega secciones:
  - Composición corporal
  - Pliegues
  - Perímetros
  - Somatotipo
- Grafica:
  - Peso
  - Grasa %
  - Masa grasa kg
  - Masa muscular %
  - Masa muscular kg
  - IMC
  - Ratio cintura-cadera
  - Suma 6 pliegues
  - Suma 8 pliegues
  - Pliegues individuales
  - Perímetros
  - Endo / Meso / Ecto
- El exportador del Home incluye bloque de antropometría cuando hay datos dentro del rango exportado.

## Script de consola

Incluye archivo:

`melqart_antropometria_console.js`

Uso:

1. Subir esta versión a GitHub.
2. Abrir Melqart.
3. Abrir consola del navegador.
4. Pegar el contenido completo de `melqart_antropometria_console.js`.
5. Presionar Enter.
6. Revisar `Progreso > Medidas corporales`.
7. Si quieres subir a Firebase, usar sincronización normal de la app.

## Registros históricos incluidos

- 06-01-2024
- 03-02-2024
- 06-04-2024
- 01-06-2024
- 03-08-2024
- 19-10-2024
- 21-12-2024
- 01-03-2025

## No se tocó

- Home
- Entrenar
- Beep
- Nutrición diaria
- Agua
- Creatina
- Sueño
- Login
- Firebase/Auth
- Logo
- Colores globales
- Tipografías
