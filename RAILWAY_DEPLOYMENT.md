# Railway Pilot Deployment

This project can use Railway for the backend API and PostgreSQL database.
For the frontend, use Vercel from the repo root unless you intentionally create a second Railway service for the Vite app.

## Recommended Pilot Layout

- Railway service 1: PostgreSQL
- Railway service 2: backend API from `/server`
- Vercel: frontend from repo root

## Railway Backend Setup

1. Create a Railway project.
2. Add a PostgreSQL database service.
3. Add a GitHub-backed service from `khanaashir180/MTO`.
4. Set the backend service root directory to:

```text
/server
```

5. Railway will use `server/railway.json` and `server/Dockerfile`.
6. Add backend variables from `server/.env.railway.example`.

Important values:

```env
CLIENT_ORIGIN=https://your-frontend-domain.vercel.app
JWT_SECRET=use-a-real-long-random-secret
DATABASE_URL=${{Postgres.DATABASE_URL}}
METRICS_TOKEN=use-a-real-long-random-secret
UPLOAD_DIR=/app/uploads
```

The backend Dockerfile runs migrations before starting the server:

```bash
npm run migrate && npm run start
```

## Seed Pilot Users

After the first successful backend deploy, open a Railway shell for the backend service and run:

```bash
npm run seed
```

For real team testing, create individual named users after login instead of sharing seeded accounts.

## Vercel Frontend Setup

1. Import the same GitHub repo into Vercel.
2. Use the repo root as the project root.
3. Build command:

```bash
npm run build
```

4. Output directory:

```text
dist
```

5. Add frontend variables:

```env
VITE_API_URL=https://your-railway-backend.up.railway.app/api
VITE_SOCKET_URL=https://your-railway-backend.up.railway.app
```

6. After Vercel gives you a URL, update Railway backend `CLIENT_ORIGIN` to that exact URL.

## Deployment Checklist

- GitHub repo is private before company pilot.
- Backend deploy is healthy on `/health`.
- Migrations complete successfully.
- Frontend can log in through the Railway API.
- Every tester has their own account.
- Backups are enabled/exported before live testing with real data.

