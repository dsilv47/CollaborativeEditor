const express = require('express');
const app = express();
app.listen(3000);

app.get("/", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/ui.html");
});

app.get("/library", (req, res) => {
    res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    res.sendFile("/etc/nginx/project/example-crdt-main/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    console.log(req.params.id);
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no'
    });

    res.write("event: sync\n");
    res.write("data: test\n\n");
});

app.post("api/op/:id", (req, res) => {
    res.json({"status": "OK"});
});