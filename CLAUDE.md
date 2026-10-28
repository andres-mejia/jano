@AGENTS.md

# Claude Code en Jano

Adaptador de `AGENTS.md`: dice cómo se ejecuta aquí con Claude Code y no añade normas.

## Arranque de sesión

1. `git pull --rebase origin main`.
2. Identidad antes del primer commit: `git config user.name "Andrés Mejía"` y `git config user.email "49398769+andres-mejia@users.noreply.github.com"`. La identidad `Claude <noreply@anthropic.com>` del contenedor no se usa, ni para que una firma verifique.
3. Lee los PR abiertos y los issues con `espera:andres`.
4. Lee el ADR y el contrato del dominio que vayas a tocar.

## Git

- Rama por tarea: `feat/<objeto>`, `fix/<objeto>`, `docs/<objeto>`, `infra/<objeto>`.
- `scripts/check-ai-attribution.sh --commits origin/main..HEAD` antes de pedir el OK de push.
- Parada obligatoria antes de `git push` o `gh pr create`: rama, ficheros, mensaje y validaciones, y se espera a Andrés.

## Comandos

```bash
pnpm install                      # raíz del monorepo (workspace)
pnpm type-check                   # tsc en app, landing y packages; lo que bloquea el merge
pnpm build                        # replica lo que construye Amplify
pnpm dev:web                      # landing en http://localhost:4321
pnpm dev:app                      # app en http://localhost:3000 (modo mock sin Cognito)
terraform -chdir=infra/environments/dev fmt -check -recursive
```

## Skills

- `frontend-design` y similares asisten con técnica; los tokens, tipografía y marca los fija `AGENTS.md` §5 y `docs/producto/`.
- Antes de tocar UI, mira las pantallas de referencia en `docs/producto/jano-borrador-de-producto.pdf`.

## Límites del entorno

- AWS solo desde CI (OIDC) o desde el perfil SSO de Andrés. Una sesión sin credenciales escribe Terraform pero no lo aplica.
- No se cambia de identidad git por un hook del entorno.
