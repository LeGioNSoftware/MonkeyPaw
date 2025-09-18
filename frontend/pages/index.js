import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND || "http://localhost:8000";

export default function Home(){
  const [username,setUsername] = useState("");
  const [lobbyName,setLobbyName] = useState("");
  const [password,setPassword] = useState("");
  const [lobbies,setLobbies] = useState([]);
  const [spectator,setSpectator] = useState(false);
  const router = useRouter();

  useEffect(()=>{ fetch(BACKEND + "/lobbies").then(r=>r.json()).then(j=>setLobbies(j.lobbies||[])); },[]);

  async function createLobby(){
    const res = await fetch(BACKEND + "/create_lobby", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({lobby_name:lobbyName,password})});
    if (res.ok) { alert("Lobby created"); joinLobby(); } else { alert("Failed"); }
  }
  async function joinLobby(){
    const res = await fetch(BACKEND + "/join_lobby", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({lobby_name:lobbyName,password,username, spectator})});
    if (res.ok){ const j = await res.json(); const token = j.token; localStorage.setItem("wisher_token", token); router.push(`/lobby?lobby=${encodeURIComponent(lobbyName)}`); } else { alert("Failed to join"); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-500 p-8 flex items-start">
      <div className="mx-auto w-full max-w-4xl bg-white/10 p-6 rounded-2xl border border-white/20">
        <h1 className="text-4xl font-bold text-white mb-2">Wisher — Cursed Wishes</h1>
        <p className="text-white/80 mb-4">Fancy party card game. Create or join a lobby below.</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input placeholder="Your name" value={username} onChange={e=>setUsername(e.target.value)} className="p-2 rounded" />
              <input placeholder="Lobby name" value={lobbyName} onChange={e=>setLobbyName(e.target.value)} className="p-2 rounded" />
              <input placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="p-2 rounded" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={spectator} onChange={e=>setSpectator(e.target.checked)} /> Join as spectator</label>
            </div>
            <div className="flex gap-2">
              <button onClick={createLobby} className="px-4 py-2 rounded bg-green-500 text-white">Create</button>
              <button onClick={joinLobby} className="px-4 py-2 rounded bg-blue-500 text-white">Join</button>
            </div>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Public Lobbies</h3>
            <ul className="space-y-2 text-sm text-white/90">
              {lobbies.map(l => <li key={l.id} className="bg-white/5 p-2 rounded">{l.name} — created {new Date(l.created_at).toLocaleString()}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}