import os
import asyncio
import uuid
import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlmodel import SQLModel, Field, Session, create_engine, select, Column, JSON, Boolean
from jose import JWTError, jwt
from passlib.context import CryptContext

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/wisher")
# For SQLModel async support we'll use create_engine sync for simplicity in the prototype (blocking DB ops are acceptable for demo)
engine = create_engine(str(DATABASE_URL).replace('+asyncpg',''), echo=False)

SECRET_KEY = os.getenv("SECRET_KEY", "supersecret-wisher")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60*24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Wisher Backend (Postgres & JWT prototype)")

# --- Models ---
class Lobby(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    password_hash: str
    settings: Dict[str, Any] = Field(default_factory=lambda: {"timer_seconds":60,"score_goal":5})
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_public: bool = True

class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lobby_id: int = Field(index=True)
    username: str
    player_uuid: str = Field(sa_column=Column("player_uuid", JSON))
    score: int = 0
    is_connected: bool = True
    is_spectator: bool = False
    last_seen: Optional[datetime] = None

class Round(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lobby_id: int = Field(index=True)
    number: int = 0
    wisher_player_id: Optional[int] = None
    wish_text: Optional[str] = None
    submissions: Dict[str,str] = Field(default_factory=dict)  # player_uuid -> text
    votes: Dict[str,str] = Field(default_factory=dict)        # voter_uuid -> target_uuid
    finished: bool = False

# --- DB helpers ---
def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    return Session(engine)

# --- Auth helpers ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire.isoformat()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_password_hash(password):
    return pwd_context.hash(password)

# --- In-memory runtime state ---
# Map lobby_name -> { client_id: websocket, player_uuid -> client_id }
runtime: Dict[str, Dict[str, Any]] = {}
lobby_tasks: Dict[str, asyncio.Task] = {}

# --- Schemas ---
class CreateLobbyIn(BaseModel):
    lobby_name: str
    password: str
    is_public: bool = True

class JoinLobbyIn(BaseModel):
    lobby_name: str
    password: str
    username: str
    spectator: bool = False

@app.on_event("startup")
async def startup():
    init_db()

@app.post("/create_lobby")
async def create_lobby(payload: CreateLobbyIn):
    with get_session() as session:
        existing = session.exec(select(Lobby).where(Lobby.name == payload.lobby_name)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Lobby exists")
        lobby = Lobby(name=payload.lobby_name, password_hash=get_password_hash(payload.password), is_public=payload.is_public)
        session.add(lobby)
        session.commit()
        session.refresh(lobby)
    return {"ok": True, "lobby": {"id": lobby.id, "name": lobby.name}}

@app.post("/join_lobby")
async def join_lobby(payload: JoinLobbyIn):
    with get_session() as session:
        lobby = session.exec(select(Lobby).where(Lobby.name == payload.lobby_name)).first()
        if not lobby or not verify_password(payload.password, lobby.password_hash):
            raise HTTPException(status_code=403, detail="Lobby not found or wrong password")
        # create player
        p_uuid = str(uuid.uuid4())
        player = Player(lobby_id=lobby.id, username=payload.username, player_uuid=p_uuid, is_spectator=payload.spectator, last_seen=datetime.utcnow())
        session.add(player); session.commit(); session.refresh(player)
        token = create_access_token({"player_id": player.id, "player_uuid": p_uuid, "lobby_id": lobby.id, "username": payload.username})
        return {"ok": True, "token": token, "player": {"id": player.id, "username": player.username, "player_uuid": p_uuid}}

@app.get("/lobbies")
async def list_lobbies():
    with get_session() as session:
        rows = session.exec(select(Lobby).where(Lobby.is_public==True)).all()
        return {"lobbies": [{"id":r.id,"name":r.name,"created_at":r.created_at.isoformat()} for r in rows]}

# WebSocket with token for reconnects
@app.websocket("/ws/{lobby_name}")
async def ws_endpoint(websocket: WebSocket, lobby_name: str, token: Optional[str] = None):
    await websocket.accept()
    try:
        # token must be in query param ?token=...
        query = dict(websocket._headers) if hasattr(websocket, "_headers") else {}
    except Exception:
        query = {}
    # Expect token as query parameter
    qs = dict(websocket._query_params)
    token = qs.get("token") or token
    if not token:
        await websocket.send_json({"type":"error","detail":"auth_required"})
        await websocket.close()
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        await websocket.send_json({"type":"error","detail":"invalid_token"})
        await websocket.close()
        return
    player_id = payload.get("player_id"); player_uuid = payload.get("player_uuid"); username = payload.get("username"); lobby_id = payload.get("lobby_id")
    # Validate lobby exists
    with get_session() as session:
        lobby_row = session.get(Lobby, lobby_id)
        if not lobby_row or lobby_row.name != lobby_name:
            await websocket.send_json({"type":"error","detail":"lobby_mismatch"})
            await websocket.close()
            return
        player = session.exec(select(Player).where(Player.player_uuid==player_uuid)).first()
        if not player:
            await websocket.send_json({"type":"error","detail":"player_not_found"})
            await websocket.close()
            return
        # mark connected and update last seen
        player.is_connected = True
        player.last_seen = datetime.utcnow()
        session.add(player); session.commit()

    # register runtime
    if lobby_name not in runtime:
        runtime[lobby_name] = {"clients": {}, "player_map": {}}
    client_id = str(uuid.uuid4())
    runtime[lobby_name]["clients"][client_id] = websocket
    runtime[lobby_name]["player_map"][player_uuid] = client_id

    # ensure lobby task exists
    if lobby_name not in lobby_tasks:
        lobby_tasks[lobby_name] = asyncio.create_task(lobby_loop(lobby_name))

    # broadcast updated players list
    await broadcast_players(lobby_name)

    await websocket.send_json({"type":"connected","player_uuid":player_uuid,"client_id":client_id})

    try:
        while True:
            data = await websocket.receive_text()
            obj = json.loads(data)
            typ = obj.get("type")
            if typ == "set_settings":
                settings = obj.get("settings",{})
                with get_session() as session:
                    lobby_row = session.exec(select(Lobby).where(Lobby.name==lobby_name)).first()
                    if lobby_row:
                        lobby_row.settings.update(settings)
                        session.add(lobby_row); session.commit()
                        await broadcast(lobby_name, {"type":"settings_update","settings":lobby_row.settings})
            elif typ == "start_game":
                # create first round and assign wisher order deterministically
                with get_session() as session:
                    players = session.exec(select(Player).where(Player.lobby_id==lobby_row.id, Player.is_spectator==False)).all()
                    # create initial round
                    r = Round(lobby_id=lobby_row.id, number=1, wisher_player_id=players[0].id if players else None)
                    session.add(r); session.commit(); session.refresh(r)
                await broadcast(lobby_name, {"type":"game_started","round": round_to_dict(r)})
            elif typ == "submit_wish":
                # only current wisher allowed
                token_player_uuid = player_uuid
                wish = obj.get("wish")
                with get_session() as session:
                    r = session.exec(select(Round).where(Round.lobby_id==lobby_row.id, Round.finished==False).order_by(Round.number.desc())).first()
                    if not r or r.wisher_player_id is None:
                        await websocket.send_json({"type":"error","detail":"no_active_round"})
                        continue
                    # verify the wisher matches player_id
                    current_wisher = session.get(Player, r.wisher_player_id)
                    if current_wisher.player_uuid != token_player_uuid:
                        await websocket.send_json({"type":"error","detail":"not_wisher"})
                        continue
                    r.wish_text = wish
                    session.add(r); session.commit()
                await broadcast(lobby_name, {"type":"wish_set","wish": wish})
            elif typ == "submit_consequence":
                puuid = obj.get("player_uuid"); text = obj.get("text")
                with get_session() as session:
                    r = session.exec(select(Round).where(Round.lobby_id==lobby_row.id, Round.finished==False).order_by(Round.number.desc())).first()
                    if not r:
                        continue
                    r.submissions.update({puuid: text})
                    session.add(r); session.commit()
                await broadcast(lobby_name, {"type":"submissions_update","submissions": r.submissions})
            elif typ == "vote":
                voter = obj.get("voter_uuid"); target = obj.get("target_uuid")
                with get_session() as session:
                    r = session.exec(select(Round).where(Round.lobby_id==lobby_row.id, Round.finished==False).order_by(Round.number.desc())).first()
                    if not r: continue
                    r.votes.update({voter: target})
                    session.add(r); session.commit()
                await broadcast(lobby_name, {"type":"votes_update","votes": r.votes})
                # auto-tally if all non-wisher players voted
                with get_session() as session:
                    r = session.exec(select(Round).where(Round.lobby_id==lobby_row.id, Round.finished==False).order_by(Round.number.desc())).first()
                    players = session.exec(select(Player).where(Player.lobby_id==lobby_row.id, Player.is_spectator==False)).all()
                    expected = len([p for p in players if p.player_uuid != session.get(Player, r.wisher_player_id).player_uuid])
                    if len(r.votes) >= expected:
                        await tally_and_finish_round(lobby_row.id, r.id)
            else:
                await websocket.send_json({"type":"error","detail":"unknown_command"})
    except WebSocketDisconnect:
        # mark disconnected
        with get_session() as session:
            p = session.exec(select(Player).where(Player.player_uuid==player_uuid)).first()
            if p:
                p.is_connected = False; p.last_seen = datetime.utcnow()
                session.add(p); session.commit()
        # remove runtime mapping
        runtime[lobby_name]["clients"].pop(client_id, None)
        runtime[lobby_name]["player_map"].pop(player_uuid, None)
        await broadcast_players(lobby_name)
    except Exception as e:
        # on error, clean up
        runtime[lobby_name]["clients"].pop(client_id, None)
        runtime[lobby_name]["player_map"].pop(player_uuid, None)
        await broadcast_players(lobby_name)

# --- Helper funcs ---
async def broadcast(lobby_name: str, message: Dict):
    clients = runtime.get(lobby_name, {}).get("clients", {})
    to_remove = []
    for cid, ws in list(clients.items()):
        try:
            await ws.send_json(message)
        except Exception:
            to_remove.append(cid)
    for cid in to_remove:
        runtime[lobby_name]["clients"].pop(cid, None)

async def broadcast_players(lobby_name: str):
    with get_session() as session:
        lobby = session.exec(select(Lobby).where(Lobby.name==lobby_name)).first()
        if not lobby: return
        players = session.exec(select(Player).where(Player.lobby_id==lobby.id)).all()
        pl = [{"username":p.username,"player_uuid":p.player_uuid,"score":p.score,"connected":p.is_connected,"spectator":p.is_spectator} for p in players]
        await broadcast(lobby_name, {"type":"players_update","players": pl})

def round_to_dict(r: Round):
    return {"id": r.id, "number": r.number, "wisher_player_id": r.wisher_player_id, "wish_text": r.wish_text, "submissions": r.submissions, "votes": r.votes, "finished": r.finished}

async def tally_and_finish_round(lobby_id: int, round_id: int):
    with get_session() as session:
        r = session.get(Round, round_id)
        if not r: return
        tally = {}
        for v in r.votes.values():
            tally[v] = tally.get(v,0) + 1
        max_votes = max(tally.values()) if tally else 0
        winners = [pid for pid,c in tally.items() if c==max_votes]
        # get wisher vote if exists
        wisher = session.get(Player, r.wisher_player_id)
        wisher_vote = r.votes.get(wisher.player_uuid) if wisher else None
        winner_uuid = None
        if len(winners)==1:
            winner_uuid = winners[0]
        else:
            if wisher_vote in winners:
                winner_uuid = wisher_vote
            else:
                winner_uuid = winners[0] if winners else None
        # award point
        if winner_uuid:
            pl = session.exec(select(Player).where(Player.player_uuid==winner_uuid)).first()
            if pl:
                pl.score = (pl.score or 0) + 1
                session.add(pl)
        r.finished = True
        session.add(r); session.commit()
        # create next round
        players = session.exec(select(Player).where(Player.lobby_id==lobby_id, Player.is_spectator==False)).all()
        # rotate wisher: find index of current wisher and move to next
        next_wisher = None
        if players:
            uuids = [p.player_uuid for p in players]
            try:
                idx = uuids.index(wisher.player_uuid) if wisher else 0
                next_wisher = players[(idx+1)%len(players)].id
            except Exception:
                next_wisher = players[0].id
        new_round = Round(lobby_id=lobby_id, number=(r.number+1), wisher_player_id=next_wisher)
        session.add(new_round); session.commit(); session.refresh(new_round)
        # broadcast round end and players (scores updated)
        pl = session.exec(select(Player).where(Player.lobby_id==lobby_id)).all()
        await broadcast_by_lobbyname(lobby_id, {"type":"round_end","winner_uuid": winner_uuid, "tally": tally, "next_round": round_to_dict(new_round), "players":[{"username":p.username,"player_uuid":p.player_uuid,"score":p.score} for p in pl]})

async def broadcast_by_lobbyname(lobby_id:int, message: Dict):
    with get_session() as session:
        lobby = session.get(Lobby, lobby_id)
        if not lobby: return
    await broadcast(lobby.name, message)

# Server-side lobby loop to monitor timers and advance rounds if needed
async def lobby_loop(lobby_name: str):
    while True:
        try:
            await asyncio.sleep(1)
            # for each active lobby, check current round state and timers
            with get_session() as session:
                lobby = session.exec(select(Lobby).where(Lobby.name==lobby_name)).first()
                if not lobby:
                    await asyncio.sleep(5); continue
                r = session.exec(select(Round).where(Round.lobby_id==lobby.id, Round.finished==False).order_by(Round.number.desc())).first()
                if not r:
                    continue
                # simple policy: if wish not set for > timer_seconds since round creation, skip and advance
                # (we don't store creation time per round in this prototype; we'll use player last_seen heuristics)
                settings = lobby.settings or {}
                timeout = settings.get("timer_seconds", 60)
                # if submissions incomplete for long time, auto-finish by tallying existing votes/submissions
                # Count active non-spectator players
                players = session.exec(select(Player).where(Player.lobby_id==lobby.id, Player.is_spectator==False)).all()
                expected_subs = len([p for p in players if p.player_uuid != session.get(Player, r.wisher_player_id).player_uuid]) if players and r.wisher_player_id else 0
                if len(r.votes) >= expected_subs and expected_subs>0:
                    await tally_and_finish_round(lobby.id, r.id)
        except Exception:
            await asyncio.sleep(1)

# health
@app.get("/health")
async def health():
    return {"ok": True}