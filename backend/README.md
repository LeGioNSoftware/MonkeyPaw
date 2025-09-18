Wisher Backend (Postgres + JWT prototype)
----------------------------------------
Requirements:
- PostgreSQL database (local or managed). Set env DATABASE_URL, e.g.:
  postgresql+asyncpg://postgres:password@db-host:5432/wisher

Quickstart (local, simple):
1) Create a Postgres DB and export DATABASE_URL environment variable.
2) python -m venv venv
3) source venv/bin/activate
4) pip install -r requirements.txt
5) uvicorn main:app --reload --port 8000

Notes:
- This prototype uses SQLModel for models and persists lobbies, players and rounds.
- Authentication: when joining a lobby the server returns a JWT token. Use ?token=... when opening the websocket to reconnect.
- The server runs a background lobby loop to auto-advance rounds in simple timeout conditions.