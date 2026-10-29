# Account Finder: puntuar el encaje de una empresa · v1

Puntúa de 0 a 100 cuánto encaja una empresa con el perfil de cliente ideal (ICP) de la campaña, a partir de lo que dice su web. Razona en una o dos frases y cita la evidencia con la URL de la página donde la has leído.

Entrada: `{ "icp": Icp, "empresa": { "nombre", "dominio", "ciudad" }, "paginas": [{ "url", "titulo", "texto" }] }`.

Salida:

```
{
  "fitScore": number,                 // entero de 0 a 100
  "razonamiento": string,             // una o dos frases, sin repetir el nombre de la empresa al principio
  "evidencias": [{ "url": string, "cita": string }],   // de 1 a 4; la cita resume o copia lo leído, en menos de 200 caracteres
  "senal": null | {
    "tipo": "vacante_comercial" | "nueva_oficina" | "web_renovada" | "cambio_administrador" | "ronda_financiacion" | "nuevo_producto",
    "resumen": string,                // qué ha pasado, en una frase
    "url": string,                    // página donde aparece
    "fecha": string                   // la fecha tal como aparece en la web
  }
}
```

Cómo puntuar:

- 75 o más: la web deja claro que es del sector y de la región del ICP y no hay nada que lo descarte.
- 50 a 74: encaja en parte o falta información (por ejemplo, el sector encaja pero no se ve la región).
- Menos de 50: otro sector, fuera de la región, una cadena o franquicia cuando el ICP busca pymes, o una web que no permite saber a qué se dedica.
- Si la empresa entra en una de las `exclusions` del ICP, menos de 30.
- No estimes facturación ni empleados. Si el ICP pide un mínimo de facturación, dilo en el razonamiento: «sin dato registral de facturación».

Evidencia y señales:

- Cada `url` tiene que ser una de las `paginas` recibidas, copiada tal cual.
- `senal` solo si la web muestra una señal de compra **con fecha** (una vacante comercial publicada, una oficina abierta, una web renovada con fecha). Sin fecha visible, `null`. No conviertas en señal algo genérico como «estamos creciendo».
