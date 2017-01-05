'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _treeModel = require('tree-model');

var _treeModel2 = _interopRequireDefault(_treeModel);

var _cheerio = require('cheerio');

var _cheerio2 = _interopRequireDefault(_cheerio);

var _googleActionsServer = require('@manekinekko/google-actions-server');

var _decisionTree = require('./decision-tree');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RxJSAction = function () {
    function RxJSAction() {
        _classCallCheck(this, RxJSAction);

        // create a google action server
        this.agent = new _googleActionsServer.ActionServer();

        this.agent.setGreetings(['Hi, this is Ben Lesh, from the RxJS team, how can I help?', 'Hello, my name is Ben Lesh. I will help you choose your RxJS operator. Tell me what you need?', 'Hi, I\'m Ben Lesh, I\'m here to help you find an RxJS operator. What do you need?']);

        this.agent.setConversationMessages(['Do you want to try another request?', 'Do you have another request?', 'Do you want to give it another try?', 'Anything else I can help with?', 'What else do you want to know?']);

        this.assistant = null;
    }

    // build dictionary from decision tree


    _createClass(RxJSAction, [{
        key: 'trainDecisions',
        value: function trainDecisions() {
            var dictionary = [];
            var tree = new _treeModel2.default();
            var root = tree.parse(_decisionTree.DECISION_TREE);
            root.walk({ strategy: 'pre' }, function (node) {
                var operator = node.model.label;
                if (!node.hasChildren()) {
                    var path = node.getPath().splice(1);
                    var leaf = path.pop();
                    var scenario = path.map(function (n) {
                        return n.model.label;
                    }).join(' ');
                    dictionary.push({
                        operator: operator,
                        scenario: scenario
                    });
                }
            });

            this.agent.train('decision_list', dictionary, ['operator', 'scenario']);
        }
    }, {
        key: 'traindHotWords',
        value: function traindHotWords() {
            this.agent.train('hot_words', ['i need an observable', 'hey ben', 'hello ben', 'please', 'make me an observable', 'no', 'thanks', 'talk to you later', 'know more about', 'tell me more about', 'can you tell me more', 'who is André']);
        }

        // request remote docs from reactivex.io/rxjs

    }, {
        key: 'readDocs',
        value: function readDocs(op, resp) {
            var url = 'http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html';
            op = op.toLowerCase();

            this.agent.fetch(url, function (error, html) {
                html = html.toLowerCase();
                var $ = _cheerio2.default.load(html);
                var description = $('h3[id="instance-method-' + op + '"]').next('div[data-ice="description"]').children('p').first();

                resp(description && description.text());
            });
        }
    }, {
        key: 'lookupHotWords',
        value: function lookupHotWords(rawInput) {
            var lookupOptions = {
                threshold: function threshold(entry) {
                    console.log('entry==>', entry);
                    return entry.score > 0.5;
                },
                fields: {
                    // data is the default dataSet keyname
                    data: {
                        bool: 'OR',
                        expand: true
                    }
                }
            };
            return this.agent.matchUserRequest('hot_words', rawInput, null, lookupOptions);
        }

        // match user requests with common uses cases

    }, {
        key: 'lookupUserInput',
        value: function lookupUserInput(rawInput, responseCallback) {
            var lookupOptions = {
                threshold: function threshold(entry) {
                    console.log('entry==>', entry);
                    return entry.score > 0;
                },
                fields: {
                    scenario: {
                        boost: 2,
                        bool: 'AND',
                        expand: true
                    },
                    operator: {
                        boost: 1
                    }
                }
            };
            this.agent.matchUserRequest('decision_list', rawInput, responseCallback, lookupOptions);
        }

        // a convenient method to speak the description found on reactivex.io

    }, {
        key: 'sayDescription',
        value: function sayDescription(description, op) {
            var text = '\n            You said ' + op + '. \n            Sorry. I couldn\'t find the description of the ' + op + ' operator on reactivex.io.\n            Do you have an other request?\n        ';
            if (description) {
                text = '\n                According to reactivex.io, the ' + op + ' operator ' + description + '\n                Checkout reactivex.io/rxjs for more details.\n                Do you have an other request?\n            ';
            }
            this.agent.ask(text);
        }

        // the (default) intent triggered to welcome the user

    }, {
        key: 'welcomeIntent',
        value: function welcomeIntent(assistant) {
            this.assistant = assistant;
            this.agent.randomGreeting();
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
            var hotWord = this.lookupHotWords(rawInput).pop();

            // rephrase some works
            if (['i need an observable'].includes(hotWord)) {
                rawInput = 'i want an observable';
            }

            // bypass some words
            if (['hey ben', 'hello ben', 'please'].includes(hotWord)) {
                rawInput = rawInput.replace('hey ben', '').replace('hello ben', '').replace('please', '').trim();
            }

            // easter egg
            else if (['make me an observable'].includes(hotWord)) {
                    this.agent.ask('\n                <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">\n                    Congratulations! You are now an observable\n                </audio>\n            ');

                    // don't lookup
                    return false;
                } else if (['who is André'].includes(hotWord)) {
                    this.agent.ask('\n                According to his blog staltz.com: Andr\xE9 is a user interface programmer and reactive programming expert.\n                He is known as Andr\xE9 Staltz. Staltz is just a nickname that Andr\xE9 uses on the web since 2004. \n                His real name is Andr\xE9 Medeiros, but he tries to avoid it because \n                it\'s disappointingly unoriginal.\n                ' + this.agent.getRandomConversationMessage() + '\n            ');

                    // don't loopup
                    return false;
                }
                // end conversation
                else if (['no', 'thanks', 'bye', 'talk to you later'].includes(hotWord)) {
                        assistant.tell('Sure. ' + website + '. See you there.');

                        // don't lookup
                        return false;
                    }
                    // "tell me more about the XXX operator" request
                    else if (['tell me more about', 'i want to know more about'].includes(hotWord)) {
                            var op = rawInput.replace(/tell me more/ig, '').replace(/(the|operator|about)/ig, '').replace(/i want to know more/ig, '').trim();

                            if (!op) {
                                if (state && state.lastOperator) {
                                    if (state.lastOperator.length === 1) {
                                        op = state.lastOperator.pop();
                                    } else {
                                        this.agent.ask('\n                            You can only have more details about one operator at a time.\n                            For instance you can say: "Tell me more about the map operator".\n                        ');

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
                                this.agent.ask('\n                    You said ' + rawInput + '. Could you be more specific?\n                    For instance you can say: "Tell me more about the "mapTo" operator".\n                ');

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

            console.log('found', found, rawInput);

            switch (found.length) {
                case 0:
                    this.agent.ask('\n                    I heard you say: "' + rawInput + '". Could you be more specific?\n                ', { lastOperator: null });
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
                    this.agent.ask('\n                    ' + successPhrase().replace('%s', op) + '\n                    ' + this.agent.getRandomConversationMessage() + '\n                ', { lastOperator: found });
                    break;
                case 2:
                    this.agent.ask('\n                    I found 2 operators for you. The "' + found[0] + '" operator and "' + found[1] + '" operator.\n                    ' + this.agent.getRandomConversationMessage() + '\n                ', { lastOperator: found });
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
                    this.agent.ask('\n                    I found ' + found.length + ' operators that match your request' + phrase(arr) + ' \n                    ' + smartJoin(arr) + '. \n                    ' + this.agent.getRandomConversationMessage() + '\n                ', { lastOperator: arr });
            }
        }

        // start everything!!

    }, {
        key: 'listen',
        value: function listen() {
            this.trainDecisions();
            this.traindHotWords();

            // register intents and start server
            this.agent.welcome(this.welcomeIntent.bind(this));
            this.agent.intent(_googleActionsServer.ActionServer.intent.action.TEXT, this.textIntent.bind(this));
            this.agent.listen();
        }
    }]);

    return RxJSAction;
}();

new RxJSAction().listen();