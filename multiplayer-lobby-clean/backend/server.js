// Requires: npm i ws express
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const app = express();

// Optional: respond on GET / so Render shows something
app.get('/', (req, res) => {
  res.send("Monkey Paw WebSocket server is running.");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Echo test
    ws.send("Server says: " + message.toString());
  });

  ws.on('close', () => console.log('Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
