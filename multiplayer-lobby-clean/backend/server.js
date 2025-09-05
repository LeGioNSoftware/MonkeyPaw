const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });

let lobbies = {}; // { lobbyName: { password, host, players: [{username, ws, score}], round: 0, wisherIndex: 0, wishes: [], curses: [] } }

wss.on('connection', ws => {
  ws.on('message', message => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {

        case 'create_lobby':
          if (lobbies[data.lobbyName]) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby already exists' }));
            return;
          }
          lobbies[data.lobbyName] = {
            password: data.password,
            host: data.username,
            players: [{ username: data.username, ws, score: 0 }],
            round: 0,
            wisherIndex: 0,
            wishes: [],
            curses: []
          };
          ws.lobby = data.lobbyName;
          ws.send(JSON.stringify({ type: 'created', players: lobbies[data.lobbyName].players }));
          break;

        case 'join_lobby':
          const lobby = lobbies[data.lobbyName];
          if (!lobby) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist' }));
            return;
          }
          if (lobby.password && lobby.password !== data.password) {
            ws.send(JSON.stringify({ type: 'error', message: 'Wrong password' }));
            return;
          }
          lobby.players.push({ username: data.username, ws, score: 0 });
          ws.lobby = data.lobbyName;
          // Notify everyone in lobby
          lobby.players.forEach(p => {
            p.ws.send(JSON.stringify({ type: 'joined', players: lobby.players }));
          });
          break;

        case 'start_round':
          {
            const l = lobbies[ws.lobby];
            if (!l) return;
            l.round++;
            // Rotate wisher
            l.wisherIndex = (l.wisherIndex + 1) % l.players.length;
            const wisher = l.players[l.wisherIndex].username;
            l.wishes = [];
            l.curses = [];
            l.players.forEach(p => {
              p.ws.send(JSON.stringify({ type: 'new_round', round: l.round, wisher }));
            });
          }
          break;

        case 'submit_wish':
          {
            const l = lobbies[ws.lobby];
            if (!l) return;
            l.wishes.push({ username: ws.username, wish: data.wish });
            l.players.forEach(p => {
              p.ws.send(JSON.stringify({ type: 'wish_drawn', wish: data.wish }));
            });
          }
          break;

        case 'submit_curse':
          {
            const l = lobbies[ws.lobby];
            if (!l) return;
            const player = l.players.find(p => p.ws === ws);
            l.curses.push({ username: player.username, text: data.curse, votes: 0 });
            l.players.forEach(p => {
              p.ws.send(JSON.stringify({ type: 'submission_update', submitted: l.curses.length, total: l.players.length - 1 }));
            });
            // When all curses are in, reveal them anonymously
            if (l.curses.length === l.players.length - 1) {
              const anonymousCurses = l.curses.map(c => ({ text: c.text }));
              l.players.forEach(p => {
                p.ws.send(JSON.stringify({ type: 'reveal', curses: l.curses }));
              });
            }
          }
          break;

        case 'vote':
          {
            const l = lobbies[ws.lobby];
            if (!l) return;
            l.curses[data.curseIndex].votes++;
            // For simplicity, we declare round finished after all votes = players-1
            const totalVotes = l.curses.reduce((a, c) => a + c.votes, 0);
            if (totalVotes === l.players.length - 1) {
              // Find winner
              const winnerCurse = l.curses.reduce((a, b) => (b.votes > a.votes ? b : a));
              // Increment winner score
              const winnerPlayer = l.players.find(p => p.username === winnerCurse.username);
              if (winnerPlayer) winnerPlayer.score++;
              // Send round results
              l.players.forEach(p => {
                p.ws.send(JSON.stringify({
                  type: 'round_finished',
                  winner: winnerCurse.username,
                  players: l.players
                }));
              });
            }
          }
          break;
      }

    } catch (err) {
      console.error(err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    // Remove player from lobby if disconnected
    if (ws.lobby && lobbies[ws.lobby]) {
      const l = lobbies[ws.lobby];
      l.players = l.players.filter(p => p.ws !== ws);
      l.players.forEach(p => {
        p.ws.send(JSON.stringify({ type: 'lobby_update', players: l.players }));
      });
      if (l.players.length === 0) delete lobbies[ws.lobby];
    }
  });
});
