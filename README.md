Wisher — Full release (Postgres, JWT, reconnects, timers, UI, tests)
-----------------------------------------------------------------
What you get:
- backend/: FastAPI app using SQLModel + Postgres to persist lobbies, players and rounds
- frontend/: Next.js + Tailwind frontend with lobby list, lobby UI, spectator support and card-back themes
- tests: basic pytest for backend health endpoint

Quick local setup (dev):
1) Start a Postgres instance (docker):
   docker run --name wisher-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
2) Create a DB: psql -h localhost -U postgres -c "CREATE DATABASE wisher;"
3) Export DATABASE_URL and SECRET_KEY:
   export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/wisher"
   export SECRET_KEY="replace-with-a-secret"
4) Backend:
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
5) Frontend:
   cd frontend
   npm install
   NEXT_PUBLIC_BACKEND=http://localhost:8000 npm run dev
6) Open http://localhost:3000

Deploy hints:
- Backend: Render (Web Service) or Fly.io. Set DATABASE_URL and SECRET_KEY as environment variables.
- Frontend: Vercel. Set NEXT_PUBLIC_BACKEND to backend public URL.

Notes & caveats:
- This is a prototype focusing on requested features; production hardening (rate limiting, input sanitization, migrations, background task robustness) is left as next steps.