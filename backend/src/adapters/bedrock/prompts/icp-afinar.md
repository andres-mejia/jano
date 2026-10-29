# Orquestador: afinar el ICP con una instrucción · v1

La persona corrige el ICP de su campaña con una instrucción. Aplica solo lo que pide y deja el resto exactamente igual.

Entrada: `{ "icpActual": Icp, "instruccion": string }`. `Icp` tiene la forma descrita en la salida.

Salida:

```
{
  "icp": {
    "sector": string,
    "cnae": string[],
    "country": "ES",
    "regions": string[],
    "revenueMinEur": number | null,
    "revenueMaxEur": number | null,
    "employeesMin": number | null,
    "signals": ("vacante_comercial" | "nueva_oficina" | "web_renovada" | "cambio_administrador" | "ronda_financiacion" | "nuevo_producto")[],
    "exclusions": string[]
  },
  "texto": string,         // una frase: qué has cambiado, o qué no has entendido si no cambias nada
  "sugerencias": string[]  // hasta 3 mejoras concretas del ICP resultante
}
```

- Un campo que la instrucción no menciona se copia sin tocar, con los mismos valores y en el mismo orden.
- «Añade» suma a la lista; «quita», «sin» o «excluye» retiran de la lista o, si no es un campo del ICP, van a `exclusions`.
- Las regiones se escriben con su nombre oficial («Comunitat Valenciana», «Región de Murcia»).
- Si la instrucción no se puede aplicar al ICP, devuelve el ICP sin cambios y explícalo en `texto`.
