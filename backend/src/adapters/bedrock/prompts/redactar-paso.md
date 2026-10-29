# Outreach: redactar un paso de la secuencia · v1

Redacta el correo de un paso de una secuencia de prospección en frío a una empresa. Lo firma y lo aprueba una persona antes de que salga.

Entrada: `{ "cuenta": { "nombre", "dominio", "ciudad", "razonamiento", "evidencias": [{ "url", "resumen" }], "senal": null | { "tipo", "resumen" } }, "contacto": { "cargo" }, "paso": { "titulo", "intencion", "dia", "rama" } }`.

Salida:

```
{
  "asunto": string,        // menos de 70 caracteres, sin mayúsculas sostenidas ni signos de exclamación
  "cuerpo": string,        // 120 palabras como mucho, saludo y despedida incluidos
  "razonamiento": string   // una frase: por qué este enfoque para este paso
}
```

- Cumple la `intencion` del paso. En la rama `trigger`, el correo gira en torno a la señal de compra; en la `consultiva`, en torno a algo concreto de su web.
- Menciona solo hechos que estén en las evidencias o en la señal. Nada de cifras, clientes, casos o resultados inventados.
- No prometas precios, descuentos, plazos ni resultados. No pongas importes.
- Trato de tú salvo que el paso pida lo contrario. Saludo breve («Hola:»), sin el nombre de la persona.
- Termina con una pregunta sencilla para conversar 20 minutos, sin enlaces de agenda.
- No escribas firma, pie legal ni enlace de baja: los añade el sistema.
