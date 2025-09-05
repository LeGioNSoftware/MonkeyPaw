const express = require('express');
const WebSocket = require('ws');
const app = express();
const wss = new WebSocket.Server({ noServer: true });

const lobbies = {};
const wishes = [
  'I wish for infinite wealth',
  'I wish for eternal life',
  'I wish to be the smartest person alive',
  'I wish for world peace',
  'I wish to be famous'
];

app.use(express.static('frontend'));

app.server = app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

app.server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  let currentLobby = null;
  let playerName = `Player-${Math.floor(Math.random() * 1000)}`;
  let isHost = false;
  let isWisher = false;
  let currentRound = 0;
  let submissions = [];
  let votes = [];

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'create_lobby':
        if (lobbies[data.lobbyName]) {
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby already exists' }));
        } else {
          lobbies[data.lobbyName] = {
            name: data.lobbyName,
            password: data.password,
            host: playerName,
            players: [{ name: playerName, score: 0 }]
          };
          currentLobby = data.lobbyName;
          isHost = true;
          ws.send(JSON.stringify({ type: 'created', lobbyName: data.lobbyName }));
        }
        break;

      case 'join_lobby':
        const lobby = lobbies[data.lobbyName];
        if (!lobby) {
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
        } else if (lobby.password !== data.password) {
          ws.send(JSON.stringify({ type: 'error', message: 'Incorrect password' }));
        } else {
          lobby.players.push({ name: playerName, score: 0 });
          currentLobby = data.lobbyName;
          ws.send(JSON.stringify({ type: 'joined', playerName }));
          broadcastLobbyUpdate(lobby);
        }
        break;

      case 'leave_lobby':
        if (currentLobby) {
          const lobby = lobbies[currentLobby];
          if (lobby) {
            lobby.players = lobby.players.filter((p) => p.name !== playerName);
            if (lobby.players.length === 0) {
              delete lobbies[currentLobby];
            } else if (isHost) {
              lobby.host = lobby.players[0].name;
            }
            currentLobby = null;
            isHost = false;
            isWisher = false;
            ws.send(JSON.stringify({ type: 'lobby_left' }));
            broadcastLobbyUpdate(lobby);
          }
        }
        break;

      case 'start_game':
        if (isHost && currentLobby) {
          const lobby = lobbies[currentLobby];
          if (lobby) {
            lobby.state = 'in_game';
            currentRound = 1;
            isWisher = true;
            ws.send(JSON.stringify({ type: 'game_started', round: currentRound }));
            broadcastLobbyUpdate(lobby);
            drawWish();
          }
        }
        break;

      case 'submit_curse':
        if (isWisher) {
          ws.send(JSON.stringify({ type: 'error', message: 'Wisher cannot submit curses' }));
        } else {
          submissions.push({ player: playerName, curse: data.curse });
          ws.send(JSON.stringify({ type: 'submission_received' }));
          if (submissions.length === lobbies[currentLobby].players.length - 1) {
            broadcastCurses();
          }
        }
        break;

      case 'vote':
        if (isWisher) {
          votes.push({ player: playerName, curseIndex: data.curseIndex });
          if (votes.length === submissions.length) {
            const voteCounts = {};
            votes.forEach((vote) => {
              voteCounts[vote.curseIndex] = (voteCounts[vote.curseIndex] || 0) + 1;
            });
            const winningCurseIndex = Object.keys(voteCounts).reduce((a, b) =>
              voteCounts[a] > voteCounts[b] ? a : b
            );
            const winningCurse = submissions[winningCurseIndex];
            const player = lobbies[currentLobby].players.find(
              (p) => p.name === winningCurse.player
            );
            player.score++;
            ws.send(JSON.stringify({ type: 'round_finished', winner: winningCurse.player, score: player.score }));
            resetRound();
          }
        }
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  function broadcastLobbyUpdate(lobby) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'lobby_update', lobby }));
      }
    });
  }

  function drawWish() {
    const wish = wishes[Math.floor(Math.random() * wishes.length)];
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'wish_drawn', wish }));
      }
    });
  }

  function broadcastCurses() {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: 'reveal',
            submissions: submissions.map((s) => s.curse)
          })
        );
      }
    });
  }

  function resetRound() {
    submissions = [];
    votes = [];
    currentRound++;
    isWisher = false;
    const nextPlayer = lobbies[currentLobby].players[currentRound % lobbies[currentLobby].players.length];
    isWisher = nextPlayer.name === playerName;
    if (isWisher) {
      drawWish();
    }
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'new_round', round: currentRound, isWisher }));
      }
    });
  }
});
