import { ActionServer } from '@manekinekko/google-actions-server';
import { DECISION_TREE } from './decision-tree';

const TreeModel = require('tree-model');
const tree = new TreeModel();
const root = tree.parse(DECISION_TREE);

let dict = {};
root.walk({ strategy: 'pre' }, (node) => {
    const l = node.model.label;
    if (!node.hasChildren()) {
        const path = node.getPath().splice(1);
        const leaf = path.pop();
        const str = path.map(n => n.model.label).join(' ');
        dict[str] = l;
    }
});
// console.log(dict);
const keys = Object.keys(dict);

var reds = require('reds');
var search = reds.createSearch('rxjs');
keys.forEach(k => {
    search.index(k, dict[k]);
});

function ___lookup(rawInput, cb) {
    let found = [];
    search
        .query(rawInput)
        .type('and')
        .end((err, ids) => {
            if (err) {
                console.error(err);
            }
            cb(ids);
        });
}

const agent = new ActionServer();
let c = 0;

agent.welcome((assistant) => {
    let state = assistant.getDialogState();
    state.lastDecision = dict;

    let greeting = () => {
        const g = [
            `Hi, this is Ben from the RxJS team, how can I help?`,
            `Hello, my name is Ben. I will help you choose your RxJS operator. Tell me what you need?`,
            `Hi, I'm Ben, I'm here to help you find an RxJS operator. What do you need?`
        ];
        return g[(Math.random() * g.length - 1) | 0];
    };

    let inputPrompt = assistant.buildInputPrompt(true, greeting());

    assistant.ask(inputPrompt, state);
});

//ActionServer.intent.action.MAIN
//ActionServer.intent.action.TEXT
//ActionServer.intent.action.PERMISSION
agent.intent(ActionServer.intent.action.TEXT, (assistant, /*state*/ ) => {

    // ask the user and listen for an anwser
    //assistant.ask();

    // reads the user's answer
    //assistant.getRawInput();

    // tell something to the user and stop listening
    //assistant.tell();

    const website = `For more details, go to reactivex.io/rxjs .`;
    let rawInput = assistant.getRawInput();
    let state = assistant.getDialogState();

    if (rawInput === 'no thanks' || rawInput === 'bye') {
        assistant.tell(`Sure. ${website}. See you there.`);
        return;
    } else if (rawInput.toLowerCase() === 'i need an observable') {
        rawInput = 'i need to create an observable';
    } else if (rawInput === 'make me an observable') {
        let inputPrompt = assistant.buildInputPrompt(true, `
            <audio src="https://freesound.org/data/previews/242/242886_4434589-lq.mp3">
                Congratulations! You are now an observable
            </audio>
        `);
        assistant.ask(inputPrompt);
        return;
    }

    let found = ___lookup(rawInput, cb);

    const tryAgain = () => {
        const g = [
            `Do you want to give it another shot?`,
            `Do you have another request?`,
            `Do you want to give it another try?`
        ];
        return g[c++ % (g.length - 1)];
    };

    function cb(found) {
        if (found.length === 0) {
            assistant.ask(`
                    I heard you say: "${rawInput}". Could you be more specific?
                `);
        } else if (found.length === 1) {
            assistant.ask(`
                    Alright, you should try out the ${found} operator.
                    ${tryAgain()}
                `);
        } else if (found.length > 3) {
            const partial = found.splice(0, 3);
            assistant.ask(`
                    I found too many operators that match your request.
                    Here are some of them: ${partial.join('. Or. ')}.
                    ${tryAgain()}
                `);
        }
    }


});
agent.listen();