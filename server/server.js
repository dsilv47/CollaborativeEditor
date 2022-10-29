const express = require('express');
const Y = require('yjs');
const app = express();
app.listen(3000);

let docList = {};

app.use(express.json());
app.use(express.static("/etc/nginx/project/build"));

app.get("/", (req, res) => {
    res.sendFile("/etc/nginx/project/build/index.html");
});

app.get("/library", (req, res) => {
    res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    res.sendFile("/etc/nginx/project/example-crdt-main/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    });

    res.write("event: sync\n");
    let docContents;
    if (docList[req.params.id]) {
        let ydoc = docList[req.params.id].crdtObj;
        let ytext = ydoc.getText(req.params.id);
        docContents = ytext.toDelta();
    }
    else {
        let ydoc = new Y.Doc();
        let ytext = ydoc.getText(req.params.id);
        docList[req.params.id] = { "crdtObj": ydoc, "resObjs": [] };
        docContents = ytext.toDelta();
    }
    docList[req.params.id].resObjs.push(res);
    res.write("data: " + JSON.stringify(docContents) + "\n\n");
    
    res.on("close", function() {
        docList[req.params.id].resObjs = docList[req.params.id].resObjs.filter(item => item != res);
    });
});

app.post("/api/op/:id", (req, res) => {
    let update = req.body;
    if (docList[req.params.id]) {
        let ydoc = docList[req.params.id].crdtObj;
        let ytext = ydoc.getText(req.params.id);
        ytext.applyDelta(update);
        for (let i = 0; i < docList[req.params.id].resObjs.length; i++) {
            let resObj = docList[req.params.id].resObjs[i];
            resObj.write("event: update\n");
            resObj.write("data: " + JSON.stringify(update) + "\n\n");
        }
    }
    res.json({"status":"ok"});
});