let ws;
let username;
let lobbyId;

document.getElementById('createLobbyBtn').onclick = () => {
    username = document.getElementById('username').value;
    const password = document.getElementById('lobbyPassword').value;
    const winningScore = parseInt(document.getElementById('winningScore').value) || 10;

    ws = new WebSocket(`wss://${window.location.host}`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'createLobby', username, password, winningScore }));
    };

    setupWsHandlers();
};

document.getElementById('joinLobbyBtn').onclick = () => {
    username = document.getElementById('username').value;
    const password = document.getElementById('lobbyPassword').value;
    lobbyId = document.getElementById('lobbyId').value;

    ws = new WebSocket(`wss://${window.location.host}`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'joinLobby', username, password, lobbyId }));
    };

    setupWsHandlers();
};

function setupWsHandlers() {
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        switch(data.action) {
            case 'lobbyCreated':
                lobbyId = data.lobbyId;
                document.getElementById('lobbyInfo').innerText = `Lobby created: ${lobbyId}`;
                break;
            case 'joinedLobby':
                document.getElementById('lobbyInfo').innerText = `Joined lobby: ${data.lobbyId}`;
                break;
            case 'updatePlayers':
                document.getElementById('playersList').innerText = data.players.join(', ');
                break;
            case 'showConsequences':
                // Game master sees submissions
                document.getElementById('gmPanel').innerHTML = data.roundData.map(r=>`<div>${r.text} <button onclick="pickWinner('${r.username}')">Pick Winner</button></div>`).join('');
                break;
            case 'roundResult':
                alert(`${data.winner} won this round! Score: ${data.score}`);
                break;
            case 'newRound':
                document.getElementById('gmPanel').innerText = `New round! Game master: ${data.gameMaster}`;
                break;
            case 'gameOver':
                alert(`${data.winner} wins the game!`);
                break;
            case 'error':
                alert(data.message);
                break;
        }
    };
}

function submitConsequence() {
    const text = document.getElementById('consequenceInput').value;
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'submitConsequence', username, text }));
    }
}

function pickWinner(winnerUsername) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'pickWinner', username: winnerUsername }));
    }
}
