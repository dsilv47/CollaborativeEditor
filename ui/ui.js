import * as Y from 'yjs';
import { QuillBinding } from './y-quill';
import Quill from './quill';

var quill = new Quill('#editor', {
    theme: 'snow'
});

function openDoc() {
    let ydoc = new Y.Doc();
    let ytext = ydoc.getText('doc-contents');
    const binding = new QuillBinding(ytext, quill);

    let url = "/api/connect/" + document.getElementById("docid").value;
    const source = new EventSource(url);
    source.addEventListener('sync', event => {
        console.log("SYNC");
        console.log(event);
    });
    source.addEventListener('update', event => {
        console.log("UPDATE");
        console.log(event);
    });
}