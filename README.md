MELQART 2.1.13 — base 2.1.12

Corrige envío de propiedades undefined en prescripciones y snapshots. Copia de salida limpia: omite propiedades undefined de objetos, usa null para undefined en arrays conservando índices; mantiene cero,false,null. No muta datos locales. Fechas y tipos nativos SDK se conservan. Detecta ciclos/listas directamente anidadas antes del envío sin transformar silenciosamente estructuras. Se usa en las dos rutas existentes de subida, conservando rutas remotas y política de fotos de cada una. Campos opcionales de nuevas prescripciones usan null.

La captura no muestra el mensaje completo, por lo que la causa exacta en la cuenta no está confirmada. Test_cloud_2.1.13.cjs reproduce rechazo de undefined con un mock estricto y valida la corrección. Resto de regresiones pasa. No cambia límites de tamaño ni reglas de Firebase. Sin validación real iPhone/Firebase.

Auditoría+4 nombres de función,+1 nombre de variable; ninguna función eliminada.
