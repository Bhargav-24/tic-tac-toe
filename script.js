const game = Game();
let symbolFlipped = false; // false: P1=X P2=O | true: P1=O P2=X

const boardDiv     = document.querySelector(".board");
const turnText     = document.getElementById("turn");
const resultText   = document.getElementById("result");
const p1ScoreText  = document.getElementById("p1score");   // hidden <span>, kept for compat
const p2ScoreText  = document.getElementById("p2score");
const resetBtn     = document.getElementById("reset");
const playAgainBtn = document.getElementById("playagain");

playAgainBtn.style.display = "none";

// Build board cells
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    boardDiv.appendChild(cell);
}

updateUI();

boardDiv.addEventListener("click", (e) => {
    if (!e.target.classList.contains("cell")) return;
    if (e.target.classList.contains("taken")) return;

    const index      = Number(e.target.dataset.index);
    const playerBefore = game.getCurrentPlayer();  // "P1" or "P2"
    const isP1 = playerBefore === "P1";
    // X always goes first but which player IS X alternates each round
    const symbol = isP1
        ? (symbolFlipped ? "O" : "X")
        : (symbolFlipped ? "X" : "O");
    const result     = game.playMove(index);

    if (result === null) return;

    // Mark cell immediately for the pop animation
    e.target.classList.add("taken", symbol === "X" ? "x-cell" : "o-cell");
    e.target.textContent = symbol;

    updateUI();

    if (result === "win") {
        highlightWinners();
        boardDiv.classList.add("game-over");
        setTimeout(() => boardDiv.classList.remove("game-over"), 600);

        // playerBefore is still the winner — currentPlayer doesn't switch on win
        const winnerLabel = playerBefore === "P1" ? "PLAYER 1" : "PLAYER 2";
        resultText.textContent = winnerLabel + " WINS!";
        resultText.classList.add("show");
        playAgainBtn.style.display = "inline-flex";
        saveScores();
    }

    if (result === "draw") {
        boardDiv.classList.add("game-over");
        setTimeout(() => boardDiv.classList.remove("game-over"), 600);
        resultText.textContent = "DRAW!";
        resultText.classList.add("show");
        playAgainBtn.style.display = "inline-flex";
    }
});

playAgainBtn.addEventListener("click", () => {
    symbolFlipped = !symbolFlipped;
    game.resetBoard();
    resultText.textContent = "";
    resultText.classList.remove("show");
    playAgainBtn.style.display = "none";
    updateUI();
});

resetBtn.addEventListener("click", () => {
    symbolFlipped = false;
    game.resetScores();
    saveScores();
    updateUI();
});

function updateUI() {
    const board   = game.getBoard();
    const cells   = document.querySelectorAll(".cell");
    const scores  = game.getScores();
    const over    = game.isGameOver();
    const current = game.getCurrentPlayer();

    // Sync cell text + classes
    board.forEach((value, i) => {
        cells[i].textContent = value || "";
        if (value === "X") {
            cells[i].classList.add("taken", "x-cell");
            cells[i].classList.remove("o-cell");
        } else if (value === "O") {
            cells[i].classList.add("taken", "o-cell");
            cells[i].classList.remove("x-cell");
        } else {
            cells[i].classList.remove("taken", "x-cell", "o-cell", "winner");
        }
    });

    // Turn indicator — show correct symbol accounting for flip state
    if (!over) {
        const isP1 = current === "P1";
        const sym  = isP1
            ? (symbolFlipped ? "O" : "X")
            : (symbolFlipped ? "X" : "O");
        const cls  = sym === "X" ? "x-turn" : "o-turn";
        const name = isP1 ? "PLAYER 1" : "PLAYER 2";
        turnText.innerHTML = `<span class="${cls}">${sym}</span> — ${name}'S TURN`;
    } else {
        turnText.textContent = "";
    }

    // Score cards — p1ScoreText/p2ScoreText are the .score-value spans
    p1ScoreText.textContent = scores.P1;
    p2ScoreText.textContent = scores.P2;
}

function highlightWinners() {
    // Ask the game module for the winning combo if it exposes it,
    // otherwise fall back to scanning the board ourselves
    const board = game.getBoard();
    const lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];
    const cells = document.querySelectorAll(".cell");

    for (const [a,b,c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            cells[a].classList.add("winner");
            cells[b].classList.add("winner");
            cells[c].classList.add("winner");
            break;
        }
    }
}

function saveScores() {
    const scores = game.getScores();
    sessionStorage.setItem("P1", scores.P1);
    sessionStorage.setItem("P2", scores.P2);
}