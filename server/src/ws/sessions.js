const sessions = new Map();

function sendTo(nickname, message) {
  const ws = sessions.get(nickname);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

module.exports = { sessions, sendTo };
