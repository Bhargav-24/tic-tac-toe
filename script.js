const game = Game();

const boardDiv = document.querySelector(".board");
const turnText = document.getElementById("turn");
const resultText = document.getElementById("result");
const p1ScoreText = document.getElementById("p1score");
const p2ScoreText = document.getElementById("p2score");
const resetBtn = document.getElementById("reset");
const playAgainBtn = document.getElementById("playagain");

playAgainBtn.style.display = "none";

// Initialize board UI
for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    boardDiv.appendChild(cell);
}

updateUI();

boardDiv.addEventListener("click", (e) => {
    if (!e.target.classList.contains("cell")) return;

    const index = Number(e.target.dataset.index);
    const result = game.playMove(index);

    if (result === null) return;

    updateUI();

    if (result === "win") {
        resultText.textContent = game.getCurrentPlayer() + " Wins!";
        playAgainBtn.style.display = "inline-block";
        saveScores();
    }

    if (result === "draw") {
        resultText.textContent = "Draw!";
        playAgainBtn.style.display = "inline-block";
    }
});

playAgainBtn.addEventListener("click", () => {
    game.resetBoard();
    resultText.textContent = "";
    playAgainBtn.style.display = "none";
    updateUI();
});

resetBtn.addEventListener("click", () => {
    game.resetScores();
    saveScores();
    updateUI();
});

function updateUI() {
    const board = game.getBoard();
    const cells = document.querySelectorAll(".cell");

    board.forEach((value, i) => {
        cells[i].textContent = value ? value : "";
    });

    turnText.textContent = game.isGameOver()
        ? ""
        : game.getCurrentPlayer() + "'s Turn";

    const scores = game.getScores();
    p1ScoreText.textContent = "Player 1 Score: " + scores.P1;
    p2ScoreText.textContent = "Player 2 Score: " + scores.P2;
}

function saveScores() {
    const scores = game.getScores();
    sessionStorage.setItem("P1", scores.P1);
    sessionStorage.setItem("P2", scores.P2);
}