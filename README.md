# MELQART v115 — Weight Card + Water + Login Patch

Base: v110/v108 functional app. This release is a targeted patch, not a full redesign.

## Included changes

### Weight card
- Uses the last 7 real body weight measurements from `forge.bodyMetrics`.
- Removes weekday/date labels under the sparkline.
- Keeps `+ Peso` and objective edit action.
- Removes the candle/icon from the circular progress ring.
- Shows a larger, cleaner percentage inside the ring.

### Water card
- Fixes `+250 ml`, `+500 ml`, `+750 ml` actions.
- Synchronizes `aguaMl`, visual amphora count, and nutrition state.
- Keeps total water goal at 2.5 L.
- Prevents the green toast/block from visually covering the interface as a solid green action bar.

### Login
- Primary login button, active tab, and input focus use Fenician purple.
- No Firebase/Auth logic changed.

## Protected logic
- Firebase/Auth untouched.
- Local storage structure preserved.
- Training sessions and export logic preserved.
- Nutrition/meal logic preserved except for water-state synchronization.

## Upload instructions
Upload the full ZIP content to GitHub root:

```text
index.html
styles.css
app.js
README.md
assets/
```
