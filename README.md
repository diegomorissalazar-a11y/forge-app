# MELQART v96 — versión ordenada

Esta versión separa la app en archivos más flexibles:

```text
index.html
styles.css
app.js
assets/
  melqart_app_icon.png
  brand/
    melqart_mark.svg
    melqart_wordmark.svg
    melqart_tokens.json
  screens/
    referencias visuales y banco de imágenes
```

## Cómo subir a GitHub Pages

1. Haz respaldo de tu versión actual.
2. Sube todo el contenido de esta carpeta a la raíz del repositorio.
3. Asegúrate de que `index.html`, `styles.css`, `app.js` y la carpeta `assets/` queden al mismo nivel.
4. Commit y push.
5. Abre tu URL de GitHub Pages.

## Dónde editar el sistema visual

- Colores: `styles.css` → variables `:root`.
- Logo/header/login: `app.js` → bloque `MQ_MARK`, `headerBrand()` y `authBrand()`.
- Icono app/favicon: `assets/melqart_app_icon.png`.
- Tokens para Figma/manual: `assets/brand/melqart_tokens.json`.

## Nota

La lógica original de Firebase, localStorage, navegación y datos fue conservada. Esta separación busca facilitar mantenimiento sin reescribir la app desde cero.
