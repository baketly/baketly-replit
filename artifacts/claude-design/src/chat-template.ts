// Turns the mockup's canned Ask Baketly chat into a real one.
//
// The generated page shipped three hardcoded question/answer pairs, plus a text
// input and a send button with no bindings at all. This replaces the canned
// logic with calls to /api/ask and gives the dead controls something to do.

const chatControllerLogic = `      ...(() => {
        const stored = Array.isArray(this.state.chatMsgs) ? this.state.chatMsgs : [];
        const savedSales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords.length : 0;
        const savedRecipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords.length : 0;
        const savedIngredients = Object.keys(this.state.ingredientRecords || {}).length;
        // a baker who has not entered anything yet needs to learn the app, not
        // hear findings about numbers that do not exist
        const justStarting = savedSales === 0 && (savedRecipes === 0 || savedIngredients === 0);
        const greeting = justStarting
          ? { who: 'b', text: 'Hi! I turn what you pay for ingredients into what each bake really costs, and what to charge for it. Tell me what you bake, or ask me what I can do.' }
          : { who: 'b', text: 'Hi! I watch your costs, prices and markets. Ask me anything — type it or hold the microphone.' };
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
          window.__baketlyAsk(text, history, lastTools).then(result => {
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
          fetch('/api/ask/suggestions')
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
        const Listener = window.SpeechRecognition || window.webkitSpeechRecognition;
        const stopListening = () => {
          if (!this.__baketlyVoice) return;
          try { this.__baketlyVoice.stop(); } catch (error) {}
          this.__baketlyVoice = null;
        };
        const toggleVoice = () => {
          if (this.__baketlyVoice) { stopListening(); this.setState({ chatListening: false }); return; }
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

        return {
          chatMsgs: shown.map(m => ({
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
          retryAsk: retry,
          canRetry: !!this.state.chatFailed && !pending,
          chatDraft: this.state.chatDraft || '',
          setChatDraft: e => this.setState({ chatDraft: e.target.value.slice(0, 500) }),
          sendChat: () => send(this.state.chatDraft),
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
      <span>Listening — say what you need, then tap the microphone again.</span>
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
      '<div style="align-self:{{ msg.align }};max-width:85%;display:flex;flex-direction:column;gap:4px">' +
      '<div style="border:1px solid {{ msg.border }};border-radius:{{ msg.radius }};padding:11px 16px;font-size:14px;line-height:1.55;background:{{ msg.bg }}">{{ msg.text }}</div>' +
      '<sc-if value="{{ msg.hasSources }}" hint-placeholder-val="{{ false }}">' +
      '<div class="text-muted" style="font-size:10.5px;padding:0 4px">{{ msg.sourceLine }}</div></sc-if>' +
      "</div>",
  );
}

function bindChatComposer(template: string): string {
  const input =
    '<input class="input" placeholder="Ask about your bakery…" style="flex:1">';
  if (!template.includes(input)) throw new Error("Missing chat input anchor");
  const boundInput =
    '<input class="input" value="{{ chatDraft }}" sc-camel-on-change="{{ setChatDraft }}" placeholder="Ask about your bakery…" aria-label="Ask about your bakery" style="flex:1">';
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
  return out.replace(
    sendButton,
    () =>
      microphone +
      '<button class="btn btn-primary btn-icon" sc-camel-on-click="{{ sendChat }}" aria-label="Send" style="width:44px;height:44px">',
  );
}

export function applyChatBehavior(template: string): string {
  return roundChatBubbles(
    bindChatComposer(
      replaceChatSuggestions(replaceChatBindings(replaceChatController(template))),
    ),
  );
}
