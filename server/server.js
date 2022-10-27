const express = require('express');
const app = express();
app.listen(3000);

let docList = {};

app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/ui.html");
});

app.get("/library", (req, res) => {
    res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    res.sendFile("/etc/nginx/project/example-crdt-main/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    //console.log(req.params.id);
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no'
    });

    res.write("event: sync\n");
    let docContents;
    if (docList[req.params.id]) {
        docContents = docList[req.params.id].contents;
    }
    else {
        docList[req.params.id] = { "contents": "", "resObjs": [] };
        docContents = "";
    }
    docList[req.params.id].resObjs.push(res);
    res.write("data: " + docContents + "\n\n");
    
    res.on("close", function() {
        docList[req.params.id].resObjs = docList[req.params.id].resObjs.filter(item => item != res);
    });
});

app.post("/api/op/:id", (req, res) => {
    let payload = req.body;
    let update = [{"insert": "hello"}];
    if (docList[req.params.id]) {
        for (let i = 0; i < docList[req.params.id].resObjs.length; i++) {
            let resObj = docList[req.params.id].resObjs[i];
            resObj.write("event: update\n");
            resObj.write("data: " + JSON.stringify(update) + "\n\n");
        }
    }
});