const express = require('express');
const mongo = require("mongodb").MongoClient;
const ObjectId = require('mongodb').ObjectID;
const { exec } = require('child_process');
const session = require("cookie-session");
const multer  = require('multer');
const upload = multer({ dest: '/etc/nginx/media/access/' });
const Y = require('yjs');
const app = express();
app.listen(3000);

let docList = {};

let db, users, collections;

app.use(express.json());
app.use(session({ name: 'session', keys: ['key1', 'key2'] }));
//app.use(express.static("/etc/nginx/project/build"));
//app.use(express.static("/etc/nginx/project/library/dist"));

mongo.connect("mongodb://localhost:27017", { useNewUrlParser: true, useUnifiedTopology: true, }, (err, client) => {
		if (err) {
			console.error(err);
			return;
		}
		db = client.db("project");
		users = db.collection("users");
        collections = db.collection("collections");
	}
);





app.get("/", (req, res) => {
    if (req.session.user) {
        //app.use(express.static("/etc/nginx/project/build"));
        //res.sendFile("/etc/nginx/project/build/index.html");
        res.redirect("/home");
    }
    else {
        res.sendFile("/etc/nginx/project/ui/login.html");
    }
});

app.get("/library/crdt.js", async (req, res) => {
    await res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    app.use(express.static("/etc/nginx/project/library/dist"));
    res.sendFile("/etc/nginx/project/library/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    });

    res.write("event: sync\n");
    if (!docList[req.params.id]) {
        res.json({error: true, message: "No document with given ID exists"});
        return;
    }
    let ydoc = docList[req.params.id].crdtObj;
    let docContents = Y.encodeStateAsUpdate(ydoc);
    docContents = Array.from(docContents);
    docList[req.params.id].resObjs.push(res);
    res.write("data: " + JSON.stringify(docContents) + "\n\n");
    
    res.on("close", function() {
        docList[req.params.id].resObjs = docList[req.params.id].resObjs.filter(item => item != res);
    });
});

app.post("/api/op/:id", (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let update = req.body;
    if (docList[req.params.id]) {
        let ydoc = docList[req.params.id].crdtObj;
        Y.applyUpdate(ydoc, Uint8Array.from(update));
        docList[req.params.id].lastModified = new Date();
        for (let i = 0; i < docList[req.params.id].resObjs.length; i++) {
            let resObj = docList[req.params.id].resObjs[i];
            resObj.write("event: update\n");
            resObj.write("data: " + JSON.stringify(update) + "\n\n");
        }
    }
    res.json({"status":"ok"});
});

app.post("/api/presence/:id", (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }

});

app.get("/users/signup", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/signup.html");
});

app.post("/users/signup", async (req, res) => {
    let { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        res.json({error: true, message: "Request Body Missing Fields"});
        return;
    }
    try {
        let dupeUsername = await users.findOne({ name: name });
        let dupeEmail = await users.findOne({ email: email });
        if (dupeUsername || dupeEmail) {
            res.json({error: true, message: "Duplicate User"});
            return;
        }

        const verifyKey = Math.random().toString().slice(2,11);

        users.insertOne( { name: name, email: email, password: password, verified: false, verifyKey: verifyKey } );
        
        sendEmail(req.body.email, verifyKey);
        res.json({ status: "OK" });
        return;
    } catch (e) {
        console.log(e);
        res.json({error: true, message: "Mongo Error"});
        return;
    };
});

app.get("/users/login", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/login.html");
});

app.post("/users/login", async (req, res) => {
    let { email, password } = req.body;
    let user = await users.findOne({ email: email });

    if (!user || !user.verified || user.password !== password) {
        res.json({error: true, message: "Login Error"});
        return;
    }

    req.session.user = user.name;

    res.cookie('name', user.name);
    res.json({ name: user.name });
});

app.post("/users/logout", async (req, res) => {
    req.session = null;
    res.json({status: "OK" });
});

app.get("/users/verify", async (req, res) => {
    let { email, key } = req.query;
    if (!email || !key) {
        res.json({error: true, message: "Query Missing Fields"});
        return;
    }
    let user = await users.findOne({ email: email });
    if (!user || user.verifyKey !== key) {
        res.json({error: true, message: "Login Error"});
    }
    else {
        let updatedUsers = await users.findOneAndUpdate({email: email}, { $set: { verified: true } });
        res.json({ status: "OK" });
    }
});

function sendEmail(email, key) {
    let emailLink = "http://veed.cse356.compas.cs.stonybrook.edu/users/verify?email=" + encodeURIComponent(email) + "&key=" + key;
    /*let command = "echo \"" + emailLink + "\" | mail -s \"Verify Your Stony Docs Account\" --encoding=quoted-printable " + email;
    exec(command);*/
    console.log(emailLink);
}

app.post("/collection/create", async (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let { name } = req.body;
    let ydoc = new Y.Doc();
    let ytext = ydoc.getText(name);
    let docID = Math.random().toString().slice(2,11);
    docList[docID] = { "docID": docID, "name": name, "crdtObj": ydoc, "resObjs": [], "lastModified": new Date() };
    res.json({id: docID});
});

app.post("/collection/delete", async (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let { id } = req.body;
    if (docList[id]) {
        for (res in docList[id].resObjs) {
            res.end();
        }
        delete docList[id];
    }
    res.json({status: "OK"});
});

app.get("/collection/list", async (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let sortDocs = [];
    for (let docKey in docList) {
        let doc = docList[docKey];
        sortDocs.push(doc);
    }
    sortDocs = sortDocs.sort((a, b) => b.lastModified-a.lastModified);
    let docs = [];
    for (let i = 0; i < Math.min(10, sortDocs.length); i++) {
        let doc = sortDocs[i];
        docs.push({id: doc.docID, name: doc.name});
    }
    res.json(docs);
});

app.get("/media/upload", (req, res) => {
    res.sendFile("/etc/nginx/project/ui/uploadmedia.html");
});

app.post("/media/upload", upload.single('file'), async (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let file = req.file;
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') {
        res.json({error: true, message: "Invalid MIME type"});
    }
    res.download(file.path, file);
});

app.get("/media/access/:mediaid", async (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    let mediaid = req.params.mediaid;
    res.sendFile("/etc/nginx/media/access/" + mediaid);
});

app.get("/edit/:id", (req, res) => {
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    app.use(express.static("/etc/nginx/project/build"));
    res.sendFile("/etc/nginx/project/build/index.html");
});

app.get("/home", async (req, res) => {
    await res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    if (!req.session.user) {
        res.json({error: true, message: "INVALID SESSION!"});
    }
    res.sendFile("/etc/nginx/project/ui/home.html");
});