'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _googleActionsServer = require('@manekinekko/google-actions-server');

var _decisionTree = require('./decision-tree');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var elasticlunr = require('elasticlunr');
var TreeModel = require('tree-model');
var request = require('request');
var cheerio = require('cheerio');

var RxJSAction = function () {
    function RxJSAction() {
        _classCallCheck(this, RxJSAction);

        // phrase random (incremental) counter
        this.phraseCounter = 0;

        this.dict = {};

        // Lunr indexes
        this.operatorIndex = {};
        this.hwIndex = {};

        this.assistant = null;

        // create tree model from rxjs decision tree
        this.tree = new TreeModel();

        this.__cache = {};
    }

    // build dictionary from decision tree


    _createClass(RxJSAction, [{
        key: 'buildDictionary',
        value: function buildDictionary() {
            var _this = this;

            var root = this.tree.parse(_decisionTree.DECISION_TREE);
            root.walk({ strategy: 'pre' }, function (node) {
                var l = node.model.label;
                if (!node.hasChildren()) {
                    var path = node.getPath().splice(1);
                    var leaf = path.pop();
                    var str = path.map(function (n) {
                        return n.model.label;
                    }).join(' ');
                    _this.dict[str] = l;
                }
            });
            this.keys = Object.keys(this.dict);
        }
    }, {
        key: 'buildHotWords',
        value: function buildHotWords() {
            var _this2 = this;

            this.hwIndex = elasticlunr(function () {
                this.setRef('word');
                this.addField('word');
                this.saveDocument(false);
            });

            ['i need an observable', 'hey ben', 'hello ben', 'please', 'make me an observable', 'no', 'thanks', 'talk to you later', 'know more about', 'tell me more about', 'can you tell me more', 'who is André'].map(function (k) {
                _this2.hwIndex.addDoc({
                    'word': k
                });
            });
        }

        // index keys and values for full text search

    }, {
        key: 'indexDictionnary',
        value: function indexDictionnary() {
            var _this3 = this;

            this.operatorIndex = elasticlunr(function () {
                this.setRef('operator');
                this.addField('scenario');
                this.addField('operator');
                this.saveDocument(false);
            });
            this.keys.forEach(function (k) {
                _this3.operatorIndex.addDoc({
                    'scenario': k,
                    'operator': _this3.dict[k]
                });
            });
        }

        // try again messages

    }, {
        key: 'tryAgain',
        value: function tryAgain() {
            var phrases = ['Do you want to try another request?', 'Do you have another request?', 'Do you want to give it another try?', 'Anything else I can help with?', 'What else do you want to know?'];
            return phrases[this.phraseCounter++ % (phrases.length - 1)];
        }

        // greeting messages

    }, {
        key: 'greeting',
        value: function greeting() {
            var phrases = ['Hi, this is Ben Lesh, from the RxJS team, how can I help?', 'Hello, my name is Ben Lesh. I will help you choose your RxJS operator. Tell me what you need?', 'Hi, I\'m Ben Lesh, I\'m here to help you find an RxJS operator. What do you need?'];
            return phrases[Math.random() * phrases.length - 1 | 0];
        }

        // request remote docs from reactivex.io/rxjs

    }, {
        key: 'readDocs',
        value: function readDocs(op, resp) {
            var _this4 = this;

            var url = 'http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html';
            op = op.toLowerCase();

            if (this.__cache[op]) {
                console.log('use cached doc', op);
                resp(this.__cache[op], op);
            } else {
                request(url, function (error, response, html) {
                    if (!error && response.statusCode == 200) {
                        html = html.toLowerCase();
                        var $ = cheerio.load(html);
                        var description = $('h3[id="instance-method-' + op + '"]').next('div[data-ice="description"]').children('p').first();

                        _this4.__cache[op] = null;
                        if (description) {
                            _this4.__cache[op] = description.text();
                        }
                        resp(_this4.__cache[op], op);
                    }
                });
            }
        }
    }, {
        key: 'lookupHotWords',
        value: function lookupHotWords(rawInput) {
            var found = this.hwIndex.search(rawInput, {
                fields: {
                    word: {
                        bool: 'OR',
                        expand: true
                    }
                }
            });

            found = found.sort(function (d1, d2) {
                return d1.score >= d2.score;
            }).filter(function (d) {
                return d.score > 1;
            }).map(function (d) {
                return d.ref;
            }).pop();

            return found;
        }

        // match user requests with common uses cases

    }, {
        key: 'lookupUserInput',
        value: function lookupUserInput(rawInput, cb) {
            var found = this.operatorIndex.search(rawInput, {
                fields: {
                    scenario: {
                        boost: 2,
                        bool: 'AND',
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

            cb(found, rawInput);
            return found;
        }

        // a convenient method to abstract the assistant "ask" process

    }, {
        key: 'ask',
        value: function ask(message) {
            var stateData = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

            var inputPrompt = this.assistant.buildInputPrompt(true, message);
            this.assistant.data = stateData;
            this.assistant.ask(inputPrompt);
        }

        // a convenient method to speak the description found on reactivex.io

    }, {
        key: 'sayDescription',
        value: function sayDescription(description, op) {
            var text = '\n            You said ' + op + '. \n            Sorry. I couldn\'t find the description of the ' + op + ' operator on reactivex.io.\n            Do you have an other request?\n        ';
            if (description) {
                text = '\n                According to reactivex.io, the ' + op + ' operator ' + description + '\n                Checkout reactivex.io/rxjs for more details.\n                Do you have an other request?\n            ';
            }
            this.ask(text);
        }

        // the (default) intent triggered to welcome the user

    }, {
        key: 'welcomeIntent',
        value: function welcomeIntent(assistant) {
            this.assistant = assistant;
            this.ask(this.greeting());
        }

        // the intent triggered on user's requests

    }, {
        key: 'textIntent',
        value: function textIntent(assistant) {
            this.assistant = assistant;

            var website = 'For more details, go to reactivex.io/rxjs.';
            var rawInput = assistant.getRawInput();
            var state = assistant.data;

            // hot phrases
            rawInput = rawInput.toLowerCase();
            var hw = this.lookupHotWords(rawInput);

            // rephrase some works
            if (['i need an observable'].includes(hw)) {
                rawInput = 'i want an observable';
            }

            // bypass some words
            if (['hey ben', 'hello ben', 'please'].includes(hw)) {
                rawInput = rawInput.replace('hey ben', '').replace('hello ben', '').replace('please', '').trim();
            }

            // easter egg
            else if (['make me an observable'].includes(hw)) {
                    this.ask('\n                <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">\n                    Congratulations! You are now an observable\n                </audio>\n            ');

                    // don't lookup
                    return false;
                } else if (['who is André'].includes(hw)) {
                    this.ask('\n                According to his blog staltz.com: Andr\xE9 is a user interface programmer and reactive programming expert.\n                He is known as Andr\xE9 Staltz. Staltz is just a nickname that Andr\xE9 uses on the web since 2004. \n                His real name is Andr\xE9 Medeiros, but he tries to avoid it because \n                it\'s disappointingly unoriginal.\n                ' + this.tryAgain() + '\n            ');

                    // don't loopup
                    return false;
                }
                // end conversation
                else if (['no', 'thanks', 'bye', 'talk to you later'].includes(hw)) {
                        assistant.tell('Sure. ' + website + '. See you there.');

                        // don't lookup
                        return false;
                    }
                    // "tell me more about the XXX operator" request
                    else if (['tell me more about', 'i want to know more about'].includes(hw)) {
                            var op = rawInput.replace(/tell me more/ig, '').replace(/(the|operator|about)/ig, '').replace(/i want to know more/ig, '').trim();

                            if (!op) {
                                if (state && state.lastOperator) {
                                    if (state.lastOperator.length === 1) {
                                        op = state.lastOperator.pop();
                                    } else {
                                        this.ask('\n                            You can only have more details about one operator at a time.\n                            For instance you can say: "Tell me more about the map operator".\n                        ');

                                        // don't lookup
                                        return false;
                                    }
                                }
                            }

                            if (op) {
                                this.readDocs(op, this.sayDescription.bind(this));

                                // don't lookup
                                return false;
                            } else {
                                this.ask('\n                    You said ' + rawInput + '. Could you be more specific?\n                    For instance you can say: "Tell me more about the "mapTo" operator".\n                ');

                                // don't lookup
                                return false;
                            }
                        }

            this.lookupUserInput(rawInput, this.lookupCallback.bind(this));
        }

        // this callback is triggered every time we run a lookup (see the lookup method)

    }, {
        key: 'lookupCallback',
        value: function lookupCallback(found, rawInput) {
            switch (found.length) {
                case 0:
                    this.ask('\n                    I heard you say: "' + rawInput + '". Could you be more specific?\n                ', { lastOperator: null });
                    break;
                case 1:
                    var op = found[0];
                    var successPhrase = function successPhrase() {
                        var s = [
                        // 'Alright, you should try out the "%s" operator.',
                        // 'Well, the "%s" operator is what you are looking for.',
                        // 'For this specific use case, the "%s" operator would be fine.',
                        // 'May be the "%s" operator could help.',
                        // 'I believe the "%s" operator is perfect for that.',
                        'André Staltz suggests you try the "%s" operator.'];
                        return s[Math.random() * (s.length - 1) | 0];
                    };
                    this.ask('\n                    ' + successPhrase().replace('%s', op) + '\n                    ' + this.tryAgain() + '\n                ', { lastOperator: found });
                    break;
                case 2:
                    this.ask('\n                    I found 2 operators for you. The "' + found[0] + '" operator and "' + found[1] + '" operator.\n                    ' + this.tryAgain() + '\n                ', { lastOperator: found });
                    break;
                default:
                    var partial = function partial(found) {
                        var cloned = Object.create(found);
                        var r = function r() {
                            return Math.random() * (cloned.length - 1) | 0;
                        };
                        return [cloned.splice(r(), 1), cloned.splice(r(), 1), cloned.splice(r(), 1)];
                    };
                    var phrase = function phrase() {
                        return found.length === 3 ? ':' : '. Here are 3 of them:';
                    };
                    var smartJoin = function smartJoin(arr) {
                        var last = arr.pop();
                        return '"' + arr.join('", "') + '" and "' + last + '"';
                    };
                    var arr = partial(found);
                    this.ask('\n                    I found ' + found.length + ' operators that match your request' + phrase(arr) + ' \n                    ' + smartJoin(arr) + '. \n                    ' + this.tryAgain() + '\n                ', { lastOperator: arr });
            }
        }

        // start everything!!

    }, {
        key: 'listen',
        value: function listen() {
            this.buildDictionary();
            this.indexDictionnary();
            this.buildHotWords();

            // create a google action server
            var agent = new _googleActionsServer.ActionServer();

            // register intents and start server
            agent.welcome(this.welcomeIntent.bind(this));
            agent.intent(_googleActionsServer.ActionServer.intent.action.TEXT, this.textIntent.bind(this));
            agent.listen();
        }
    }]);

    return RxJSAction;
}();

new RxJSAction().listen();