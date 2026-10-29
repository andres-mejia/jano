// Placeholder de las rutas del contrato hasta que 003 despliegue el backend:
// responde 501 para que el autorizador JWT se pueda probar extremo a extremo.
export const handler = async (event) => ({
  statusCode: 501,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ error: "not_implemented", route: event.routeKey }),
});
