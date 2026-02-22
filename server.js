const express = require("express");
const path = require("path");
const app = express();

app.use(express.static(path.join(__dirname)));

app.get("/", (req,res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/game", (req,res) => {
    res.sendFile(__dirname + "/game.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});