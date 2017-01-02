import { ActionServer } from '@manekinekko/google-actions-server';
import { DECISION_TREE } from './decision-tree';

// build dictionary from decision tree
const TreeModel = require('tree-model');
const tree = new TreeModel();
const root = tree.parse(DECISION_TREE);
const dict = {};
root.walk({ strategy: 'pre' }, (node) => {
    const l = node.model.label;
    if (!node.hasChildren()) {
        const path = node.getPath().splice(1);
        const leaf = path.pop();
        const str = path.map(n => n.model.label).join(' ');
        dict[str] = l;
    }
});
const keys = Object.keys(dict);

// index keys and values for full text search
var elasticlunr = require('elasticlunr');
var index = elasticlunr(function() {
    this.setRef('operator');
    this.addField('scenario');
    this.addField('operator');
    this.saveDocument(false);
});
keys.forEach(k => {
    index.addDoc({
        "scenario": k,
        "operator": dict[k]
    });
});

// create a google action server
const agent = new ActionServer();
let c = 0;

function lookup(rawInput, cb) {
    let found = [];
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
    found = found
        .sort((d1, d2) => d1.score >= d2.score)
        .map(d => d.ref);

    cb(found);
    return found;
}

function welcomeIntent(assistant) {
    const greeting = () => {
        const g = [
            `Hi, this is Ben from the RxJS team, how can I help?`,
            `Hello, my name is Ben. I will help you choose your RxJS operator. Tell me what you need?`,
            `Hi, I'm Ben, I'm here to help you find an RxJS operator. What do you need?`
        ];
        return g[(Math.random() * g.length - 1) | 0];
    };

    const inputPrompt = assistant.buildInputPrompt(true, greeting());
    const state = assistant.getDialogState();
    assistant.ask(inputPrompt, state);
}

function textIntent(assistant) {

    const website = `For more details, go to reactivex.io/rxjs .`;
    let rawInput = assistant.getRawInput();
    let state = assistant.getDialogState();

    if (rawInput === 'no thanks' || rawInput === 'bye') {
        assistant.tell(`Sure. ${website}. See you there.`);
        return;
    } else if (rawInput.toLowerCase() === 'i need an observable') {
        rawInput = 'i want an observable';
    } else if (rawInput === 'make me an observable') {
        let inputPrompt = assistant.buildInputPrompt(true, `
            <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">
                Congratulations! You are now an observable
            </audio>
        `);
        assistant.ask(inputPrompt);
        return;
    }

    lookup(rawInput, cb);

    function cb(found) {

        const tryAgain = () => {
            const g = [
                `Do you want to give it another shot?`,
                `Do you have another request?`,
                `Do you want to give it another try?`
            ];
            return g[c++ % (g.length - 1)];
        };

        if (found.length === 0) {
            assistant.ask(`
                    I heard you say: "${rawInput}". Could you be more specific?
                `);
        } else if (found.length === 1) {
            assistant.ask(`
                    Alright, you should try out the "${found.pop()}" operator.
                    ${tryAgain()}
                `);
        } else if (found.length === 2) {
            assistant.ask(`
                    I found two operators for you. The "${found.pop()}" operator and "${found.pop()}" operator.
                    Try to describe more your use use. ${tryAgain()}
                `);
        } else if (found.length >= 3) {
            const partial = () => {
                const r = () => (Math.random() * (found.length - 1)) | 0;
                return [
                    found.splice(r(), 1),
                    found.splice(r(), 1),
                    found.splice(r(), 1)
                ];
            };
            assistant.ask(`
                    I found too many operators that match your request.
                    Here are some of them: "${partial().join('". Or. "')}.
                    ${tryAgain()}
                `);
        }
    }


}

// register intents and start server
agent.welcome(welcomeIntent);
agent.intent(ActionServer.intent.action.TEXT, textIntent);
agent.listen();