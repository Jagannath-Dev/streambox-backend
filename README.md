# Streambox Backend

Minimal Fastify + TypeScript shell with clean-architecture folders, central responses/errors, Swagger UI, Docker, and CI/CD.

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Health: http://localhost:3000/health  
- Swagger: http://localhost:3000/docs  

## Layout

```
src/
  domain/           # entities + ports (empty — add next)
  application/      # use-cases (empty — add next)
  infrastructure/   # adapters (empty — add next)
  presentation/     # routes + plugins
  shared/           # env, errors, api-response
```

## Docker

```bash
docker compose up --build api
```
