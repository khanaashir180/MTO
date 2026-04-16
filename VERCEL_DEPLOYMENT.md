# Vercel Frontend Deployment

Use Vercel for the React/Vite frontend. Use Railway for the backend API and PostgreSQL.

## Project Settings

Import the GitHub repo:

```text
khanaashir180/MTO
```

Use these settings:

```text
Framework Preset: Vite
Root Directory: .
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

The repo includes `vercel.json`, so Vercel can read these settings automatically.

## Environment Variables

Add these in Vercel project settings for Production and Preview:

```env
VITE_API_URL=https://your-railway-backend.up.railway.app/api
VITE_SOCKET_URL=https://your-railway-backend.up.railway.app
```

Replace `your-railway-backend.up.railway.app` with the real Railway backend domain.

Vite only exposes browser environment variables when they start with `VITE_`.
Do not put secrets in Vercel frontend variables.

## Backend CORS

After Vercel gives you a frontend URL, set Railway backend:

```env
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
```

Then redeploy the Railway backend.

## SPA Routing

`vercel.json` includes a rewrite to send browser routes back to `index.html`.
This prevents refresh errors on client-side pages.

## Deploy Flow

1. Push to GitHub `main`.
2. Vercel builds the frontend automatically.
3. Railway deploys the backend separately.
4. Confirm:

```text
https://your-vercel-app.vercel.app
```

5. Test login with a real pilot user.

## Official References

- Vercel Vite docs: https://vercel.com/docs/frameworks/vite
- Vercel rewrites docs: https://vercel.com/docs/rewrites
- Vercel environment variables docs: https://vercel.com/docs/environment-variables

