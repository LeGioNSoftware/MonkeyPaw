let socket;

// Initialize WebSocket
function initWebSocket() {
    socket = new WebSocket('wss://monkeypaw.onrender.com');

    socket.onopen = () => console.log('Connected to server');

    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        switch(data.type) {
            case 'lobby_created':
                alert('Lobby created: ' + data.payload.lobbyId);
                break;
            case 'user_joined':
                console.log(`${data.payload.username} joined the lobby`);
                break;
            case 'vote_cast':
                console.log(`Total votes so far: ${data.payload.voteCount}`);
                break;
            case 'votes_revealed':
                console.log('Votes revealed:', data.payload);
                alert(JSON.stringify(data.payload, null, 2));
                break;
            case 'error':
                alert('Error: ' + data.payload);
                break;
        }
    };

    socket.onclose = () => console.log('Disconnected from server');
}

// Call on page load
initWebSocket();

// Button handlers
document.getElementById('createLobbyBtn').onclick = () => {
    socket.send(JSON.stringify({ type: 'create_lobby' }));
};

document.getElementById('joinLobbyBtn').onclick = () => {
    const username = prompt('Enter your username:');
    const lobbyId = prompt('Enter lobby ID:').toUpperCase();
    socket.send(JSON.stringify({ type: 'join_lobby', payload: { username, lobbyId } }));
};

document.getElementById('voteBtn').onclick = () => {
    const vote = prompt('Enter your vote:');
    socket.send(JSON.stringify({ type: 'vote', payload: { vote } }));
};

document.getElementById('revealVotesBtn').onclick = () => {
    socket.send(JSON.stringify({ type: 'reveal_votes' }));
};
