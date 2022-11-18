const express = require('express');
const bodyParser = require('body-parser'); 
const mongo = require("mongodb").MongoClient;
const ObjectId = require('mongodb').ObjectID;
const { exec } = require('child_process');
const session = require("express-session");
const multer  = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/etc/nginx/media/access')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: "50mb" }
});
const Y = require('yjs');
const fs = require('fs');
const { Client } = require('@elastic/elasticsearch');
const app = express();
app.listen(3000);
require('events').EventEmitter.prototype._maxListeners = 1000;
require('events').defaultMaxListeners = 1000;

let docList = {};

let db, users, collections;

app.use(bodyParser.json({limit:'50mb'})); 
app.use(express.json());
app.use(session({
    secret: "356 lets go",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, expires: new Date(Date.now() + 604800000) }
}));
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

const es = new Client({
    node: 'http://localhost:9200'
});





app.get("/", (req, res) => {
    if (req.session.name) {
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
    /*if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }*/
    app.use(express.static("/etc/nginx/project/library/dist"));
    res.sendFile("/etc/nginx/project/library/dist/crdt.js");
});

app.get("/api/connect/:id", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    if (!docList[req.params.id]) {
        res.json({error: true, message: "No document with given ID exists"});
        return;
    }
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    });

    res.write("event: sync\n");
    let ydoc = docList[req.params.id].crdtObj;
    let docContents = Y.encodeStateAsUpdate(ydoc);
    docContents = Array.from(docContents);
    docList[req.params.id].resObjs.push(res);
    res.write("data: " + JSON.stringify(docContents) + "\n\n");

    let cursors = docList[req.params.id].cursors;
    for (let cursorKey in cursors) {
        let cursorObj = cursors[cursorKey];
        res.write("event: presence\n");
        let obj = {
            session_id: cursorObj.session_id,
            name: cursorObj.name,
            cursor: cursorObj.cursor
        }
        res.write("data: " + JSON.stringify(obj) + "\n\n");
    }
    
    res.once("close", function() {
        if (docList[req.params.id]) {
            docList[req.params.id].resObjs = docList[req.params.id].resObjs.filter(item => item != res);
            if (docList[req.params.id].cursors[req.session.email]) {
                delete docList[req.params.id].cursors[req.session.email];
            }
            let obj = {
                session_id: req.session.email,
                name: req.session.name,
                cursor: {}
            };
            for (let i = 0; i < docList[req.params.id].resObjs.length; i++) {
                let resObj = docList[req.params.id].resObjs[i];
                resObj.write("event: presence\n");
                resObj.write("data: " + JSON.stringify(obj) + "\n\n");
            }
        }
        res.end();
    });
});

app.post("/api/op/:id", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
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
        /*await es.delete({
                index: 'project',
                id: docList[req.params.id].docID
            }, {ignore: [404]});
        await es.index({
            index: 'project',
            id: docList[req.params.id].docID,
            document: {
                docID: docList[req.params.id].docID,
                name: docList[req.params.id].name,
                contents: ydoc.getText('doc-contents').toString()
            }
        });
        await es.indices.refresh({index: 'project'});*/
    }
    res.json({"status":"ok"});
});

app.post("/api/presence/:id", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let { index, length } = req.body;
    let obj = {
        session_id: req.session.email,
        name: req.session.name,
        cursor: {
            index: index,
            length: length
        }
    };
    if (docList[req.params.id]) {
        let cursors = docList[req.params.id].cursors;
        if (cursors[req.session.email]) {
            cursors[req.session.email].cursor = {index: index, length: length};
        }
        else {
            cursors[req.session.email] = obj;
        }

        for (let i = 0; i < docList[req.params.id].resObjs.length; i++) {
            let resObj = docList[req.params.id].resObjs[i];
            resObj.write("event: presence\n");
            resObj.write("data: " + JSON.stringify(obj) + "\n\n");
        }
    }
    res.json({"status":"ok"});
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
        let dupeEmail = await users.findOne({ email: email });
        if (dupeEmail) {
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

    req.session.name = user.name;
    req.session.email = user.email;
    req.session.save();

    res.json({ name: user.name });
});

app.post("/users/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.json({status: "ERROR"});
            return;
        }
    });
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
        return;
    }
    else {
        let updatedUsers = await users.findOneAndUpdate({email: email}, { $set: { verified: true } });
        res.json({ status: "OK" });
        return;
    }
});

function sendEmail(email, key) {
    let emailLink = "http://veed.cse356.compas.cs.stonybrook.edu/users/verify?email=" + encodeURIComponent(email) + "&key=" + key;
    let command = "echo \"" + emailLink + "\" | mail -s \"Verify Your Stony Docs Account\" --encoding=quoted-printable " + email;
    exec(command);
    //console.log(emailLink);
}

app.post("/collection/create", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let { name } = req.body;
    let ydoc = new Y.Doc();
    let ytext = ydoc.getText(name);
    let docID = Math.random().toString().slice(2,11);
    docList[docID] = { "docID": docID, "name": name, "crdtObj": ydoc, "resObjs": [], "cursors": {}, "lastModified": new Date() };
    res.json({id: docID});
});

app.post("/collection/delete", async (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let { id } = req.body;
    if (docList[id]) {
        for (let i in docList[id].resObjs) {
            let resObj = docList[id].resObjs[i];
            resObj.end();
        }
        await es.delete({
                index: 'project',
                id: id
            },{ignore: [404]});
        delete docList[id];
    }
    res.json({status: "OK"});
});

app.get("/collection/list", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
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

app.post("/media/upload", upload.single('file'), (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let file = req.file;
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/gif') {
        res.json({error: true, message: "Invalid MIME type"});
        return;
    }
    fs.readFile(file.path, 'base64', function (err, data) {
        if (err) console.log(err);
        //if (data) console.log(data);
    });
    res.json({mediaid: file.originalname});
});

app.get("/media/access/:mediaid", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let mediaid = req.params.mediaid;
    res.sendFile("/etc/nginx/media/access/" + mediaid);
});

app.get("/edit/:id", (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    app.use(express.static("/etc/nginx/project/build"));
    res.sendFile("/etc/nginx/project/build/index.html");
});

app.get("/home", async (req, res) => {
    await res.setHeader("X-CSE356", "6306d53f58d8bb3ef7f6be55");
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    res.sendFile("/etc/nginx/project/ui/home.html");
});

app.get("/index/search", async (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let { q } = req.query;
    for (let docKey in docList) {
        /*await es.delete({
                index: 'project',
                id: docList[docKey].docID
            }, {ignore: [404]});*/
        await es.index({
            index: 'project',
            id: docList[docKey].docID,
            document: {
                docID: docList[docKey].docID,
                name: docList[docKey].name,
                contents: docList[docKey].crdtObj.getText('doc-contents').toString()
            }
        });
    }
    await es.indices.refresh({index: 'project'});
    const searchRes = await es.search({
        index: 'project',
        body: {
            query: {
                match: {
                    contents: q
                }
            },
            highlight: {
                fragment_size: 100,
                fields: {
                    contents: {}
                }
            }
        }
    });
    let hitsArray = searchRes.hits.hits;
    hitsArray = hitsArray.sort((a, b) => b.score-a.score);
    let docs = [];
    for (let i = 0; i < Math.min(10, hitsArray.length); i++) {
        let hitsArrayItem = hitsArray[i]._source;
        let condensed = {
            docid: hitsArrayItem.docID,
            name: hitsArrayItem.name,
            snippet: hitsArray[i].highlight.contents.join(' '),
        };
        docs.push(condensed);
    }
    res.json(docs);
});

app.get("/index/suggest", async (req, res) => {
    if (!req.session.name) {
        res.json({error: true, message: "INVALID SESSION!"});
        return;
    }
    let { q } = req.query;
    for (let docKey in docList) {
        /*await es.delete({
                index: 'project',
                id: docList[docKey].docID
            }, {ignore: [404]});*/
        await es.index({
            index: 'project',
            id: docList[docKey].docID,
            document: {
                docID: docList[docKey].docID,
                name: docList[docKey].name,
                contents: docList[docKey].crdtObj.getText('doc-contents').toString()
            }
        });
    }
    await es.indices.refresh({index: 'project'});
    const suggestRes = await es.search({
        index: 'project',
        body: {
            query: {
                fuzzy: {
                    contents: {
                        value: q,
                        fuzziness: "AUTO:3,5"
                    }
                }
            },
            highlight: {
                fragment_size: q.length+1,
                fields: {
                    contents: {}
                }
            }
        }
    });
    let hitsArray = suggestRes.hits.hits;
    hitsArray = hitsArray.sort((a, b) => b.score-a.score);
    let suggestions = [];
    for (let i in hitsArray) {
        let hitsArrayItem = hitsArray[i];
        let filtered = hitsArrayItem.highlight.contents[0];
        let suggestion = filtered.substring(filtered.indexOf("<em>")+"<em>".length, filtered.indexOf("</em>"));
        suggestions.push(suggestion);
    }
    res.json(suggestions);
});