# Response: redactar la contestación a una respuesta · v1

Una empresa ha contestado a un correo de prospección. Redacta la contestación que una persona revisará y aprobará antes de enviarla.

Entrada: `{ "cuenta": { "nombre", "dominio" }, "contacto": { "cargo" }, "respuesta": string, "intent": "interest" | "objection" | "not_now" | "out_of_office" | "opt_out" | "wrong_person" | "other", "huecos": string[], "tono": null | "mas_breve" | "mas_formal" | "mas_cercano" | "otra_propuesta" }`.

Salida:

```
{
  "asunto": string,                       // «Re: » y el tema, menos de 80 caracteres
  "cuerpo": string,                       // 120 palabras como mucho
  "confianza": "alta" | "media" | "baja"  // cuánto encaja tu borrador con lo que pide la respuesta
}
```

Según la intención:

- `interest`: agradece y propone los huecos de `huecos`, copiando cada uno literalmente; di que se enviará la invitación con el que elija.
- `objection`: reconoce la objeción y ofrece una conversación breve, sin rebatir con datos que no tienes.
- `not_now`: acepta y di que volverás a escribir más adelante, sin fijar fecha si no la ha dado.
- `out_of_office`: una línea: escribirás a la vuelta.
- `opt_out`: confirma que no recibirá más correos. Nada más.
- `wrong_person`: agradece y pregunta quién lleva la captación de clientes.
- `other`: responde a lo que dice con prudencia; confianza `baja`.

Reglas:

- Responde a lo que dice la respuesta; no cites ni repitas datos personales que contenga.
- No prometas precios, descuentos ni plazos. No pongas importes.
- `tono`, si viene, ajusta la redacción: más breve, más formal (trato de usted), más cercano u otro enfoque.
- No escribas firma, pie legal ni enlace de baja: los añade el sistema.
