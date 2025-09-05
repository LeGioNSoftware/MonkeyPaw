import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

console.log(`Server running on port ${PORT}`);

let lobbies = {}; // lobbyId -> { users: [], scores: {}, gmIndex: 0, round: 1, wish: '', submissions: {} , targetScore: 10 }

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        let data;
        try { data = JSON.parse(msg); } catch { return; }

        const lobby = lobbies[data.lobbyId];

        switch(data.type) {
            case 'createLobby': {
                const lobbyId = Math.random().toString(36).substring(2, 8);
                lobbies[lobbyId] = { 
                    users: [data.username], 
                    scores: { [data.username]: 0 }, 
                    gmIndex: 0, 
                    round: 1, 
                    wish: '', 
                    submissions: {}, 
                    targetScore: data.targetScore || 10
                };
                ws.send(JSON.stringify({ type: 'lobbyCreated', lobbyId }));
                break;
            }

            case 'joinLobby': {
                if (!lobby) return ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
                if (!lobby.scores[data.username]) lobby.scores[data.username] = 0;
                lobby.users.push(data.username);
                ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyId: data.lobbyId }));
                broadcastLobby(lobbyId);
                break;
            }

            case 'setWish': {
                if (!lobby) return;
                const gmName = lobby.users[lobby.gmIndex];
                if (data.username !== gmName) return;
                lobby.wish = data.wish;
                lobby.submissions = {};
                broadcastToLobby(lobbyId, { type: 'newWish', wish: data.wish, gm: gmName });
                break;
            }

            case 'submitConsequence': {
                if (!lobby) return;
                if (data.username === lobby.users[lobby.gmIndex]) return; // GM cannot submit
                lobby.submissions[data.username] = data.consequence;

                if (Object.keys(lobby.submissions).length === lobby.users.length - 1) {
                    // All submissions received
                    const gmName = lobby.users[lobby.gmIndex];
                    broadcastToLobby(lobbyId, { type: 'submissionsReady', submissions: Object.values(lobby.submissions), gm: gmName });
                }
                break;
            }

            case 'pickWinner': {
                if (!lobby) return;
                const gmName = lobby.users[lobby.gmIndex];
                if (data.username !== gmName) return;
                const winner = data.winner;

                lobby.scores[winner] = (lobby.scores[winner] || 0) + 1;

                // Check for game end
                let gameOver = false;
                if (lobby.scores[winner] >= lobby.targetScore) gameOver = true;

                broadcastToLobby(lobbyId, { type: 'roundResult', winner, scores: lobby.scores, wish: lobby.wish, submissions: lobby.submissions, gameOver });

                if (!gameOver) {
                    // Rotate GM
                    lobby.gmIndex = (lobby.gmIndex + 1) % lobby.users.length;
                    lobby.round += 1;
                    lobby.wish = '';
                    lobby.submissions = {};
                    broadcastToLobby(lobbyId, { type: 'nextRound', gm: lobby.users[lobby.gmIndex], round: lobby.round });
                }
                break;
            }
        }
    });
});

function broadcastToLobby(lobbyId, msg) {
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(JSON.stringify({ ...msg, lobbyId }));
    });
}

function broadcastLobby(lobbyId) {
    const lobby = lobbies[lobbyId];
    broadcastToLobby(lobbyId, { type: 'lobbyUpdate', users: lobby.users, scores: lobby.scores });
}
