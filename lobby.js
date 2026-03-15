const socket = io();

// ─── Screens ──────────────────────────────────────────────────────────────────
const screenChoose     = document.getElementById("screenChoose");
const screenWaiting    = document.getElementById("screenWaiting");
const screenJoin       = document.getElementById("screenJoin");
const screenConnecting = document.getElementById("screenConnecting");

const btnCreate       = document.getElementById("btnCreate");
const btnShowJoin     = document.getElementById("btnShowJoin");
const btnJoin         = document.getElementById("btnJoin");
const btnBackToChoose = document.getElementById("btnBackToChoose");
const btnCancelWait   = document.getElementById("btnCancelWait");
const btnCopy         = document.getElementById("btnCopy");

const codeDisplay  = document.getElementById("codeDisplay");
const shareLink    = document.getElementById("shareLink");
const joinError    = document.getElementById("joinError");
const codeInputs   = document.querySelectorAll(".code-digit");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showScreen(el) {
    [screenChoose, screenWaiting, screenJoin, screenConnecting].forEach(s =>
        s.classList.add("hidden")
    );
    el.classList.remove("hidden");
}

function showError(msg) {
    joinError.textContent = msg;
    joinError.classList.remove("hidden");
}

function hideError() { joinError.classList.add("hidden"); }

function getTypedCode() {
    return Array.from(codeInputs).map(i => i.value).join("");
}

// ─── Auto-fill code from URL ?room=XXXXXX (shared link) ──────────────────────
const urlCode = new URLSearchParams(window.location.search).get("room");
if (urlCode && urlCode.length === 6) {
    showScreen(screenJoin);
    urlCode.split("").forEach((ch, i) => {
        if (codeInputs[i]) {
            codeInputs[i].value = ch;
            codeInputs[i].classList.add("filled");
        }
    });
}

// ─── 6-digit input UX ────────────────────────────────────────────────────────
codeInputs.forEach((input, idx) => {
    input.addEventListener("input", () => {
        const val = input.value.replace(/\D/g, "");
        input.value = val.slice(-1);
        input.classList.toggle("filled", !!val);
        if (val && idx < codeInputs.length - 1) codeInputs[idx + 1].focus();
        hideError();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && idx > 0) {
            codeInputs[idx - 1].focus();
            codeInputs[idx - 1].value = "";
            codeInputs[idx - 1].classList.remove("filled");
        }
        if (e.key === "Enter") btnJoin.click();
    });

    input.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
            .getData("text").replace(/\D/g, "").slice(0, 6);
        pasted.split("").forEach((ch, i) => {
            if (codeInputs[i]) {
                codeInputs[i].value = ch;
                codeInputs[i].classList.add("filled");
            }
        });
        codeInputs[Math.min(pasted.length, codeInputs.length - 1)].focus();
    });
});

// ─── Button handlers ──────────────────────────────────────────────────────────
btnCreate.addEventListener("click", () => socket.emit("create-room"));

btnShowJoin.addEventListener("click", () => {
    showScreen(screenJoin);
    codeInputs[0].focus();
});

btnBackToChoose.addEventListener("click", () => {
    showScreen(screenChoose);
    hideError();
});

btnCancelWait.addEventListener("click", () => {
    // Emit cancel explicitly — don't rely solely on disconnect event
    // because on slow/free servers the disconnect can arrive late
    socket.emit("cancel-room");
    socket.disconnect();
    window.location.href = "/";
});

btnJoin.addEventListener("click", () => {
    const code = getTypedCode();
    if (code.length !== 6) { showError("ENTER ALL 6 DIGITS"); return; }
    hideError();

    // Show a brief "checking" state before joining —
    // gives the server time to process any recent room cancellations
    // (important on slow/free-tier servers)
    btnJoin.textContent   = "CHECKING...";
    btnJoin.style.opacity = "0.5";
    btnJoin.style.pointerEvents = "none";

    setTimeout(() => {
        btnJoin.textContent   = "▶ JOIN";
        btnJoin.style.opacity = "";
        btnJoin.style.pointerEvents = "";
        socket.emit("join-room", { code });
    }, 1500);
});

btnCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(shareLink.value).then(() => {
        btnCopy.textContent = "✓";
        setTimeout(() => { btnCopy.textContent = "COPY"; }, 1500);
    });
});

// ─── Socket events ────────────────────────────────────────────────────────────
socket.on("room-created", ({ code, token }) => {
    // Save token — this is how we'll prove our identity on the game page
    sessionStorage.setItem("ttt_token", token);
    sessionStorage.setItem("ttt_code",  code);

    codeDisplay.textContent = code;
    shareLink.value = `${window.location.origin}/lobby?room=${code}`;
    showScreen(screenWaiting);
});

socket.on("join-error", ({ message }) => {
    showScreen(screenJoin);
    showError(message.toUpperCase());
});

socket.on("game-start", ({ code, token }) => {
    // Save our token before navigating away
    sessionStorage.setItem("ttt_token", token);
    sessionStorage.setItem("ttt_code",  code);

    showScreen(screenConnecting);
    setTimeout(() => {
        window.location.href = `/online-game?room=${code}`;
    }, 600);
});