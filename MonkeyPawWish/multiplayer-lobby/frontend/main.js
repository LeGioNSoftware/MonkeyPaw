const socket = io("https://YOUR_RENDER_URL"); // Replace with your Render backend URL

document.getElementById('createBtn').onclick = async () => {
  const lobbyName = document.getElementById('lobbyName').value;
  const password = document.getElementById('password').value;
  const res = await fetch(`https://YOUR_RENDER_URL/create-lobby`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ lobbyName, password })
  });
  alert(await res.text());
};

document.getElementById('joinBtn').onclick = async () => {
  const lobbyName = document.getElementById('lobbyName').value;
  const password = document.getElementById('password').value;
  const playerName = document.getElementById('playerName').value;
  const res = await fetch(`https://YOUR_RENDER_URL/join-lobby`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ lobbyName, password, playerName })
  });
  alert(await res.text());
  socket.emit('join-lobby', { lobbyName, playerName });
};

document.getElementById('sendBtn').onclick = () => {
  const lobbyName = document.getElementById('lobbyName').value;
  const message = document.getElementById('message').value;
  socket.emit('send-message', { lobbyName, message });
};

socket.on('receive-message', msg => {
  const div = document.getElementById('chat');
  div.innerHTML += `<p>${msg}</p>`;
});
socket.on('player-joined', name => {
  const div = document.getElementById('chat');
  div.innerHTML += `<p><i>${name} joined the lobby</i></p>`;
});
