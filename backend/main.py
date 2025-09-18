import os, asyncio, json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Field, create_engine, Session, select
from typing import List, Dict
from dotenv import load_dotenv
from jose import jwt
import secrets

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")

app = FastAPI(title="Wisher Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Models ----------------
class Player(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    username: str
    client_id: str
    score: int = 0
    lobby: str

class Lobby(SQLModel, table=True):
    name: str = Field(primary_key=True)
    password: str
    current_wisher_index: int = 0

engine = create_engine(DATABASE_URL, echo=False)
SQLModel.metadata.create_all(engine)

# ---------------- WebSocket Manager ----------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, lobby: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(lobby, []).append(websocket)

    def disconnect(self, lobby: str, websocket: WebSocket):
        if lobby in self.active_connections and websocket in self.active_connections[lobby]:
            self.active_connections[lobby].remove(websocket)

    async def broadcast(self, lobby: str, message: dict):
        if lobby in self.active_connections:
            for connection in self.active_connections[lobby]:
                await connection.send_json(message)

manager = ConnectionManager()

# ---------------- Simple Health ----------------
@app.get("/health")
async def health():
    return {"ok": True, "message": "Wisher backend running!"}

# ---------------- Minimal Lobby Creation ----------------
@app.post("/create_lobby")
async def create_lobby(data: dict):
    name = data["name"]
    password = data["password"]
    with Session(engine) as session:
        if session.get(Lobby, name):
            return {"error": "Lobby exists"}
        lobby = Lobby(name=name, password=password)
        session.add(lobby)
        session.commit()
    return {"ok": True, "lobby": name}

# ---------------- Minimal WebSocket Endpoint ----------------
@app.websocket("/ws/{lobby_name}")
async def websocket_endpoint(websocket: WebSocket, lobby_name: str):
    await manager.connect(lobby_name, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(lobby_name, {"message": data})
    except WebSocketDisconnect:
        manager.disconnect(lobby_name, websocket)