# MELQART v97 Fast

Versión ordenada y optimizada para GitHub Pages.

## Estructura

- `index.html`: estructura HTML y pantallas originales.
- `styles.css`: sistema visual MELQART v97, paleta fenicia y componentes.
- `app.js`: lógica original de la app, sin capa visual dinámica pesada.
- `assets/melqart_app_icon.png`: icono de app.
- `assets/brand/melqart_mark.svg`: isotipo liviano para header/login.
- `assets/brand/melqart_wordmark.svg`: wordmark de referencia.
- `assets/brand/melqart_tokens.json`: tokens de diseño.

## Rendimiento

Esta versión elimina la causa probable del congelamiento de v96:

- sin `MutationObserver` global;
- sin normalización de emojis en runtime;
- sin imágenes grandes cargadas por la app;
- marca y paleta aplicadas de forma estática;
- Firebase, localStorage y lógica base conservados.

## Subida a GitHub

Sube todo el contenido de esta carpeta a la raíz del repo. `index.html`, `styles.css`, `app.js` y `assets/` deben quedar al mismo nivel.


## v98 fix
- Firebase SDK imports restored in `index.html`.
- `app.js` restored as external script.
- Home intro brand block added.
- Fixed broken `apple-touch-icon` tag.


## v99
- Wordmark limpio aplicado en login y header.
- Mejoras de login y mensajes de error.
- Persistencia local activada.
