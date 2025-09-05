const ws = new WebSocket('wss://monkeypaw.onrender.com');

let username = localStorage.getItem('username');
if (username) {
    document.getElementById('loginDiv').style.display = 'none';
    document.getElementById('lobbyDiv').style.display = 'block';
}

document.getElementById('setUsernameBtn').onclick = () => {
    const input = document.getElementById('username').value.trim();
    if (!input) return alert('Enter a username!');
    username = input;
    localStorage.setItem('username', username);
    document.getElementById('loginDiv').style.display = 'none';
    document.getElementById('lobbyDiv').style.display = 'block';
};

document.getElementById('createLobbyBtn').onclick = () => {
    ws.send(JSON.stringify({ type: 'createLobby', username }));
};

document.getElementById('joinLobbyBtn').onclick = () => {
    const lobbyId = document.getElementById('joinLobbyId').value.trim();
    if (!lobbyId) return alert('Enter lobby ID');
    ws.send(JSON.stringify({ type: 'joinLobby', username, lobbyId }));
};

document.querySelectorAll('.cardBtn').forEach(btn => {
    btn.onclick = () => {
        const card = btn.dataset.card;
        const lobbyId = currentLobbyId;
        ws.send(JSON.stringify({ type: 'vote', username, lobbyId, card }));
        alert('Vote sent! Waiting for others...');
    };
});

let currentLobbyId = null;

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
        case 'lobbyCreated':
        case 'lobbyJoined':
            currentLobbyId = data.lobbyId;
            document.getElementById('lobbyDiv').style.display = 'none';
            document.getElementById('votingDiv').style.display = 'block';
            alert(`Lobby ready! ID: ${currentLobbyId}`);
            break;

        case 'votingResult':
            document.getElementById('votingDiv').style.display = 'none';
            document.getElementById('resultsDiv').style.display = 'block';
            document.getElementById('results').textContent =
                `Winning Card: ${data.winningCard}\nVotes:\n${JSON.stringify(data.votes, null, 2)}`;
            break;

        case 'error':
            alert(data.message);
            break;
    }
};
