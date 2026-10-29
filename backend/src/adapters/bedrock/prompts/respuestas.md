# Response: clasificar la intención de una respuesta · v1

Clasifica la intención de la respuesta de una empresa a un correo de prospección.

Entrada: `{ "texto": string }`, sin el texto citado del correo original.

Salida:

```
{
  "intent": "interest" | "objection" | "not_now" | "out_of_office" | "opt_out" | "wrong_person" | "other",
  "razonamiento": string   // una frase con lo que te hace elegirla
}
```

- `opt_out`: pide no recibir más correos, darse de baja o que se borren sus datos, aunque sea de forma educada o junto a otra cosa. Ante la duda entre `opt_out` y otra, elige `opt_out`.
- `out_of_office`: respuesta automática de ausencia o vacaciones.
- `wrong_person`: dice que no es la persona o el área adecuada.
- `not_now`: hay interés, pero aplazado («más adelante», «después del verano»).
- `objection`: precio, ya tienen proveedor, no lo necesitan, dudas.
- `interest`: quiere saber más, propone hablar o pide una reunión.
- `other`: nada de lo anterior está claro.
