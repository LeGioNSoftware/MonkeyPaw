// server.js
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const lobbies = {}; // { lobbyName: { password, players: {}, votes: {} } }

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            console.error('Invalid JSON:', msg);
            return;
        }

        const { type, lobbyName, password, username, card } = data;

        switch(type) {
            case 'create_lobby':
                if (lobbies[lobbyName]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Lobby already exists' }));
                    return;
                }
                lobbies[lobbyName] = { password, players: {}, votes: {} };
                lobbies[lobbyName].players[username] = ws;
                ws.lobbyName = lobbyName;
                ws.username = username;

                ws.send(JSON.stringify({ type: 'lobby_created', players: Object.keys(lobbies[lobbyName].players) }));
                break;

            case 'join_lobby':
                if (!lobbies[lobbyName]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist' }));
                    return;
                }
                if (lobbies[lobbyName].password !== password) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Incorrect password' }));
                    return;
                }

                lobbies[lobbyName].players[username] = ws;
                ws.lobbyName = lobbyName;
                ws.username = username;

                broadcastLobby(lobbyName, { type: 'joined_lobby', players: Object.keys(lobbies[lobbyName].players) });
                break;

            case 'vote':
                if (!ws.lobbyName) return;
                lobbies[ws.lobbyName].votes[username] = card;

                // Broadcast vote count only, no usernames
                broadcastLobby(ws.lobbyName, { type: 'vote_update', votes: Object.values(lobbies[ws.lobbyName].votes).length });
                break;

            case 'reveal_votes':
                if (!ws.lobbyName) return;
                const results = lobbies[ws.lobbyName].votes;
                broadcastLobby(ws.lobbyName, { type: 'reveal_votes', results });
                break;

            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown type' }));
        }
    });

    ws.on('close', () => {
        if (ws.lobbyName && lobbies[ws.lobbyName]) {
            delete lobbies[ws.lobbyName].players[ws.username];
            delete lobbies[ws.lobbyName].votes[ws.username];
            broadcastLobby(ws.lobbyName, { type: 'new_player', players: Object.keys(lobbies[ws.lobbyName].players) });
        }
    });
});

function broadcastLobby(lobbyName, msg) {
    const lobby = lobbies[lobbyName];
    if (!lobby) return;
    Object.values(lobby.players).forEach(playerWs => {
        if (playerWs.readyState === WebSocket.OPEN) {
            playerWs.send(JSON.stringify(msg));
        }
    });
}

server.listen(process.env.PORT || 3000, () => {
    console.log('Server running on port', process.env.PORT || 3000);
});
