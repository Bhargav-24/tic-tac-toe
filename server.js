const express = require("express");
const app = express();

app.get("/", (req,res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/game", (req,res) => {
    res.sendFile(__dirname + "/game.html");
});

app.listen(3000, ()=> {
    console.log("Server running on port 3000.");
});