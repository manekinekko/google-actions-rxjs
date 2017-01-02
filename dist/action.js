'use strict';

var _googleActionsServer = require('@manekinekko/google-actions-server');

var _decisionTree = require('./decision-tree');

// build dictionary from decision tree
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
var keys = Object.keys(dict);

// index keys and values for full text search
var elasticlunr = require('elasticlunr');
var index = elasticlunr(function () {
    this.setRef('operator');
    this.addField('scenario');
    this.addField('operator');
    this.saveDocument(false);
});
keys.forEach(function (k) {
    index.addDoc({
        "scenario": k,
        "operator": dict[k]
    });
});

// create a google action server
var agent = new _googleActionsServer.ActionServer();
var c = 0;

function lookup(rawInput, cb) {
    var found = [];
    found = index.search(rawInput, {
        fields: {
            scenario: {
                boost: 2,
                bool: "AND",
                expand: true
            },
            operator: { boost: 1 }
        }
    });
    found = found.sort(function (d1, d2) {
        return d1.score >= d2.score;
    }).map(function (d) {
        return d.ref;
    });

    cb(found);
    return found;
}

function welcomeIntent(assistant) {
    var greeting = function greeting() {
        var g = ['Hi, this is Ben from the RxJS team, how can I help?', 'Hello, my name is Ben. I will help you choose your RxJS operator. Tell me what you need?', 'Hi, I\'m Ben, I\'m here to help you find an RxJS operator. What do you need?'];
        return g[Math.random() * g.length - 1 | 0];
    };

    var inputPrompt = assistant.buildInputPrompt(true, greeting());
    var state = assistant.getDialogState();
    assistant.ask(inputPrompt, state);
}

function textIntent(assistant) {

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

    lookup(rawInput, cb);

    function cb(found) {

        var tryAgain = function tryAgain() {
            var g = ['Do you want to give it another shot?', 'Do you have another request?', 'Do you want to give it another try?'];
            return g[c++ % (g.length - 1)];
        };

        if (found.length === 0) {
            assistant.ask('\n                    I heard you say: "' + rawInput + '". Could you be more specific?\n                ');
        } else if (found.length === 1) {
            assistant.ask('\n                    Alright, you should try out the "' + found.pop() + '" operator.\n                    ' + tryAgain() + '\n                ');
        } else if (found.length === 2) {
            assistant.ask('\n                    I found two operators for you. The "' + found.pop() + '" operator and "' + found.pop() + '" operator.\n                    Try to describe more your use use. ' + tryAgain() + '\n                ');
        } else if (found.length >= 3) {
            var partial = function partial() {
                var r = function r() {
                    return Math.random() * (found.length - 1) | 0;
                };
                return [found.splice(r(), 1), found.splice(r(), 1), found.splice(r(), 1)];
            };
            assistant.ask('\n                    I found too many operators that match your request.\n                    Here are some of them: "' + partial().join('". Or. "') + '.\n                    ' + tryAgain() + '\n                ');
        }
    }
}

// register intents and start server
agent.welcome(welcomeIntent);
agent.intent(_googleActionsServer.ActionServer.intent.action.TEXT, textIntent);
agent.listen();