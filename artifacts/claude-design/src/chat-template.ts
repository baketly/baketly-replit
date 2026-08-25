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
          ? { who: 'b', text: 'Hi! I turn what you pay for ingredients into what each bake really costs, and what to charge for it. Tell me what you bake, or try a question below to see what I can do.' }
          : { who: 'b', text: 'Hi! I watch your costs, prices and markets. Ask me anything — or try a question below.' };
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
          let context;
          try {
            context = window.__baketlyAskContext(this.state, this.ING_META || {}, this.PACK_META || {}, this.EV_META || []);
          } catch (error) {
            this.setState({ chatPending: false, chatError: 'I could not read your bakery data just now.' });
            return;
          }
          window.__baketlyAsk(text, context, history).then(result => {
            this.setState(st => {
              if (st.chatRequest !== request) return null;
              const extra = [];
              if (result.answer) extra.push({ who: 'b', text: result.answer });
              (result.wins || []).forEach(win => extra.push({ who: 'b', text: 'Worth knowing: ' + win }));
              return {
                chatMsgs: [...(Array.isArray(st.chatMsgs) ? st.chatMsgs : []), ...extra],
                chatFollowUps: Array.isArray(result.followUps) ? result.followUps : [],
                chatPending: false,
                chatError: ''
              };
            });
          }).catch(error => {
            this.setState(st => st.chatRequest === request
              ? { chatPending: false, chatError: (error && error.message) ? error.message : 'I could not answer that right now.' }
              : null);
          });
        };

        const gettingStartedPrompts = ['What can Baketly do for me?', 'What should I add first?', 'How should I price what I bake?'];
        const workingPrompts = ['Which product earns the least?', 'Where am I losing margin?', 'How do I hit $1,500 at the next market?'];
        const defaultPrompts = justStarting ? gettingStartedPrompts : workingPrompts;
        const followUps = Array.isArray(this.state.chatFollowUps) && this.state.chatFollowUps.length
          ? this.state.chatFollowUps
          : defaultPrompts;

        this.__baketlyAskFromCard = (question) => { this.go('chat'); send(question); };

        return {
          chatMsgs: shown.map(m => ({
            text: m.text,
            align: m.who === 'u' ? 'flex-end' : 'flex-start',
            border: m.who === 'u' ? 'var(--color-accent-300)' : 'var(--color-divider)',
            bg: m.who === 'u' ? 'var(--color-accent-100)' : '#fff',
            radius: m.who === 'u' ? '20px 20px 6px 20px' : '20px 20px 20px 6px'
          })),
          chatDraft: this.state.chatDraft || '',
          setChatDraft: e => this.setState({ chatDraft: e.target.value.slice(0, 500) }),
          sendChat: () => send(this.state.chatDraft),
          chatSuggestions: followUps.slice(0, 3).map(label => ({ label, ask: () => send(label) })),
          chatPending: pending,
          chatIdle: !pending,
          chatError: this.state.chatError || '',
          askQ1: () => send(defaultPrompts[0]),
          askQ2: () => send(defaultPrompts[1]),
          askQ3: () => send(defaultPrompts[2]),
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

const suggestionsMarkup = `  <div style="display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 12px">
    <sc-for list="{{ chatSuggestions }}" as="sug" hint-placeholder-count="3">
      <button class="btn btn-secondary" sc-camel-on-click="{{ sug.ask }}" style="min-height:40px;font-size:12px">{{ sug.label }}</button>
    </sc-for>
  </div>
  <sc-if value="{{ chatPending }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:12px;margin-bottom:8px">Baketly is reading your numbers…</div>
  </sc-if>
  <sc-if value="{{ chatError }}" hint-placeholder-val="">
    <div style="color:#b0563e;font-size:12px;margin-bottom:8px">{{ chatError }}</div>
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
  return template.replace(
    bubble,
    () =>
      '<div style="align-self:{{ msg.align }};max-width:85%;border:1px solid {{ msg.border }};border-radius:{{ msg.radius }};padding:11px 16px;font-size:14px;line-height:1.55;background:{{ msg.bg }}">{{ msg.text }}</div>',
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
  return out.replace(
    sendButton,
    () =>
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
