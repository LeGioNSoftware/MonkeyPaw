const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const lobbies = {}; // { lobbyName: { password, players: [] } }

app.post('/create-lobby', (req, res) => {
  const { lobbyName, password } = req.body;
  if (lobbies[lobbyName]) return res.status(400).send('Lobby exists');
  lobbies[lobbyName] = { password, players: [] };
  res.send('Lobby created');
});

app.post('/join-lobby', (req, res) => {
  const { lobbyName, password, playerName } = req.body;
  const lobby = lobbies[lobbyName];
  if (!lobby) return res.status(404).send('Lobby not found');
  if (lobby.password !== password) return res.status(403).send('Wrong password');
  lobby.players.push(playerName);
  res.send('Joined lobby');
});

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('join-lobby', ({ lobbyName, playerName }) => {
    socket.join(lobbyName);
    socket.to(lobbyName).emit('player-joined', playerName);
  });

  socket.on('send-message', ({ lobbyName, message }) => {
    io.to(lobbyName).emit('receive-message', message);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
