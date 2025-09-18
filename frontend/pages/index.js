import { useEffect, useState } from 'react';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://monkeypaw.onrender.com";

export default function Home() {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    const ws = new WebSocket(`${BACKEND_URL.replace(/^http/, 'ws')}/ws/demo_lobby`);
    ws.onmessage = (event) => setMessages(prev => [...prev, JSON.parse(event.data).message]);
    return () => ws.close();
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-5xl font-bold text-purple-600 mb-6">Wisher Full Game Demo</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {messages.map((m, i) => (
          <div key={i} className="w-32 h-48 bg-purple-300 rounded-lg shadow-lg flex items-center justify-center transform hover:rotate-3 transition-all duration-300">
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}