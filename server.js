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

app.listen(3000, ()=> {
    console.log("Server running on port 3000.");
});