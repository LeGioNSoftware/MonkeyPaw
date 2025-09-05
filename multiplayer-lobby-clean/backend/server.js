const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public')); // serve index.html and client.js from /public

let lobbies = {}; // lobbyId -> { password, winningScore, players: [], gameMaster, roundData }

wss.on('connection', ws => {
    ws.on('message', message => {
        const msg = JSON.parse(message);

        switch(msg.action) {

            case 'createLobby':
                const lobbyId = Math.random().toString(36).substring(2, 8);
                lobbies[lobbyId] = {
                    password: msg.password,
                    winningScore: msg.winningScore || 10,
                    players: [{ username: msg.username, ws, score: 0 }],
                    gameMaster: msg.username,
                    roundData: []
                };
                ws.lobbyId = lobbyId;
                ws.send(JSON.stringify({ action: 'lobbyCreated', lobbyId }));
                break;

            case 'joinLobby':
                const lobby = lobbies[msg.lobbyId];
                if (!lobby) {
                    ws.send(JSON.stringify({ action: 'error', message: 'Lobby not found' }));
                    return;
                }
                if (lobby.password !== msg.password) {
                    ws.send(JSON.stringify({ action: 'error', message: 'Wrong password' }));
                    return;
                }
                lobby.players.push({ username: msg.username, ws, score: 0 });
                ws.lobbyId = msg.lobbyId;
                ws.send(JSON.stringify({ action: 'joinedLobby', lobbyId: msg.lobbyId, players: lobby.players.map(p=>p.username), winningScore: lobby.winningScore }));
                // Notify everyone
                lobby.players.forEach(p => p.ws.send(JSON.stringify({ action: 'updatePlayers', players: lobby.players.map(p=>p.username) })));
                break;

            case 'submitConsequence':
                const currentLobby = lobbies[ws.lobbyId];
                if (!currentLobby) return;
                currentLobby.roundData.push({ username: msg.username, text: msg.text });
                // Check if all players submitted
                if (currentLobby.roundData.length === currentLobby.players.length - 1) {
                    // Send all consequences to game master only
                    const gmWs = currentLobby.players.find(p=>p.username===currentLobby.gameMaster).ws;
                    gmWs.send(JSON.stringify({ action: 'showConsequences', roundData: currentLobby.roundData }));
                }
                break;

            case 'pickWinner':
                const lobbyToUpdate = lobbies[ws.lobbyId];
                if (!lobbyToUpdate) return;
                const winner = lobbyToUpdate.players.find(p=>p.username===msg.username);
                if (!winner) return;
                winner.score += 1;

                // Notify everyone of round result
                lobbyToUpdate.players.forEach(p => p.ws.send(JSON.stringify({ action: 'roundResult', winner: msg.username, score: winner.score })));

                // Check for game over
                if (winner.score >= lobbyToUpdate.winningScore) {
                    lobbyToUpdate.players.forEach(p => p.ws.send(JSON.stringify({ action: 'gameOver', winner: msg.username })));
                    delete lobbies[ws.lobbyId];
                } else {
                    // Start new round: rotate game master
                    const currentIndex = lobbyToUpdate.players.findIndex(p=>p.username===lobbyToUpdate.gameMaster);
                    lobbyToUpdate.gameMaster = lobbyToUpdate.players[(currentIndex+1) % lobbyToUpdate.players.length].username;
                    lobbyToUpdate.roundData = [];
                    lobbyToUpdate.players.forEach(p => p.ws.send(JSON.stringify({ action: 'newRound', gameMaster: lobbyToUpdate.gameMaster })));
                }
                break;

            default:
                console.log('Unknown action', msg);
        }
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log('Server running on port', process.env.PORT || 3000);
});
