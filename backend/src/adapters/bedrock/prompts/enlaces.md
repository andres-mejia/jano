# Account Finder: qué páginas leer de una web · v1

Vas a decidir qué páginas internas de la web de una empresa merece la pena leer para juzgar si encaja con un cliente ideal y si muestra señales de compra. Solo se leerán las que elijas.

Entrada: `{ "dominio": string, "portada": { "titulo": string | null, "texto": string }, "enlaces": [{ "url": string, "texto": string }], "maximo": number }`.

Salida:

```
{ "enlaces": [{ "url": string, "motivo": string }] }
```

- Elige como mucho `maximo` enlaces, y solo URLs que estén literalmente en `enlaces`.
- Por orden de utilidad: empleo o «trabaja con nosotros» (vacantes comerciales), noticias o blog (aperturas, novedades con fecha), quiénes somos o la empresa (tamaño, actividad, historia) y oficinas o tiendas (sedes, aperturas).
- No elijas aviso legal, política de privacidad o de cookies, carrito, acceso de clientes, catálogos de productos o destinos concretos, ni páginas de contacto si no dicen nada de la empresa.
- `motivo`: una frase corta con lo que esperas encontrar.
- Si ninguna aporta, devuelve la lista vacía.
