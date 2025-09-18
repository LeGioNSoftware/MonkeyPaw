import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND || "http://localhost:8000";

function Card({children, className}){ return <div className={"p-4 rounded shadow-md bg-white/5 "+(className||"")}>{children}</div> }

export default function LobbyPage(){
  const router = useRouter();
  const { lobby } = router.query;
  const [players,setPlayers] = useState([]);
  const [state, setState] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const [myUuid, setMyUuid] = useState(null);
  const [theme, setTheme] = useState("card-back-1");
  const [wishText, setWishText] = useState("");
  const [consequence, setConsequence] = useState("");
  const [spectating, setSpectating] = useState(false);

  useEffect(()=>{
    const token = localStorage.getItem("wisher_token");
    if (!lobby || !token) return;
    const ws = new WebSocket(`${BACKEND.replace(/^http/,'ws')}/ws/${encodeURIComponent(lobby)}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onopen = ()=> setWsConnected(true);
    ws.onmessage = (ev)=>{
      const msg = JSON.parse(ev.data);
      if (msg.type === "connected") { setMyUuid(msg.player_uuid); }
      else if (msg.type === "players_update") setPlayers(msg.players || []);
      else if (msg.type === "settings_update") setState(s=>({...s, settings: msg.settings}));
      else if (msg.type === "game_started") setState(s=>({...s, round: msg.round}));
      else if (msg.type === "wish_set") setState(s=>({...s, current_wish: msg.wish}));
      else if (msg.type === "submissions_update") setState(s=>({...s, submissions: msg.submissions}));
      else if (msg.type === "votes_update") setState(s=>({...s, votes: msg.votes}));
      else if (msg.type === "round_end") { setState(s=>({...s, last_round: msg})); setPlayers(msg.players||players); alert("Round ended!"); }
    };
    ws.onclose = ()=> setWsConnected(false);
    ws.onerror = ()=> setWsConnected(false);
    return ()=> ws.close();
  }, [lobby]);

  function send(type, payload={}){
    const ws = wsRef.current; if (!ws || ws.readyState!==1) return; ws.send(JSON.stringify({type, ...payload}));
  }

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="max-w-6xl mx-auto grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Lobby: {lobby}</h2>
            <div>{wsConnected ? "Connected" : "Connecting..."}</div>
          </div>

          <Card>
            <div className="mb-2">Theme: <select value={theme} onChange={e=>setTheme(e.target.value)} className="ml-2 bg-transparent border rounded p-1">
              <option value="card-back-1">Midnight</option>
              <option value="card-back-2">Neon</option>
            </select></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Current Wish</h3>
                <div className={`p-6 rounded ${theme} fancy-animate`}>{state.current_wish || "No wish set yet"}</div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Submissions</h3>
                <div className="space-y-2">
                  {Object.entries(state.submissions || {}).map(([k,v])=> (<div key={k} className="bg-white/5 p-2 rounded">{v}</div>))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="mt-4">
            <h3 className="font-semibold mb-2">Actions</h3>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>send("start_game",{})} className="px-3 py-2 rounded bg-green-600">Start</button>
              <button onClick={()=>send("set_settings",{settings:{timer_seconds:60,score_goal:5}})} className="px-3 py-2 rounded bg-yellow-500 text-black">Apply default settings</button>
              <button onClick={()=>{ const token = localStorage.getItem("wisher_token"); navigator.clipboard.writeText(token); alert("Token copied"); }} className="px-3 py-2 rounded bg-gray-600">Copy token</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input placeholder="Wish (wisher only)" value={wishText} onChange={e=>setWishText(e.target.value)} className="p-2 rounded bg-white/5" />
              <button onClick={()=>send("submit_wish",{wisher_id: myUuid, wish: wishText})} className="px-3 py-2 rounded bg-pink-500">Submit Wish</button>
              <input placeholder="Your cursed consequence" value={consequence} onChange={e=>setConsequence(e.target.value)} className="p-2 rounded bg-white/5" />
              <button onClick={()=>send("submit_consequence",{player_uuid: myUuid, text: consequence})} className="px-3 py-2 rounded bg-indigo-600">Submit Consequence</button>
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="font-semibold mb-2">Players</h3>
            <ul className="space-y-2">
              {players.map(p=>(<li key={p.player_uuid} className="bg-white/5 p-2 rounded">{p.username} {p.spectator? "(spec)":""} — {p.score} pts {p.connected? "":"(disconnected)"}</li>))}
            </ul>
          </Card>

          <Card className="mt-4">
            <h3 className="font-semibold mb-2">Vote</h3>
            <div className="space-y-2">
              {Object.entries(state.submissions || {}).map(([uuid,txt])=> (
                <div key={uuid} className="flex gap-2 items-center">
                  <div className="flex-1 p-2 bg-white/5 rounded">{txt}</div>
                  <button onClick={()=>send("vote",{voter_uuid: myUuid, target_uuid: uuid})} className="px-3 py-1 rounded bg-red-600">Vote</button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}