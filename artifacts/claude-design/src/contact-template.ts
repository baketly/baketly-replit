// Writing to the person who makes Baketly.
//
// A baker with an idea — or with something broken in front of them — had
// nowhere to put it. This is a screen with three fields and a send button, and
// an envelope beside the other two on the home screen.
//
// The topics are fixed rather than free text, so a hundred messages can be
// read in an order that means something: everything broken first, suggestions
// when there is time for them.

const TOPICS = [
  { value: "suggestion", label: "A suggestion" },
  { value: "problem", label: "Something is not working" },
  { value: "question", label: "A question" },
  { value: "other", label: "Something else" },
] as const;

/**
 * The screen.
 *
 * The options are written out rather than looped: a <select> may hold only
 * <option>, and WebKit drops anything else — which is how every other picker
 * in this app once came to be empty on the phone.
 */
const contactScreen =
  '<div style="padding:18px 20px 28px">' +
  '<button class="btn btn-ghost" sc-camel-on-click="{{ leaveContact }}" style="min-height:40px;padding:0;margin-bottom:10px">‹ Back</button>' +
  '<h2 style="font-size:26px;line-height:1.2;margin:0 0 6px">Tell us what you need</h2>' +
  '<p class="text-muted" style="font-size:13.5px;line-height:1.5;margin-bottom:20px">' +
  "Baketly is built from what bakers ask for. Say what would help, or what is " +
  "in your way, and it reaches us directly.</p>" +

  '<div class="field" style="margin-bottom:14px"><label>What is this about</label>' +
  '<select class="input" value="{{ contactTopic }}" sc-camel-on-change="{{ setContactTopic }}" aria-label="What this is about" style="width:100%">' +
  TOPICS.map((topic) => `<option value="${topic.value}">${topic.label}</option>`).join("") +
  "</select></div>" +

  '<div class="field" style="margin-bottom:14px"><label>Subject</label>' +
  '<input class="input" value="{{ contactSubject }}" sc-camel-on-change="{{ setContactSubject }}" aria-label="Subject" placeholder="In a few words" maxlength="120"></div>' +

  '<div class="field" style="margin-bottom:6px"><label>Message</label>' +
  // the value rides on the attribute, not between the tags: there is no other
  // textarea anywhere in the design, and a {{ }} left as a text child is not a
  // binding the engine knows — it printed "[object Object]" on screen
  '<textarea class="input" value="{{ contactBody }}" sc-camel-on-change="{{ setContactBody }}" aria-label="Message" rows="7" placeholder="As much or as little as you like" maxlength="4000" style="width:100%;resize:vertical;line-height:1.5;font-family:var(--font-body)"></textarea></div>' +

  '<div class="text-muted" style="font-size:12px;margin-bottom:16px">You can also contact us at contact@baketly.com</div>' +

  '<sc-if value="{{ contactError }}" hint-placeholder-val="">' +
  '<div style="color:#b0563e;font-size:13px;margin-bottom:10px">{{ contactError }}</div></sc-if>' +

  '<sc-if value="{{ contactSent }}" hint-placeholder-val="{{ false }}">' +
  '<div style="color:var(--color-accent);font-size:13px;margin-bottom:10px">Sent. Thank you — we read every one of these.</div></sc-if>' +

  '<sc-if value="{{ contactSending }}" hint-placeholder-val="{{ false }}">' +
  '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px"><span class="bk-spinner" aria-hidden="true"></span><span class="text-muted" style="font-size:12px">Sending…</span></div></sc-if>' +

  '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ sendContact }}" style="min-height:50px">{{ contactCta }}</button>' +
  "</div>";

const controller = `      contactTopic: this.state.contactTopic || 'suggestion',
      setContactTopic: e => this.setState({ contactTopic: e.target.value, contactSent: false }),
      contactSubject: this.state.contactSubject || '',
      setContactSubject: e => this.setState({ contactSubject: e.target.value.slice(0, 120), contactSent: false, contactError: '' }),
      contactBody: this.state.contactBody || '',
      setContactBody: e => this.setState({ contactBody: e.target.value.slice(0, 4000), contactSent: false, contactError: '' }),
      contactError: this.state.contactError || '',
      contactSent: this.state.contactSent === true,
      contactSending: this.state.contactSending === true,
      contactCta: this.state.contactSending === true ? 'Sending…' : 'Send message',
      goContact: () => {
        // a fresh screen, not the tail of the last message: coming back to a
        // "Sent, thank you" from an hour ago reads as though this one sent
        this.setState({ contactSent: false, contactError: '' });
        this.go('contact');
      },
      leaveContact: () => this.setState(st => {
        const stack = [...(st.stack || [])];
        const previous = stack.pop() || 'dash';
        return { screen: previous, stack, contactError: '', contactSending: false };
      }),
      sendContact: async () => {
        if (this.state.contactSending) return;
        const subject = String(this.state.contactSubject || '').trim();
        const body = String(this.state.contactBody || '').trim();
        if (!subject || !body) {
          this.setState({ contactError: 'A subject and a message, and it is on its way.' });
          return;
        }
        this.setState({ contactSending: true, contactError: '', contactSent: false });
        try {
          const response = await window.__baketlyApiFetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: this.state.contactTopic || 'suggestion', subject, body })
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            this.setState({ contactSending: false, contactError: payload.error || 'That did not send. Try again in a moment.' });
            return;
          }
          // the fields are cleared: a sent message is gone, and leaving the
          // words behind makes it look as though it is not
          this.setState({ contactSending: false, contactSent: true, contactSubject: '', contactBody: '' });
        } catch (error) {
          this.setState({ contactSending: false, contactError: 'No connection just now. Try again when you have one.' });
        }
      },
      onContact: screen === 'contact',
`;

function addContactController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable controller anchor for contact");
  return template.replace(
    anchor,
    (_match, indent: string) => `${controller}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** The screen itself, alongside the others the scroll body holds. */
function addContactScreen(template: string): string {
  const anchor = '<div style="flex:1;overflow:auto;min-height:0';
  const at = template.indexOf(anchor);
  if (at === -1) throw new Error("Missing scroll body anchor for contact screen");
  const opens = template.indexOf(">", at) + 1;
  const screen =
    '<sc-if value="{{ onContact }}" hint-placeholder-val="{{ false }}">' +
    contactScreen +
    "</sc-if>";
  return template.slice(0, opens) + screen + template.slice(opens);
}

export function applyContactBehavior(template: string): string {
  return addContactScreen(addContactController(template));
}
