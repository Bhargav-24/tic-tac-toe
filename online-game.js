const socket = io();

// ─── Read identity from sessionStorage ───────────────────────────────────────
const roomCode = new URLSearchParams(window.location.search).get("room")
              || sessionStorage.getItem("ttt_code");
const myToken  = sessionStorage.getItem("ttt_token");

if (!roomCode || !myToken) {
    // Missing info — send back to lobby
    window.location.href = "/lobby";
}

// ─── State ────────────────────────────────────────────────────────────────────
let myPlayerIdx = null;
let mySymbol    = null;
let oppSymbol   = null;
let myReadyUp   = false;
let gameStarted = false;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const boardEl           = document.getElementById("board");
const turnEl            = document.getElementById("turn");
const resultEl          = document.getElementById("result");
const playAgainBtn      = document.getElementById("playagain");
const myScoreEl         = document.getElementById("myScore");
const oppScoreEl        = document.getElementById("oppScore");
const mySymbolEl        = document.getElementById("mySymbol");
const oppSymbolEl       = document.getElementById("oppSymbol");
const myCardEl          = document.getElementById("p1Card");
const oppCardEl         = document.getElementById("p2Card");
const roomCodeBadge     = document.getElementById("roomCodeBadge");
const overlayWaiting    = document.getElementById("overlayWaiting");
const overlayDisconnect = document.getElementById("overlayDisconnected");

roomCodeBadge.textContent = `ROOM: ${roomCode}`;

// ─── Chat DOM ─────────────────────────────────────────────────────────────────
const chatMessages  = document.getElementById("chatMessages");
const chatInput     = document.getElementById("chatInput");
const chatSendBtn   = document.getElementById("chatSendBtn");
const chatIndicator = document.getElementById("chatIndicator");

// ─── Build board ──────────────────────────────────────────────────────────────
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    boardEl.appendChild(cell);
}

// Board locked until both players are in
boardEl.classList.add("locked");
overlayWaiting.classList.remove("hidden");

// ─── Identify ourselves to the server using our token ────────────────────────
// This is emitted once on page load. Token proves who we are — no socket ID dependency.
socket.emit("join-game", { code: roomCode, token: myToken });

// ─── Socket events ────────────────────────────────────────────────────────────

// Server confirmed our identity
socket.on("game-joined", ({ playerIdx, scores, board }) => {
    myPlayerIdx = playerIdx;
    mySymbol    = playerIdx === 0 ? "X" : "O";
    oppSymbol   = playerIdx === 0 ? "O" : "X";

    mySymbolEl.textContent  = mySymbol;
    oppSymbolEl.textContent = oppSymbol;
    mySymbolEl.className    = `score-symbol ${mySymbol  === "X" ? "x-symbol" : "o-symbol"}`;
    oppSymbolEl.className   = `score-symbol ${oppSymbol === "X" ? "x-symbol" : "o-symbol"}`;

    updateScores(scores);

    // Restore board state in case of reconnect
    if (board.some(c => c !== null)) renderBoard(board);

    // Keep waiting overlay until both players are in (both-ready event)
});

// Both players connected — game can start
socket.on("both-ready", ({ currentTurn, reconnect }) => {
    gameStarted = true;
    overlayWaiting.classList.add("hidden");
    boardEl.classList.remove("locked");
    setTurnUI(currentTurn);
    // Only show the announcement on first connection, not on every reload
    if (!reconnect) appendSystem("Opponent connected — game on!");
});

// A move happened
socket.on("move-made", ({ board, result, winnerIdx, scores, currentTurn }) => {
    renderBoard(board);
    updateScores(scores);

    if (result === "win") {
        boardEl.classList.add("game-over", "locked");
        setTimeout(() => boardEl.classList.remove("game-over"), 600);
        highlightWinners(board);
        resultEl.textContent = winnerIdx === myPlayerIdx ? "YOU WIN!" : "YOU LOSE...";
        resultEl.classList.add("show");
        playAgainBtn.classList.remove("hidden");
        setTurnUI(null);
    } else if (result === "draw") {
        boardEl.classList.add("game-over", "locked");
        setTimeout(() => boardEl.classList.remove("game-over"), 600);
        resultEl.textContent = "DRAW!";
        resultEl.classList.add("show");
        playAgainBtn.classList.remove("hidden");
        setTurnUI(null);
    } else {
        setTurnUI(currentTurn);
    }
});

socket.on("opponent-ready", () => {
    if (!myReadyUp) playAgainBtn.textContent = "▶ PLAY AGAIN (OPP READY)";
});

socket.on("game-restart", ({ scores }) => {
    resetBoardUI();
    updateScores(scores);
    resultEl.textContent = "";
    resultEl.classList.remove("show");
    playAgainBtn.classList.add("hidden");
    playAgainBtn.textContent = "▶ PLAY AGAIN";
    playAgainBtn.classList.remove("waiting");
    myReadyUp = false;
    boardEl.classList.remove("locked");
    setTurnUI(0);
});

socket.on("opponent-disconnected", () => {
    overlayDisconnect.classList.remove("hidden");
});

socket.on("error-fatal", ({ message }) => {
    // Token rejected or room gone — go back to lobby
    alert(message);
    window.location.href = "/lobby";
});

// ─── Chat ────────────────────────────────────────────────────────────────────
socket.on("chat-message", ({ text, fromIdx }) => {
    const isMe = fromIdx === myPlayerIdx;
    appendMessage(text, isMe ? "mine" : "theirs", isMe ? "YOU" : "OPP");
    // Flash indicator if message is from opponent
    if (!isMe) {
        chatIndicator.classList.add("active");
        setTimeout(() => chatIndicator.classList.remove("active"), 3000);
    }
});

function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit("chat-message", { text });
    chatInput.value = "";
}

chatSendBtn.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
});

function appendMessage(text, type, label) {
    const msg = document.createElement("div");
    msg.className = `chat-msg ${type}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = text;

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = label;

    msg.appendChild(bubble);
    msg.appendChild(meta);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystem(text) {
    const div = document.createElement("div");
    div.className = "chat-system";
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── Cell click ───────────────────────────────────────────────────────────────
boardEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("cell")) return;
    if (e.target.classList.contains("taken"))  return;
    if (boardEl.classList.contains("locked"))  return;
    if (myPlayerIdx === null) return;

    socket.emit("make-move", { index: Number(e.target.dataset.index) });
});

// ─── Play Again ───────────────────────────────────────────────────────────────
playAgainBtn.addEventListener("click", () => {
    if (myReadyUp) return;
    myReadyUp = true;
    playAgainBtn.classList.add("waiting");
    playAgainBtn.textContent = "WAITING FOR OPP...";
    socket.emit("play-again-request");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderBoard(board) {
    const cells = boardEl.querySelectorAll(".cell");
    board.forEach((val, i) => {
        cells[i].textContent = val || "";
        cells[i].classList.remove("x-cell", "o-cell", "taken", "winner");
        if (val === "X") cells[i].classList.add("taken", "x-cell");
        if (val === "O") cells[i].classList.add("taken", "o-cell");
    });
}

function resetBoardUI() {
    boardEl.querySelectorAll(".cell").forEach(c => {
        c.textContent = "";
        c.classList.remove("x-cell", "o-cell", "taken", "winner");
    });
}

function setTurnUI(currentTurnIdx) {
    myCardEl.classList.remove("active-turn");
    oppCardEl.classList.remove("active-turn");
    if (currentTurnIdx === null) { turnEl.textContent = ""; return; }

    const isMyTurn = currentTurnIdx === myPlayerIdx;
    if (isMyTurn) {
        myCardEl.classList.add("active-turn");
        boardEl.classList.remove("locked");
        turnEl.innerHTML = `<span class="${mySymbol === "X" ? "x-turn" : "o-turn"}">${mySymbol}</span> — YOUR TURN`;
    } else {
        oppCardEl.classList.add("active-turn");
        boardEl.classList.add("locked");
        turnEl.innerHTML = `<span class="${oppSymbol === "X" ? "x-turn" : "o-turn"}">${oppSymbol}</span> — OPP'S TURN`;
    }
}

function updateScores(scores) {
    if (myPlayerIdx === null) return;
    myScoreEl.textContent  = scores[myPlayerIdx];
    oppScoreEl.textContent = scores[myPlayerIdx === 0 ? 1 : 0];
}

const WIN_PATTERNS = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

function highlightWinners(board) {
    const cells = boardEl.querySelectorAll(".cell");
    for (const [a,b,c] of WIN_PATTERNS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            cells[a].classList.add("winner");
            cells[b].classList.add("winner");
            cells[c].classList.add("winner");
            break;
        }
    }
}