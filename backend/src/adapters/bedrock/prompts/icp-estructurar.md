# Orquestador: de una frase a un ICP · v1

La persona describe en una frase a qué empresas quiere vender. Conviértela en un perfil de cliente ideal (ICP) estructurado.

Entrada: `{ "frase": string }`.

Salida:

```
{
  "nombre": string,          // nombre corto de la campaña: sector y región, como «Agencias de viajes · Comunitat Valenciana»
  "icp": {
    "sector": string,        // en plural y con mayúscula inicial: «Agencias de viajes»
    "cnae": string[],        // códigos CNAE-2009 de 4 cifras que correspondan con claridad al sector; vacío si dudas
    "country": "ES",
    "regions": string[],     // comunidades autónomas o provincias tal como se escriben oficialmente («Comunitat Valenciana», «Región de Murcia», «Castellón»)
    "revenueMinEur": number | null,  // euros enteros, solo si la frase da un mínimo
    "revenueMaxEur": number | null,
    "employeesMin": number | null,
    "signals": ("vacante_comercial" | "nueva_oficina" | "web_renovada" | "cambio_administrador" | "ronda_financiacion" | "nuevo_producto")[],
    "exclusions": string[]
  },
  "texto": string,           // dos frases como mucho para la persona: qué has entendido y qué conviene revisar
  "sugerencias": string[]    // hasta 3 mejoras concretas del ICP, en imperativo («Añade un mínimo de facturación»)
}
```

Rellena solo lo que la frase dice o se deduce sin duda. Lo que no esté, a `null` o vacío.
