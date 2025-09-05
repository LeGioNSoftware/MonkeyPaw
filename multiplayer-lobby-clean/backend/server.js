// server.js
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

console.log(`Server running on port ${PORT}`);

let lobbies = {}; // lobbyId -> { users: [], votes: {} }

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } 
        catch { return; }

        switch(data.type) {
            case 'createLobby': {
                const lobbyId = Math.random().toString(36).substring(2, 8);
                lobbies[lobbyId] = { users: [data.username], votes: {} };
                ws.send(JSON.stringify({ type: 'lobbyCreated', lobbyId }));
                break;
            }

            case 'joinLobby': {
                const lobby = lobbies[data.lobbyId];
                if (!lobby) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
                lobby.users.push(data.username);
                ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyId: data.lobbyId }));
                break;
            }

            case 'vote': {
                const lobby = lobbies[data.lobbyId];
                if (!lobby) return;
                lobby.votes[data.username] = data.card;
                
                // Check if all users have voted
                if (Object.keys(lobby.votes).length === lobby.users.length) {
                    // Pick winning card randomly
                    const cards = Object.values(lobby.votes);
                    const winningCard = cards[Math.floor(Math.random() * cards.length)];
                    // Send results including usernames now
                    wss.clients.forEach(client => {
                        client.send(JSON.stringify({
                            type: 'votingResult',
                            lobbyId: data.lobbyId,
                            votes: lobby.votes,
                            winningCard
                        }));
                    });
                    // Reset votes for next round
                    lobby.votes = {};
                }
                break;
            }
        }
    });
});
