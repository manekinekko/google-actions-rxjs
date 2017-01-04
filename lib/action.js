import TreeModel from 'tree-model';
import cheerio from 'cheerio';
import { ActionServer } from '@manekinekko/google-actions-server';
import { DECISION_TREE } from './decision-tree';

class RxJSAction {
    constructor() {

        // create a google action server
        this.agent = new ActionServer();

        this.agent.setGreetings([
            `Hi, this is Ben Lesh, from the RxJS team, how can I help?`,
            `Hello, my name is Ben Lesh. I will help you choose your RxJS operator. Tell me what you need?`,
            `Hi, I'm Ben Lesh, I'm here to help you find an RxJS operator. What do you need?`
        ]);

        this.agent.setConversationMessages([
            `Do you want to try another request?`,
            `Do you have another request?`,
            `Do you want to give it another try?`,
            `Anything else I can help with?`,
            `What else do you want to know?`
        ]);

        this.assistant = null;
    }

    // build dictionary from decision tree
    trainDecisions() {
        const dictionary = [];
        const tree = new TreeModel();
        const root = tree.parse(DECISION_TREE);
        root.walk({ strategy: 'pre' }, (node) => {
            const operator = node.model.label;
            if (!node.hasChildren()) {
                const path = node.getPath().splice(1);
                const leaf = path.pop();
                const scenario = path.map(n => n.model.label).join(' ');
                dictionary.push({
                    operator,
                    scenario
                });
            }
        });

        this.agent.train('decision_list', dictionary, ['operator', 'scenario']);
    }

    traindHotWords() {
        this.agent.train('hot_words', [
            'i need an observable',
            'hey ben',
            'hello ben',
            'please',
            'make me an observable',
            'no',
            'thanks',
            'talk to you later',
            'know more about',
            'tell me more about',
            'can you tell me more',
            'who is André'
        ]);
    }

    // request remote docs from reactivex.io/rxjs
    readDocs(op, resp) {
        const url = `http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html`;
        op = op.toLowerCase();

        this.agent.fetch(url, (error, html) => {
            html = html.toLowerCase();
            const $ = cheerio.load(html);
            const description = $(`h3[id="instance-method-${op}"]`)
                .next('div[data-ice="description"]')
                .children('p')
                .first();

            resp(description && description.text());

        });
    }

    lookupHotWords(rawInput) {
        const lookupOptions = {
            threshold: entry => {
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
    lookupUserInput(rawInput, responseCallback) {
        const lookupOptions = {
            threshold: entry => {
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
    sayDescription(description, op) {
        let text = `
            You said ${op}. 
            Sorry. I couldn't find the description of the ${op} operator on reactivex.io.
            Do you have an other request?
        `;
        if (description) {
            text = `
                According to reactivex.io, the ${op} operator ${description}
                Checkout reactivex.io/rxjs for more details.
                Do you have an other request?
            `;
        }
        this.agent.ask(text);
    }

    // the (default) intent triggered to welcome the user
    welcomeIntent(assistant) {
        this.assistant = assistant;
        this.agent.randomGreeting();
    }

    // the intent triggered on user's requests
    textIntent(assistant) {
        this.assistant = assistant;

        const website = `For more details, go to reactivex.io/rxjs.`;
        let rawInput = assistant.getRawInput();
        let state = assistant.data;

        // hot phrases
        rawInput = rawInput.toLowerCase();
        const hotWord = this.lookupHotWords(rawInput).pop();

        // rephrase some works
        if (['i need an observable'].includes(hotWord)) {
            rawInput = 'i want an observable';
        }

        // bypass some words
        if (['hey ben', 'hello ben', 'please'].includes(hotWord)) {
            rawInput = rawInput
                .replace('hey ben', '')
                .replace('hello ben', '')
                .replace('please', '')
                .trim();
        }

        // easter egg
        else if (['make me an observable'].includes(hotWord)) {
            this.agent.ask(`
                <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">
                    Congratulations! You are now an observable
                </audio>
            `);

            // don't lookup
            return false;
        } else if (['who is André'].includes(hotWord)) {
            this.agent.ask(`
                According to his blog staltz.com: André is a user interface programmer and reactive programming expert.
                He is known as André Staltz. Staltz is just a nickname that André uses on the web since 2004. 
                His real name is André Medeiros, but he tries to avoid it because 
                it's disappointingly unoriginal.
                ${this.agent.randomConversationMessage()}
            `);

            // don't loopup
            return false;
        }
        // end conversation
        else if (['no', 'thanks', 'bye', 'talk to you later'].includes(hotWord)) {
            assistant.tell(`Sure. ${website}. See you there.`);

            // don't lookup
            return false;
        }
        // "tell me more about the XXX operator" request
        else if (['tell me more about', 'i want to know more about'].includes(hotWord)) {
            let op = rawInput.replace(/tell me more/ig, '')
                .replace(/(the|operator|about)/ig, '')
                .replace(/i want to know more/ig, '')
                .trim();

            if (!op) {
                if (state && state.lastOperator) {
                    if (state.lastOperator.length === 1) {
                        op = state.lastOperator.pop();
                    } else {
                        this.agent.ask(`
                            You can only have more details about one operator at a time.
                            For instance you can say: "Tell me more about the map operator".
                        `);

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
                this.agent.ask(`
                    You said ${rawInput}. Could you be more specific?
                    For instance you can say: "Tell me more about the "mapTo" operator".
                `);

                // don't lookup
                return false;
            }

        }

        this.lookupUserInput(rawInput, this.lookupCallback.bind(this));
    }

    // this callback is triggered every time we run a lookup (see the lookup method)
    lookupCallback(found, rawInput) {

        console.log('found', found, rawInput);

        switch (found.length) {
            case 0:
                this.agent.ask(`
                    I heard you say: "${rawInput}". Could you be more specific?
                `, { lastOperator: null });
                break;
            case 1:
                const op = found[0];
                const successPhrase = () => {
                    const s = [
                        // 'Alright, you should try out the "%s" operator.',
                        // 'Well, the "%s" operator is what you are looking for.',
                        // 'For this specific use case, the "%s" operator would be fine.',
                        // 'May be the "%s" operator could help.',
                        // 'I believe the "%s" operator is perfect for that.',
                        'André Staltz suggests you try the "%s" operator.',
                        // 'Kwon Oh-joong thinks the "%s" operator is what you are looking for.'
                    ];
                    return s[(Math.random() * (s.length - 1)) | 0];
                }
                this.agent.ask(`
                    ${ successPhrase().replace('%s', op) }
                    ${this.agent.randomConversationMessage()}
                `, { lastOperator: found });
                break;
            case 2:
                this.agent.ask(`
                    I found 2 operators for you. The "${found[0]}" operator and "${found[1]}" operator.
                    ${this.agent.randomConversationMessage()}
                `, { lastOperator: found });
                break;
            default:
                const partial = (found) => {
                    const cloned = Object.create(found);
                    const r = () => (Math.random() * (cloned.length - 1)) | 0;
                    return [
                        cloned.splice(r(), 1),
                        cloned.splice(r(), 1),
                        cloned.splice(r(), 1)
                    ];
                };
                const phrase = () => {
                    return (found.length === 3) ? ':' : '. Here are 3 of them:';
                };
                const smartJoin = (arr) => {
                    const last = arr.pop();
                    return `"${arr.join('", "')}" and "${last}"`;
                };
                const arr = partial(found);
                this.agent.ask(`
                    I found ${found.length} operators that match your request${phrase(arr)} 
                    ${smartJoin(arr)}. 
                    ${this.agent.randomConversationMessage()}
                `, { lastOperator: arr });
        }
    }

    // start everything!!
    listen() {
        this.trainDecisions();
        this.traindHotWords();

        // register intents and start server
        this.agent.welcome(this.welcomeIntent.bind(this));
        this.agent.intent(ActionServer.intent.action.TEXT, this.textIntent.bind(this));
        this.agent.listen();
    }
}

(new RxJSAction()).listen();