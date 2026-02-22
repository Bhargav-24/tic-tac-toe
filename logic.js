function Game() {
    let board = Array(9).fill(null);
    let currentPlayer = "P1";
    let gameOver = false;
    let scores = {
        P1: sessionStorage.getItem("P1") ? sessionStorage.getItem("P1") : 0,
        P2: sessionStorage.getItem("P2") ? sessionStorage.getItem("P2") : 0
    };

    const winPatterns = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];

    function playMove(index) {
        if (gameOver || board[index] !== null) return null;

        board[index] = currentPlayer === "P1" ? "X" : "O";

        if (checkWin()) {
            scores[currentPlayer]++;
            gameOver = true;
            return "win";
        }

        if (board.every(cell => cell !== null)) {
            gameOver = true;
            return "draw";
        }

        currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
        return "continue";
    }

    function checkWin() {
        return winPatterns.some(([a,b,c]) =>
            board[a] &&
            board[a] === board[b] &&
            board[b] === board[c]
        );
    }

    function resetBoard() {
        board = Array(9).fill(null);
        currentPlayer = "P1";
        gameOver = false;
    }

    function resetScores() {
        scores.P1 = 0;
        scores.P2 = 0;
    }

    return {
        playMove,
        resetBoard,
        resetScores,
        getBoard: () => board,
        getCurrentPlayer: () => currentPlayer,
        getScores: () => scores,
        isGameOver: () => gameOver
    };
}