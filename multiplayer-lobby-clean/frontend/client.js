const ws = new WebSocket('wss://monkeypaw.onrender.com');

let username = null;
let currentLobbyId = null;
let isGM = false;

document.getElementById('setUsernameBtn').onclick = () => {
    username = document.getElementById('username').value.trim();
    const targetScore = parseInt(document.getElementById('targetScore').value) || 10;
    if (!username) return alert('Enter a username!');
    localStorage.setItem('username', username);
    document.getElementById('loginDiv').style.display = 'none';
    document.getElementById('lobbyDiv').style.display = 'block';
};

document.getElementById('createLobbyBtn').onclick = () => {
    const targetScore = parseInt(document.getElementById('targetScore').value) || 10;
    ws.send(JSON.stringify({ type: 'createLobby', username, targetScore }));
};

document.getElementById('joinLobbyBtn').onclick = () => {
    const lobbyId = document.getElementById('joinLobbyId').value.trim();
    if (!lobbyId) return alert('Enter Lobby ID!');
    ws.send(JSON.stringify({ type: 'joinLobby', username, lobbyId }));
};

document.getElementById('submitWishBtn').onclick = () => {
    const wish = document.getElementById('wishInput').value.trim();
    if (!wish) return alert('Write a wish!');
    ws.send(JSON.stringify({ type: 'setWish', username, lobbyId: currentLobbyId, wish }));
};

document.getElementById('submitConsequenceBtn').onclick = () => {
    const consequence = document.getElementById('consequenceInput').value.trim();
    if (!consequence) return alert('Write a consequence!');
    ws.send(JSON.stringify({ type: 'submitConsequence', username, lobbyId: currentLobbyId, consequence }));
    alert('Consequence submitted! Waiting for GM...');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
        case 'lobbyCreated':
        case 'lobbyJoined':
            currentLobbyId = data.lobbyId;
            document.getElementById('lobbyDiv').style.display = 'none';
            document.getElementById('gameDiv').style.display = 'block';
            document.getElementById('scores').textContent = '';
            alert(`Lobby ready! ID: ${currentLobbyId}`);
            break;

        case 'newWish':
            if (username === data.gm) {
                isGM = true;
                document.getElementById('gmDiv').style.display = 'block';
                document.getElementById('votingDiv').style.display = 'none';
            } else {
                isGM = false;
                document.getElementById('gmDiv').style.display = 'none';
                document.getElementById('votingDiv').style.display = 'block';
            }
            break;

        case 'submissionsReady':
            if (isGM) {
                const winner = prompt(`Choose winner by typing their exact submission:\n${data.submissions.join('\n')}`);
                if (winner) ws.send(JSON.stringify({ type: 'pickWinner', username, lobbyId: currentLobbyId, winner }));
            }
            break;

        case 'roundResult':
            document.getElementById('resultsDiv').style.display = 'block';
            document.getElementById('results').textContent =
                `Wish: ${data.wish}\nWinner: ${data.winner}\nSubmissions:\n${JSON.stringify(data.submissions, null, 2)}`;
            document.getElementById('scores').textContent = JSON.stringify(data.scores, null, 2);

            if (data.gameOver) alert(`Game Over! ${data.winner} wins!`);
            break;

        case 'nextRound':
            document.getElementById('gmDiv').style.display = username === data.gm ? 'block' : 'none';
            document.getElementById('votingDiv').style.display = username !== data.gm ? 'block' : 'none';
            document.getElementById('roundTitle').textContent = `Round ${data.round}`;
            document.getElementById('resultsDiv').style.display = 'none';
            document.getElementById('wishInput').value = '';
            document.getElementById('consequenceInput').value = '';
            break;

        case 'lobbyUpdate':
            document.getElementById('scores').textContent = JSON.stringify(data.scores, null, 2);
            break;

        case 'error':
            alert(data.message);
            break;
    }
};
