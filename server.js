const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const path       = require("path");
const crypto     = require("crypto");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: { origin: "*" },          // Railway proxies requests cross-origin
    transports: ["websocket", "polling"]  // prefer websocket, fall back to polling
});

app.set("trust proxy", 1);          // trust Railway's reverse proxy

app.use(express.static(path.join(__dirname)));

app.get("/",            (req, res) => res.sendFile(__dirname + "/index.html"));
app.get("/game",        (req, res) => res.sendFile(__dirname + "/game.html"));
app.get("/lobby",       (req, res) => res.sendFile(__dirname + "/lobby.html"));
app.get("/online-game", (req, res) => res.sendFile(__dirname + "/online-game.html"));

// ─── Room state ───────────────────────────────────────────────────────────────
const rooms = {};
// rooms[code] = {
//   tokens:      [tokenP1, tokenP2|null],  <- never change, survive reconnects
//   sockets:     [socketId|null, socketId|null],  <- updated each time
//   board, currentTurn, scores, gameOver
// }

function generateCode() {
    let code;
    do { code = String(Math.floor(100000 + Math.random() * 900000)); }
    while (rooms[code]);
    return code;
}

function generateToken() {
    return crypto.randomBytes(16).toString("hex");
}

const WIN_PATTERNS = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

function checkWin(board) {
    for (const [a,b,c] of WIN_PATTERNS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c])
            return board[a];
    }
    return null;
}

// ─── Socket events ────────────────────────────────────────────────────────────
io.on("connection", (socket) => {

    // ── CREATE ROOM ───────────────────────────────────────────────────────────
    // Creator calls this from lobby. We give them a token and a code.
    socket.on("create-room", () => {
        const code  = generateCode();
        const token = generateToken();

        rooms[code] = {
            tokens:      [token, null],
            sockets:     [null, null],
            board:       Array(9).fill(null),
            currentTurn:  0,    // X always goes first; idx of whoever has X
            symbolFlipped: false, // false: P1=X P2=O | true: P1=O P2=X
            scores:        { 0: 0, 1: 0 },
            gameOver:      false
        };

        // Store creator's lobby socket so we can reach them when P2 joins
        rooms[code].lobbySocket = socket.id;
        socket.join(code);
        socket.data.code = code;  // so cancel-room + disconnect can find the room

        // Send back code + token — lobby.js saves token in sessionStorage
        socket.emit("room-created", { code, token });
    });

    // ── CANCEL ROOM (creator clicks cancel in lobby) ─────────────────────────
    // Explicit event so room is deleted immediately, even on slow servers
    // where the disconnect event might arrive late
    socket.on("cancel-room", () => {
        const code = socket.data.code;
        if (code && rooms[code]) {
            delete rooms[code];
        }
    });

    // ── JOIN ROOM ─────────────────────────────────────────────────────────────
    // Joiner calls this from lobby. We give them their token too.
    socket.on("join-room", ({ code }) => {
        const room = rooms[code];

        if (!room) {
            socket.emit("join-error", { message: "Room not found." });
            return;
        }
        if (room.tokens[1] !== null) {
            socket.emit("join-error", { message: "Room is full." });
            return;
        }

        const token    = generateToken();
        room.tokens[1] = token;
        socket.join(code);

        // Tell creator: here's your token (playerIdx 0) + the room code — go to game page
        io.to(room.lobbySocket).emit("game-start", {
            code,
            token: room.tokens[0],
            playerIdx: 0
        });

        // Tell joiner: here's your token (playerIdx 1) + the room code
        socket.emit("game-start", {
            code,
            token,
            playerIdx: 1
        });
    });

    // ── JOIN GAME (called from online-game.js after redirect) ─────────────────
    // Player presents their token. Server looks it up, registers their new socket.
    socket.on("join-game", ({ code, token }) => {
        const room = rooms[code];

        if (!room) {
            socket.emit("error-fatal", { message: "Room not found." });
            return;
        }

        // Match token to player slot
        const playerIdx = room.tokens.indexOf(token);
        if (playerIdx === -1) {
            socket.emit("error-fatal", { message: "Invalid token." });
            return;
        }

        // Register new socket for this player
        room.sockets[playerIdx] = socket.id;
        socket.join(code);
        socket.data.code      = code;
        socket.data.playerIdx = playerIdx;

        // Confirm to this player
        socket.emit("game-joined", { playerIdx, scores: room.scores, board: room.board, symbolFlipped: room.symbolFlipped });

        // If both players are now connected:
        // - first time ever: broadcast both-ready (shows "Opponent connected" message)
        // - reconnect: just silently sync state to the reconnecting player only
        if (room.sockets[0] && room.sockets[1]) {
            if (!room.started) {
                room.started = true;
                io.to(code).emit("both-ready", { currentTurn: room.currentTurn });
            } else {
                // Reconnect — only the rejoining socket needs a state sync, no announcement
                socket.emit("both-ready", { currentTurn: room.currentTurn, reconnect: true });
            }
        }
    });

    // ── MAKE MOVE ─────────────────────────────────────────────────────────────
    socket.on("make-move", ({ index }) => {
        const code = socket.data.code;
        const room = rooms[code];
        if (!room || room.gameOver) return;

        const playerIdx = socket.data.playerIdx;
        if (room.currentTurn !== playerIdx) return;
        if (room.board[index] !== null) return;

        // Symbol depends on whether symbols have been flipped this round
        const symbol = (playerIdx === 0)
            ? (room.symbolFlipped ? "O" : "X")
            : (room.symbolFlipped ? "X" : "O");
        room.board[index] = symbol;

        const winner = checkWin(room.board);
        const isDraw = !winner && room.board.every(c => c !== null);

        if (winner) {
            room.scores[playerIdx]++;
            room.gameOver = true;
            io.to(code).emit("move-made", {
                board: room.board, result: "win",
                winnerIdx: playerIdx, scores: room.scores
            });
        } else if (isDraw) {
            room.gameOver = true;
            io.to(code).emit("move-made", {
                board: room.board, result: "draw",
                winnerIdx: null, scores: room.scores
            });
        } else {
            room.currentTurn = playerIdx === 0 ? 1 : 0; // still just toggles between 0 and 1
            io.to(code).emit("move-made", {
                board: room.board, result: "continue",
                winnerIdx: null, scores: room.scores,
                currentTurn: room.currentTurn
            });
        }
    });

    // ── CHAT MESSAGE ──────────────────────────────────────────────────────────
    socket.on("chat-message", ({ text }) => {
        const code = socket.data.code;
        const room = rooms[code];
        if (!room) return;

        const playerIdx = socket.data.playerIdx;
        const trimmed   = String(text).trim().slice(0, 100);
        if (!trimmed) return;

        // Relay to both players (sender included so they see confirmation)
        io.to(code).emit("chat-message", {
            text:      trimmed,
            fromIdx:   playerIdx
        });
    });

    // ── PLAY AGAIN ────────────────────────────────────────────────────────────
    socket.on("play-again-request", () => {
        const code = socket.data.code;
        const room = rooms[code];
        if (!room) return;

        if (!room.readyUp) room.readyUp = new Set();
        room.readyUp.add(socket.data.playerIdx);
        socket.to(code).emit("opponent-ready");

        if (room.readyUp.size === 2) {
            // Flip symbols for this round — X always goes first,
            // but which player IS X alternates
            room.symbolFlipped = !room.symbolFlipped;
            // X holder is: playerIdx 1 when flipped, playerIdx 0 when not
            room.currentTurn   = room.symbolFlipped ? 1 : 0;
            room.board         = Array(9).fill(null);
            room.gameOver      = false;
            room.readyUp       = new Set();
            io.to(code).emit("game-restart", {
                scores:        room.scores,
                currentTurn:   room.currentTurn,
                symbolFlipped: room.symbolFlipped
            });
        }
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        const code = socket.data.code;
        if (!code || !rooms[code]) return;

        const room      = rooms[code];
        const playerIdx = socket.data.playerIdx;

        // ── Lobby disconnect (creator's lobby socket navigated away) ────────
        // playerIdx is undefined on lobby sockets.
        // Only delete the room if game-start hasn't fired yet (tokens[1] still null).
        // If a joiner already joined, game-start was sent — keep the room alive
        // so both players can land on the game page.
        if (playerIdx === undefined) {
            if (room.tokens[1] === null) {
                // Nobody joined yet — real cancel/close, clean up
                delete rooms[code];
            }
            // Otherwise game is starting, lobby socket disconnect is expected — ignore
            return;
        }

        // ── Game page disconnect ─────────────────────────────────────────────
        // Null out socket slot but keep room alive so player can reconnect
        room.sockets[playerIdx] = null;

        // Cancel any existing grace timer for this player
        if (room._dcTimeout) clearTimeout(room._dcTimeout);

        // If game never started (P2 never joined), clean up immediately
        if (!room.started) {
            delete rooms[code];
            return;
        }

        // If both players are now disconnected, close immediately — no point waiting
        if (!room.sockets[0] && !room.sockets[1]) {
            if (room._dcTimeout) clearTimeout(room._dcTimeout);
            delete rooms[code];
            return;
        }

        // One player still connected — give 15s grace for refresh/accidental close
        room._dcTimeout = setTimeout(() => {
            if (!rooms[code]) return;
            if (!room.sockets[playerIdx]) {
                socket.to(code).emit("opponent-disconnected");
                delete rooms[code];
            }
        }, 10000);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));