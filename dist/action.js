'use strict';

var _googleActionsServer = require('@manekinekko/google-actions-server');

var _decisionTree = require('./decision-tree');

var TreeModel = require('tree-model');
var tree = new TreeModel();
var root = tree.parse(_decisionTree.DECISION_TREE);

var dict = {};
root.walk({ strategy: 'pre' }, function (node) {
    var l = node.model.label;
    if (!node.hasChildren()) {
        var path = node.getPath().splice(1);
        var leaf = path.pop();
        var str = path.map(function (n) {
            return n.model.label;
        }).join(' ');
        dict[str] = l;
    }
});
// console.log(dict);
var keys = Object.keys(dict);

var reds = require('reds');
var search = reds.createSearch('rxjs');
keys.forEach(function (k) {
    search.index(k, dict[k]);
});

function ___lookup(rawInput, cb) {
    var found = [];
    search.query(rawInput).type('and').end(function (err, ids) {
        if (err) {
            console.error(err);
        }
        cb(ids);
    });
}

var agent = new _googleActionsServer.ActionServer();
var c = 0;

agent.welcome(function (assistant) {
    var state = assistant.getDialogState();
    state.lastDecision = dict;

    var greeting = function greeting() {
        var g = ['Hi, this is Ben from the RxJS team, how can I help?', 'Hello, my name is Ben. I will help you choose your RxJS operator. Tell me what you need?', 'Hi, I\'m Ben, I\'m here to help you find an RxJS operator. What do you need?'];
        return g[Math.random() * g.length - 1 | 0];
    };

    var inputPrompt = assistant.buildInputPrompt(true, greeting());

    assistant.ask(inputPrompt, state);
});

//ActionServer.intent.action.MAIN
//ActionServer.intent.action.TEXT
//ActionServer.intent.action.PERMISSION
agent.intent(_googleActionsServer.ActionServer.intent.action.TEXT, function (assistant) /*state*/{

    // ask the user and listen for an anwser
    //assistant.ask();

    // reads the user's answer
    //assistant.getRawInput();

    // tell something to the user and stop listening
    //assistant.tell();

    var website = 'For more details, go to reactivex.io/rxjs .';
    var rawInput = assistant.getRawInput();
    var state = assistant.getDialogState();

    if (rawInput === 'no thanks' || rawInput === 'bye') {
        assistant.tell('Sure. ' + website + '. See you there.');
        return;
    } else if (rawInput.toLowerCase() === 'i need an observable') {
        rawInput = 'i need to create an observable';
    } else if (rawInput === 'make me an observable') {
        var inputPrompt = assistant.buildInputPrompt(true, '\n            <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">\n                Congratulations! You are now an observable\n            </audio>\n        ');
        assistant.ask(inputPrompt);
        return;
    }

    var found = ___lookup(rawInput, cb);

    var tryAgain = function tryAgain() {
        var g = ['Do you want to give it another shot?', 'Do you have another request?', 'Do you want to give it another try?'];
        return g[c++ % (g.length - 1)];
    };

    function cb(found) {
        if (found.length === 0) {
            assistant.ask('\n                    I heard you say: "' + rawInput + '". Could you be more specific?\n                ');
        } else if (found.length === 1) {
            assistant.ask('\n                    Alright, you should try out the ' + found + ' operator.\n                    ' + tryAgain() + '\n                ');
        } else if (found.length > 3) {
            var partial = found.splice(0, 3);
            assistant.ask('\n                    I found too many operators that match your request.\n                    Here are some of them: ' + partial.join('. Or. ') + '.\n                    ' + tryAgain() + '\n                ');
        }
    }
});
agent.listen();