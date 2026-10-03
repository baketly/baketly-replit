// Turns the mockup's canned Ask Baketly chat into a real one.
//
// The generated page shipped three hardcoded question/answer pairs, plus a text
// input and a send button with no bindings at all. This replaces the canned
// logic with calls to /api/ask and gives the dead controls something to do.

const chatControllerLogic = `      ...(() => {
        // The conversation starts over each time the app opens. What was said
        // last week was answered last week; a baker opening the chat wants to
        // ask something, not scroll past it. The saved messages are cleared
        // on the first draw of a session, and the greeting stands in.
        let stored = Array.isArray(this.state.chatMsgs) ? this.state.chatMsgs : [];
        if (!this.__baketlyChatFresh) {
          this.__baketlyChatFresh = true;
          if (stored.length || (Array.isArray(this.state.chatActions) && this.state.chatActions.length)) {
            window.setTimeout(() => this.setState({
              chatMsgs: [], chatActions: [], chatFollowUps: [], chatLastTools: [],
              chatFailed: '', chatError: '', chatPending: false
            }), 0);
          }
          stored = [];
        }
        const savedSales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords.length : 0;
        const savedRecipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords.length : 0;
        const savedIngredients = Object.keys(this.state.ingredientRecords || {}).length;
        // a baker who has not entered anything yet needs to learn the app, not
        // hear findings about numbers that do not exist
        const justStarting = savedSales === 0 && (savedRecipes === 0 || savedIngredients === 0);
        const greeting = justStarting
          ? { who: 'b', text: 'Hi! I turn what you pay for ingredients into what each bake really costs, and what to charge for it. Tell me what you bake, or ask me what I can do.' }
          : { who: 'b', text: 'Hi! I watch your costs, prices and markets. Ask me anything about them.' };
        const shown = stored.length ? stored : [greeting];
        const pending = this.state.chatPending === true;

        const send = (question) => {
          const text = String(question || '').trim().slice(0, 500);
          if (!text || this.state.chatPending) return;
          const history = (Array.isArray(this.state.chatMsgs) ? this.state.chatMsgs : []).slice(-8);
          const request = (this.state.chatRequest || 0) + 1;
          this.setState(st => ({
            chatMsgs: [...(Array.isArray(st.chatMsgs) ? st.chatMsgs : []), { who: 'u', text }],
            chatDraft: '',
            chatPending: true,
            chatError: '',
            chatRequest: request
          }));
          // The bakery no longer travels with the question: the server reads
          // this baker's own records and works the answer out there.
          // the subject of the last answer travels with the next question
          const lastTools = Array.isArray(this.state.chatLastTools) ? this.state.chatLastTools : [];
          // and so do the cards still waiting on screen, with whatever has
          // been picked on them, so "call this market…" changes that market
          const waiting = (Array.isArray(this.state.chatActions) ? this.state.chatActions : [])
            .filter(a => a && a.status === 'pending')
            .map(a => ({ id: a.id, summary: a.summary, action: a.action, choices: Array.isArray(a.choices) ? a.choices : [] }));
          window.__baketlyAsk(text, history, lastTools, waiting).then(result => {
            this.setState(st => {
              if (st.chatRequest !== request) return null;
              const extra = [];
              if (result.answer) {
                extra.push({
                  who: 'b',
                  text: result.answer,
                  // what the answer was drawn from, shown quietly beneath it
                  sources: (result.sources || []).map(source => source.detail).slice(0, 3)
                });
              }
              (result.wins || []).forEach(win => extra.push({ who: 'b', text: 'Worth knowing: ' + win }));
              return {
                chatMsgs: [...(Array.isArray(st.chatMsgs) ? st.chatMsgs : []), ...extra],
                chatFollowUps: Array.isArray(result.followUps) ? result.followUps : [],
                chatLastTools: Array.isArray(result.lastTools) ? result.lastTools : [],
                // changes the server prepared, shown as cards until the baker
                // confirms or waves each one away. A card that comes back with
                // the id of one still waiting is that card, changed -- "call
                // this market base market" -- and takes its place; the others
                // stay until they are dealt with, so a question in between
                // does not lose a market half set up.
                chatActions: (() => {
                  const fresh = (Array.isArray(result.actions) ? result.actions : []).map(entry => ({ ...entry, status: 'pending' }));
                  const kept = (Array.isArray(st.chatActions) ? st.chatActions : [])
                    .filter(a => a && a.status === 'pending' && !fresh.some(f => f.id === a.id));
                  return [...kept, ...fresh].slice(-3);
                })(),
                chatPending: false,
                chatError: '',
                chatFailed: ''
              };
            });
          }).catch(error => {
            this.setState(st => st.chatRequest === request
              // the question is kept, so it can be asked again with one tap
              ? {
                chatPending: false,
                chatError: (error && error.message) ? error.message : 'I could not answer that right now.',
                chatFailed: text
              }
              : null);
          });
        };

        // Asking again after a failure, with nothing retyped.
        const retry = () => {
          const failed = String(this.state.chatFailed || '');
          if (!failed || this.state.chatPending) return;
          this.setState(st => {
            const msgs = Array.isArray(st.chatMsgs) ? st.chatMsgs : [];
            const last = msgs[msgs.length - 1];
            // drop the question that failed, so it is not asked twice over
            return {
              chatMsgs: last && last.who === 'u' && last.text === failed ? msgs.slice(0, -1) : msgs,
              chatFailed: '',
              chatError: ''
            };
          }, () => send(failed));
        };

        // The server picks these from what the baker actually has — two
        // markets on record earns a comparison, a product below the local
        // median earns a pricing question — so they are worth asking. Fetched
        // once, quietly; the canned prompts below stand in until they arrive.
        if (!this.__baketlySuggestionsAsked) {
          this.__baketlySuggestionsAsked = true;
          window.__baketlyApiFetch('/api/ask/suggestions')
            .then(response => (response.ok ? response.json() : null))
            .then(payload => {
              const list = payload && Array.isArray(payload.suggestions) ? payload.suggestions : [];
              if (list.length) this.setState({ chatSuggestions: list.slice(0, 4) });
            })
            .catch(() => {});
        }

        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const gettingStartedPrompts = ['What can Baketly do for me?', 'What should I add first?', 'How should I price what I bake?'];
        const workingPrompts = ['Which product earns the least?', 'Where am I losing margin?', 'How do I hit ' + CUR + '1,500 at the next market?'];
        const fromServer = Array.isArray(this.state.chatSuggestions) ? this.state.chatSuggestions : [];
        const defaultPrompts = fromServer.length
          ? fromServer
          : (justStarting ? gettingStartedPrompts : workingPrompts);
        const followUps = Array.isArray(this.state.chatFollowUps) && this.state.chatFollowUps.length
          ? this.state.chatFollowUps
          : defaultPrompts;

        this.__baketlyAskFromCard = (question) => { this.go('chat'); send(question); };

        // Talking is faster than typing with floury hands, and thinking out
        // loud is how a plan for a market actually gets made.
        //
        // The listening is the browser's, not ours, and it is not local: Chrome
        // streams the audio to Google and Safari to Apple to transcribe it. The
        // words land in the box and go nowhere else until the message is sent,
        // but the speech itself has already left the phone. That belongs in a
        // privacy policy before this ships.
        //
        // It also only exists in a browser. A WKWebView has no Web Speech API
        // at all, so wrapping this app for iOS — Capacitor, Cordova, a Home
        // Screen PWA — leaves the button dead unless a native recogniser is
        // plugged in behind it.
        // Inside the app the browser has no recogniser, so the native one is
        // used instead; both answer the same three verbs.
        const native = window.__baketlyNativeSpeech ? window.__baketlyNativeSpeech() : null;
        const Listener = window.SpeechRecognition || window.webkitSpeechRecognition;
        const stopListening = () => {
          if (!this.__baketlyVoice) return;
          try { this.__baketlyVoice.stop(); } catch (error) {}
          this.__baketlyVoice = null;
        };
        // One press on the mic starts the listening; pressing Send ends it
        // and sends what was heard. The recogniser's last words can land a
        // beat after it is told to stop, so the send waits that beat and
        // reads the box then, not now.
        const sendNow = () => {
          if (!this.__baketlyVoice) { send(this.state.chatDraft); return; }
          stopListening();
          this.setState({ chatListening: false });
          window.setTimeout(() => send(this.state.chatDraft), 350);
        };
        const toggleVoice = () => {
          if (this.__baketlyVoice) { stopListening(); this.setState({ chatListening: false }); return; }
          if (native) {
            const already = String(this.state.chatDraft || '').trim();
            this.__baketlyVoice = { stop: () => native.stop() };
            this.setState({ chatListening: true, chatError: '' });
            native.start(
              heard => this.setState({ chatDraft: ((already ? already + ' ' : '') + String(heard || '').trim()).slice(0, 500) }),
              message => { this.__baketlyVoice = null; this.setState({ chatListening: false, chatError: message }); }
            ).then(() => { this.__baketlyVoice = null; this.setState({ chatListening: false }); });
            return;
          }
          if (!Listener) {
            this.setState({ chatError: 'This browser cannot listen. Type your question instead.' });
            return;
          }
          const listener = new Listener();
          listener.lang = 'en-US';
          listener.interimResults = true;
          listener.continuous = false;
          // whatever was already typed stays; speech is added to it
          const already = String(this.state.chatDraft || '').trim();
          listener.onresult = event => {
            let heard = '';
            for (let i = 0; i < event.results.length; i++) heard += event.results[i][0].transcript;
            const joined = (already ? already + ' ' : '') + heard.trim();
            this.setState({ chatDraft: joined.slice(0, 500) });
          };
          listener.onerror = event => {
            this.__baketlyVoice = null;
            this.setState({
              chatListening: false,
              chatError: event && event.error === 'not-allowed'
                ? 'Baketly needs permission to use the microphone.'
                : 'I did not catch that. Try again, or type it.'
            });
          };
          listener.onend = () => { this.__baketlyVoice = null; this.setState({ chatListening: false }); };
          this.__baketlyVoice = listener;
          this.setState({ chatListening: true, chatError: '' });
          try { listener.start(); } catch (error) { this.__baketlyVoice = null; this.setState({ chatListening: false }); }
        };

        // ---- changes the chat prepared, applied here and only here --------
        //
        // The server never touches a record. It checks what was asked against
        // the bakery and hands back one exact change; the baker reads it on a
        // card and taps the button, and this takes them to the thing itself
        // so they can see it is right: a to-do lands on its day and the home
        // screen opens on that day; a market opens as the filled-in event
        // form, exactly as the event screen would have it, with Save still to
        // press; a product price is applied and the recipe opened on it; a
        // package price opens the ingredient form with the new price in it,
        // and Save records the old one in the history the way the pantry
        // form does. Nothing happens on "Not now" except the card going away.
        const describeDone = (action) => {
          const cur = (({ USD: '$', EUR: '€', GBP: '£', ILS: '₪' })[this.state.currency] || '');
          const m = v => cur ? cur + v : v + ' ' + (this.state.currency || '');
          if (action.type === 'addTodo') return 'Added to the list for ' + action.day + ': ' + action.text;
          if (action.type === 'createEvent') return 'Here is ' + action.name + ' for ' + action.day + (action.items && action.items.length ? ', with ' + action.items.map(i => i.quantity + ' × ' + i.name).join(', ') : '') + '. Look it over and press Save.';
          if (action.type === 'updateEvent') return 'Here is ' + (action.name || action.eventName) + ' with the change in it. Look it over and press Save changes.';
          if (action.type === 'setProductPrice') return 'Done: ' + action.name + ' is now ' + m(action.to) + '.';
          if (action.type === 'setIngredientPrice') return 'Here is ' + action.name + ' at ' + m(action.to) + ' a package. Press Save ingredient to keep it; every recipe that uses it moves with it.';
          return 'Done.';
        };
        // a YYYY-MM-DD read as a local day, and how many days from today it is
        const localDay = iso => { const p = String(iso || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})/); return p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])) : null; };
        const daysFromToday = iso => {
          const day = localDay(iso);
          if (!day) return 0;
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return Math.round((day.getTime() - today.getTime()) / 86400000);
        };
        const applyAction = (action, st) => {
          if (action.type === 'addTodo') {
            return {
              todoItems: [...(Array.isArray(st.todoItems) ? st.todoItems : []), { text: String(action.text || '').slice(0, 120), done: false, day: action.day }],
              // and show it: the home screen, opened on that day (the row
              // holds last week and two weeks ahead; further out, today)
              homeDayIndex: Math.min(14, Math.max(-7, daysFromToday(action.day))),
              screen: 'dash',
              stack: [],
              sheet: false
            };
          }
          if (action.type === 'createEvent') {
            const recipes = Array.isArray(st.recipeRecords) ? st.recipeRecords : [];
            const picked = [];
            const quantities = {};
            (action.items || []).forEach(item => {
              const recipe = recipes.find(r => r.id === item.productId);
              const quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
              if (!recipe || quantity <= 0 || picked.indexOf(recipe.id) !== -1) return;
              picked.push(recipe.id);
              quantities[recipe.id] = quantity;
            });
            // the same state startNewEvent sets, filled in; unsaved, so the
            // form opens for editing and Save is the baker's to press
            return {
              eventOtherCosts: [],
              eventCurrentId: 'event-' + Date.now().toString(36),
              eventName: String(action.name || 'Market').slice(0, 160),
              eventDate: String(action.day || '').slice(0, 10),
              eventBoothFee: Math.max(0, Number(action.boothFee) || 0),
              evQty: quantities,
              evSold: {},
              evStatus: 'planned',
              evSaved: false,
              actualRev: 0,
              soldRev: 0,
              cashQty: {},
              cashPaid: '',
              cashOrdersArr: [],
              evPicked: picked,
              evPickerOpen: false,
              evPickerSel: [],
              evEnteringResults: false,
              eventDeleteOpen: false,
              shopNeed: {},
              shopNeedText: {},
              editingKey: '',
              screen: 'event',
              stack: [...st.stack, st.screen]
            };
          }
          if (action.type === 'updateEvent') {
            // the saved market, opened for editing with the change already in
            // it, the way the Markets list opens one and the pencil unlocks it;
            // Save changes is the baker's to press
            const events = Array.isArray(st.eventRecords) ? st.eventRecords : [];
            const event = events.find(e => e && e.id === action.eventId);
            if (!event) return {};
            const picked = [];
            const quantities = {};
            (event.plannedItems || []).forEach(item => {
              if (!item || !item.productId || picked.indexOf(item.productId) !== -1) return;
              picked.push(item.productId);
              quantities[item.productId] = Math.max(0, Math.round(Number(item.quantity) || 0));
            });
            // a line already there takes the new quantity; a new one joins
            (action.items || []).forEach(item => {
              const quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
              if (!item.productId || quantity <= 0) return;
              if (picked.indexOf(item.productId) === -1) picked.push(item.productId);
              quantities[item.productId] = quantity;
            });
            return {
              screen: 'event',
              stack: [...st.stack, st.screen],
              eventCurrentId: event.id,
              eventName: String(action.name || event.name || 'Market').slice(0, 160),
              eventDate: action.day || String(event.occurredAt || '').slice(0, 10),
              eventBoothFee: action.boothFee !== undefined && action.boothFee !== null
                ? Math.max(0, Number(action.boothFee) || 0)
                : (Number(event.boothFee) || 0),
              eventOtherCosts: (event.otherCosts || []).map(cost => ({ label: cost.label, amount: String(cost.amount) })),
              evPicked: picked,
              evQty: quantities,
              evSold: {},
              evStatus: event.status === 'completed' ? 'completed' : 'planned',
              evSaved: true,
              evEnteringResults: false,
              evResultsOnly: false,
              evPickerOpen: false,
              evPickerSel: [],
              eventDeleteOpen: false,
              editingKey: 'ev:' + event.id
            };
          }
          if (action.type === 'setProductPrice') {
            return {
              recipeRecords: (Array.isArray(st.recipeRecords) ? st.recipeRecords : []).map(r => r.id === action.productId ? { ...r, price: Number(action.to) } : r),
              // opened on the recipe, the way the Recipes list opens one
              screen: 'recipeEditor',
              editingKey: '',
              stack: [...st.stack, st.screen],
              activeRecipeId: action.productId,
              recipeDraft: null,
              recipeDeleteOpen: false,
              ingPickerOpen: false,
              packPickerOpen: false
            };
          }
          if (action.type === 'setIngredientPrice') {
            const records = st.ingredientRecords || {};
            if (!records[action.key]) return {};
            // the record is left as it was; the new price sits in the draft,
            // and saving the form moves the old one into the history
            return {
              screen: 'ingredientEdit',
              editingKey: 'ing:' + action.key,
              stack: [...st.stack, st.screen],
              activeIngredientKey: action.key,
              ingredientDraft: {
                packagePrice: Math.max(0, Number(action.to) || 0),
                ...(Number(action.packageSize) > 0 ? { packageSize: Number(action.packageSize) } : {})
              },
              ingredientSaveError: '',
              ingredientDeleteOpen: false,
              fromScan: false
            };
          }
          return {};
        };
        const settleAction = (id, status) => this.setState(st => {
          const list = Array.isArray(st.chatActions) ? st.chatActions : [];
          const entry = list.find(a => a.id === id);
          if (!entry || entry.status !== 'pending') return null;
          const changes = status === 'done' ? applyAction(entry.action, st) : {};
          const line = status === 'done' ? describeDone(entry.action) : 'Left as it was.';
          return {
            ...changes,
            chatActions: list.map(a => a.id === id ? { ...a, status } : a),
            chatMsgs: [...(Array.isArray(st.chatMsgs) ? st.chatMsgs : []), { who: 'b', text: line }]
          };
        });
        const actionLabel = action => action && action.type === 'addTodo' ? 'Add' : 'Open';

        // ---- which recipe did they mean? ---------------------------------
        //
        // "Six loaves and fifteen cookies" names kinds, not recipes. The
        // server keeps the line and its quantity, and sends the recipes worth
        // offering for it; the card asks, one question at a time, and a tap
        // fills the line in. Nothing is applied until every question is
        // answered and the baker presses the button, as before.
        const answerChoice = (id, slot, option) => this.setState(st => {
          const list = Array.isArray(st.chatActions) ? st.chatActions : [];
          const entry = list.find(a => a.id === id);
          if (!entry || entry.status !== 'pending') return null;
          const action = { ...entry.action };
          const index = String(slot || '').startsWith('item:') ? Number(String(slot).slice(5)) : -1;
          if (index >= 0) {
            const items = (Array.isArray(action.items) ? action.items : []).slice();
            if (!items[index]) return null;
            // their quantity, the recipe they picked
            items[index] = option
              ? { ...items[index], productId: option.id, name: option.name }
              : null;
            action.items = items.filter(Boolean);
          } else if (option) {
            if (action.type === 'setProductPrice') { action.productId = option.id; action.name = option.name; }
            if (action.type === 'setIngredientPrice') { action.key = option.id; action.name = option.name; }
            if (action.type === 'updateEvent') { action.eventId = option.id; action.eventName = option.name; }
          } else {
            // nothing fits: the whole card goes, rather than a change to a
            // recipe nobody picked
            return { chatActions: list.map(a => a.id === id ? { ...a, status: 'dismissed' } : a) };
          }
          const left = (Array.isArray(entry.choices) ? entry.choices : []).filter(c => c.slot !== slot);
          // dropping an item shifts the ones after it, and so their slots
          const choices = index >= 0 && !option
            ? left.map(c => {
                const at = String(c.slot || '').startsWith('item:') ? Number(String(c.slot).slice(5)) : -1;
                return at > index ? { ...c, slot: 'item:' + (at - 1) } : c;
              })
            : left;
          return { chatActions: list.map(a => a.id === id ? { ...a, action, choices } : a) };
        });

        const pendingActions = (Array.isArray(this.state.chatActions) ? this.state.chatActions : []).filter(a => a && a.status === 'pending');
        const stillAsking = pendingActions.find(a => Array.isArray(a.choices) && a.choices.length);
        const question = stillAsking ? stillAsking.choices[0] : null;
        const readyActions = pendingActions.filter(a => !(Array.isArray(a.choices) && a.choices.length));

        // a market's lineup is listed on its own card, so a line still being
        // asked about is not folded into a sentence
        const lineup = action => (action && (action.type === 'createEvent' || action.type === 'updateEvent') && Array.isArray(action.items) && action.items.length)
          ? (action.type === 'updateEvent' ? ', with ' : ', baking ') + action.items.map(i => i.quantity + ' × ' + i.name).join(', ')
          : '';
        // The card's words. A change to a saved market names the market, and
        // the market may only be known once the baker has picked it, so that
        // one is written here from the action rather than taken as sent.
        const cardSummary = a => a.action && a.action.type === 'updateEvent'
          ? 'Change ' + (a.action.eventName || 'that market') + (a.action.what ? ': ' + a.action.what : '') + lineup(a.action)
          : a.summary + lineup(a.action);

        return {
          chatMsgs: shown.map((m, i) => ({
            // a stable name for the bubble, so a new one can be told from a
            // redrawn one and animated once
            key: 'm' + i + '-' + m.who + '-' + String(m.text || '').length,
            text: m.text,
            align: m.who === 'u' ? 'flex-end' : 'flex-start',
            border: m.who === 'u' ? 'var(--color-accent-300)' : 'var(--color-divider)',
            bg: m.who === 'u' ? 'var(--color-accent-100)' : '#fff',
            radius: m.who === 'u' ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
            // "Based on 2 markets · sales, August 2026"
            sourceLine: Array.isArray(m.sources) && m.sources.length
              ? 'Based on ' + m.sources.join(' · ')
              : '',
            hasSources: Array.isArray(m.sources) && m.sources.length > 0
          })),
          // cards for the changes waiting on the baker
          chatActions: readyActions.map(a => ({
            key: 'a-' + a.id,
            summary: cardSummary(a),
            label: actionLabel(a.action),
            confirm: () => settleAction(a.id, 'done'),
            dismiss: () => settleAction(a.id, 'dismissed')
          })),
          chatHasActions: readyActions.length > 0,
          // and the question standing between a card and its button
          chatAsking: !!question,
          chatQuestion: question ? question.question : '',
          // a name of its own, so the question arrives with the same movement
          // as a message and a new question is told from a redrawn one
          chatAskKey: question && stillAsking ? 'q-' + stillAsking.id + '-' + question.slot : 'q',
          chatAskingFor: question && stillAsking ? cardSummary(stillAsking) : '',
          chatOptions: question
            ? (question.options || []).slice(0, 6).map(option => ({
              key: 'o-' + stillAsking.id + '-' + question.slot + '-' + option.id,
              name: option.name,
              detail: option.detail || '',
              hasDetail: !!option.detail,
              pick: () => answerChoice(stillAsking.id, question.slot, option)
            }))
            : [],
          skipChoice: () => { if (question) answerChoice(stillAsking.id, question.slot, null); },
          skipChoiceLabel: question && String(question.slot || '').startsWith('item:')
            ? 'Leave it out'
            : 'None of these',
          retryAsk: retry,
          canRetry: !!this.state.chatFailed && !pending,
          chatDraft: this.state.chatDraft || '',
          setChatDraft: e => this.setState({ chatDraft: e.target.value.slice(0, 500) }),
          sendChat: sendNow,
          toggleVoice,
          chatListening: this.state.chatListening === true,
          voiceLabel: this.state.chatListening === true ? 'Stop listening' : 'Speak your question',
          voiceBg: this.state.chatListening === true ? 'var(--color-accent)' : '#fff',
          voiceColor: this.state.chatListening === true ? '#fff' : 'var(--color-text)',
          chatPending: pending,
          chatIdle: !pending,
          chatError: this.state.chatError || '',
          askQ1: () => send(defaultPrompts[0]),
          askQ2: () => send(defaultPrompts[1]),
          askQ3: () => send(defaultPrompts[2]),
          askLabel1: '"' + defaultPrompts[0] + '"',
          askLabel3: '"' + defaultPrompts[2] + '"',
          askGo1: () => { this.go('chat'); send(defaultPrompts[0]); },
          askGo3: () => { this.go('chat'); send(defaultPrompts[2]); },
        };
      })(),
`;

function replaceChatController(template: string): string {
  const start = template.indexOf("    const CANNED = {");
  if (start === -1) throw new Error("Missing canned chat anchor");
  const endMarker = "\n    const msgs = (chatMsgs.length";
  const endOfMsgs = template.indexOf(endMarker, start);
  if (endOfMsgs === -1) throw new Error("Missing canned chat message anchor");
  // the msgs expression ends at the first line that closes its .map(...)
  const mapClose = template.indexOf("\n", template.indexOf("}));", endOfMsgs));
  if (mapClose === -1) throw new Error("Unclosed canned chat message expression");
  return template.slice(0, start) + template.slice(mapClose + 1);
}

function replaceChatBindings(template: string): string {
  const anchor =
    "      chatMsgs: msgs, askQ1: ask('q1'), askQ2: ask('q2'), askQ3: ask('q3'),\n";
  if (!template.includes(anchor)) {
    throw new Error("Missing stable chat bindings anchor");
  }
  const goAnchorStart = template.indexOf(anchor);
  const afterGo = template.indexOf("\n", template.indexOf("askGo3:", goAnchorStart));
  if (afterGo === -1) throw new Error("Missing chat navigation anchor");
  return template.slice(0, goAnchorStart) + chatControllerLogic + template.slice(afterGo + 1);
}

// The three prepared questions are gone. They filled the screen under every
// answer with things the baker had not asked, and a chat that suggests what to
// say is a chat that does not trust you to say it.
const suggestionsMarkup = `  <sc-if value="{{ chatListening }}" hint-placeholder-val="{{ false }}">
    <div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;font-size:12px;color:var(--color-accent-700)">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--color-accent);flex:none"></span>
      <span>Listening — say what you need, then tap Send.</span>
    </div>
  </sc-if>
  <sc-if value="{{ chatPending }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:12px;margin-bottom:8px">Baketly is reading your numbers…</div>
  </sc-if>
  <sc-if value="{{ chatError }}" hint-placeholder-val="">
    <div style="color:#b0563e;font-size:12px;margin-bottom:8px">{{ chatError }}</div>
  </sc-if>
  <sc-if value="{{ canRetry }}" hint-placeholder-val="{{ false }}">
    <button class="btn btn-secondary" sc-camel-on-click="{{ retryAsk }}" style="min-height:38px;font-size:12px;margin-bottom:10px">Ask that again</button>
  </sc-if>
`;

function replaceChatSuggestions(template: string): string {
  const start = template.indexOf(
    '  <div style="display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 12px">\n    <button class="btn btn-secondary" sc-camel-on-click="{{ askQ1 }}"',
  );
  if (start === -1) throw new Error("Missing chat suggestions anchor");
  const end = template.indexOf("  </div>\n", template.indexOf('askQ3 }}', start));
  if (end === -1) throw new Error("Unclosed chat suggestions block");
  return template.slice(0, start) + suggestionsMarkup + template.slice(end + "  </div>\n".length);
}

function roundChatBubbles(template: string): string {
  const bubble =
    '<div style="align-self:{{ msg.align }};max-width:85%;border:1px solid {{ msg.border }};border-radius:var(--radius-lg);padding:10px 14px;font-size:14px;line-height:1.55;background:{{ msg.bg }}">{{ msg.text }}</div>';
  if (!template.includes(bubble)) throw new Error("Missing chat bubble anchor");
  // An answer says quietly what it was drawn from — two markets, sales in
  // August, eleven nearby bakeries — so a baker can tell a figure from their
  // own records apart from advice about it.
  return template.replace(
    bubble,
    () =>
      '<div data-bk-bubble="{{ msg.key }}" style="align-self:{{ msg.align }};max-width:85%;display:flex;flex-direction:column;gap:4px">' +
      '<div style="border:1px solid {{ msg.border }};border-radius:{{ msg.radius }};padding:11px 16px;font-size:14px;line-height:1.55;background:{{ msg.bg }}">{{ msg.text }}</div>' +
      '<sc-if value="{{ msg.hasSources }}" hint-placeholder-val="{{ false }}">' +
      '<div class="text-muted" style="font-size:10.5px;padding:0 4px">{{ msg.sourceLine }}</div></sc-if>' +
      "</div>",
  );
}

function bindChatComposer(template: string): string {
  // The row holding the box, too: the suggestion buttons that used to sit
  // between the last bubble and the box are gone, so the box gets its own
  // room above it instead of touching the conversation.
  const input =
    '<div style="display:flex;gap:8px">\n    <input class="input" placeholder="Ask about your bakery…" style="flex:1">';
  if (!template.includes(input)) throw new Error("Missing chat input anchor");
  // A box one line tall hides a spoken question as it is being spoken: the
  // words scroll out of sight to the left and the baker cannot read back what
  // the phone heard before sending it. A textarea grows instead, up to about
  // five lines, and chat-grow.ts keeps its height to its content. The buttons
  // sit at the bottom of the row so they stay beside the last line.
  const boundInput =
    '<div style="display:flex;gap:8px;margin-top:28px;align-items:flex-end">\n    ' +
    '<textarea class="input" data-bk-chatbox="1" value="{{ chatDraft }}" sc-camel-on-change="{{ setChatDraft }}" ' +
    'placeholder="Ask about your bakery…" aria-label="Ask about your bakery" rows="1" maxlength="500" ' +
    // closed here: an input is a void element and a textarea is not, and
    // leaving it open swallowed the buttons, the row and the whole screen
    'style="flex:1;resize:none;overflow-y:auto;max-height:124px;line-height:1.45;padding-top:11px;padding-bottom:11px;font-family:inherit"></textarea>';
  let out = template.replace(input, () => boundInput);

  const sendButton =
    '<button class="btn btn-primary btn-icon" aria-label="Send" style="width:44px;height:44px">';
  if (!out.includes(sendButton)) throw new Error("Missing chat send button anchor");
  const microphone =
    '<button class="btn btn-secondary btn-icon" sc-camel-on-click="{{ toggleVoice }}" aria-label="{{ voiceLabel }}" ' +
    'style="width:44px;height:44px;flex:none;background:{{ voiceBg }};color:{{ voiceColor }}">' +
    '<svg width="19" height="19" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="2" width="6" height="12" rx="3"></rect>' +
    '<path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v4"></path></svg></button>';
  // Back on the screen. It was held out while the phone had no recogniser
  // behind it; the native one is installed again, and the Info.plist strings
  // with it, so the button does what it says.
  return out.replace(
    sendButton,
    () =>
      microphone +
      '<button class="btn btn-primary btn-icon" sc-camel-on-click="{{ sendChat }}" aria-label="Send" style="width:44px;height:44px">',
  );
}

/**
 * The cards for changes the chat has prepared, under the last message.
 *
 * A proposal is a bubble of its own with two buttons. Confirm applies it
 * through the controller above and answers with what was done; Not now takes
 * the card away and changes nothing. The card carries a bubble key like any
 * message, so it arrives with the same movement.
 */
function addActionCards(template: string): string {
  const anchor = "{{ msg.sourceLine }}</div></sc-if></div>\n    </sc-for>\n  </div>";
  if (!template.includes(anchor)) throw new Error("Missing chat action card anchor");
  const cards =
    "{{ msg.sourceLine }}</div></sc-if></div>\n    </sc-for>\n" +
    '    <sc-for list="{{ chatActions }}" as="act" hint-placeholder-count="0">\n' +
    '      <div data-bk-bubble="{{ act.key }}" style="align-self:flex-start;max-width:85%;border:1px solid var(--color-accent-300);border-radius:20px 20px 20px 6px;padding:12px 16px;background:var(--color-accent-100);display:flex;flex-direction:column;gap:10px">\n' +
    '        <div style="font-size:14px;line-height:1.5">{{ act.summary }}</div>\n' +
    '        <div style="display:flex;gap:8px">\n' +
    '          <button class="btn btn-primary" sc-camel-on-click="{{ act.confirm }}" style="min-height:40px;font-size:13px;padding:0 18px">{{ act.label }}</button>\n' +
    '          <button class="btn btn-secondary" sc-camel-on-click="{{ act.dismiss }}" style="min-height:40px;font-size:13px;padding:0 14px">Not now</button>\n' +
    "        </div>\n" +
    "      </div>\n" +
    "    </sc-for>\n" +
    // The question a card is waiting on, with their own recipes to tap. Only
    // ever one at a time, so it stands on its own rather than inside the card
    // loop -- the design nests no list inside another anywhere, and this is
    // not the screen to find out whether the engine would.
    '    <sc-if value="{{ chatAsking }}" hint-placeholder-val="{{ false }}">\n' +
    '      <div data-bk-bubble="{{ chatAskKey }}" style="align-self:flex-start;max-width:85%;border:1px solid var(--color-accent-300);border-radius:20px 20px 20px 6px;padding:12px 16px;background:var(--color-accent-100);display:flex;flex-direction:column;gap:10px">\n' +
    '        <div style="font-size:14px;line-height:1.5">{{ chatAskingFor }}</div>\n' +
    '        <div style="font-size:14px;line-height:1.5;font-weight:500">{{ chatQuestion }}</div>\n' +
    '        <div style="display:flex;flex-wrap:wrap;gap:8px">\n' +
    '          <sc-for list="{{ chatOptions }}" as="opt" hint-placeholder-count="0">\n' +
    '            <button class="btn btn-secondary" sc-camel-on-click="{{ opt.pick }}" style="min-height:40px;font-size:13px;padding:0 14px;background:#fff">{{ opt.name }}</button>\n' +
    "          </sc-for>\n" +
    "        </div>\n" +
    '        <button class="btn btn-ghost" sc-camel-on-click="{{ skipChoice }}" style="align-self:flex-start;min-height:34px;font-size:12px;padding:0 6px;margin-left:-6px">{{ skipChoiceLabel }}</button>\n' +
    "      </div>\n" +
    "    </sc-if>\n  </div>";
  return template.replace(anchor, () => cards);
}

export function applyChatBehavior(template: string): string {
  return addActionCards(
    roundChatBubbles(
      bindChatComposer(
        replaceChatSuggestions(replaceChatBindings(replaceChatController(template))),
      ),
    ),
  );
}
