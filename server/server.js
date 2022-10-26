const express = require('express');
const app = express();
app.listen(3000);

app.get("/", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/ui.html");
});

app.get("/ui.js", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/ui.js")
});

app.get("/library", (req, res) => {
    res.header("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    res.sendFile("/etc/nginx/project/example-crdt-main/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    res.set({
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive'
    });
    res.flushHeaders();

    res.write('');
});

app.post("api/op/:id", (req, res) => {
    res.json({"status": "OK"});
});