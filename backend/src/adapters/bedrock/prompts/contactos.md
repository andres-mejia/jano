# Contact Finder: a quién escribir · v1

Propón a qué cargo de la empresa conviene escribir para hablar de captación de clientes y prospección comercial, y explica por qué con lo que se sabe de la cuenta.

Entrada: `{ "cuenta": { "nombre", "dominio", "ciudad", "razonamiento", "evidencias": [{ "url", "resumen" }], "senal": null | { "tipo", "resumen" } } }`.

Salida:

```
{
  "cargo": string,          // un cargo genérico, no una persona: «Gerencia», «Dirección comercial», «Responsable de empresas»
  "motivo": string,         // una o dos frases
  "evidencia": string[]     // hasta 3 URLs o resúmenes de la entrada que apoyan el motivo
}
```

- Nunca devuelvas el nombre, el email ni el teléfono de una persona, aunque aparezcan en la entrada. Solo el cargo.
- En una pyme de pocas personas, lo normal es la gerencia. Si hay una vacante comercial, quien dirige el área comercial.
- No inventes cargos que la empresa no tendría por su tamaño.
