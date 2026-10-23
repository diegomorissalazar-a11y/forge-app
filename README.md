MELQART 2.1.3 — base 2.1.2

Importador de carrera: acepta distancia_km, tiempo, duracion_segundos y campos en español, manteniendo el formato inglés previo. Los campos explícitos en segundos tienen prioridad sobre el texto del tiempo. tiempo es duración; hora es hora de inicio. Acepta coma decimal en distancia. Rechaza distancia/duración inválidas antes de modificar datos. Conserva observaciones, FC, calorías, pasos y elevación; no usa la distancia descartada mencionada en observaciones.

Farmer Carry conserva kg + segundos de 2.1.2. Auditoría reproducible y pruebas en audits/. No validado con Firebase real ni dispositivo iPhone.
