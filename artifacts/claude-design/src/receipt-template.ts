// Emailing the customer their receipt.
//
// The generated till had a receipt box, and behind it this:
//
//   sendReceipt: () => { if (posContact.trim()) this.setState({ posSent: true }); }
//
// The button said "Sent ✓" and nothing was sent. Nothing was even built to
// send it. A baker would have stood at a stall telling customers their receipt
// was on its way, every day, and none of them ever arrived.
//
// So: a real send, through /api/receipts, and a screen that says only what
// actually happened — "Sending…", then the address it reached, or the reason
// it did not. The field is email only now, because that is the one Baketly can
// deliver; a phone number in that box could never have worked.
//
// No regular expressions in the injected source. It is text inside a template
// literal by the time it reaches the page, and a \s or a \b does not survive
// the trip — the server validates the address properly anyway.

/**
 * What was sold, kept for the receipt.
 *
 * finish() cleared posQty in the same setState that opened the done screen, so
 * by the time the receipt box appeared the basket was already gone and there
 * was nothing to itemise. The lines are read off it first.
 *
 * Read from posRecipes keyed by id, which is what the till actually counts.
 * The generated source had a hardcoded RECIPES list keyed by name, and the
 * analytics patch rewires the whole till off it onto the baker's real recipes
 * — so reading the old list matched nothing, every basket came out empty, and
 * the server quite rightly answered "Nothing to send" about a sale that had
 * just happened.
 */
function captureWhatWasSold(template: string): string {
  const anchor =
    "                posDone: { total: final, method, change: changeAmt },\n" +
    "                posQty: {}, posTendered: 0, posStage: 'idle', posSent: false, posContact: '', posPromo: 'none', posCustom: '',";

  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing sale completion anchor");
  }

  const replacement =
    "                posDone: {\n" +
    "                  total: final,\n" +
    "                  method,\n" +
    "                  change: changeAmt,\n" +
    "                  // read before posQty is cleared on the next line\n" +
    "                  lines: posRecipes\n" +
    "                    .filter(r => ((st.posQty || {})[r.id] || 0) > 0)\n" +
    "                    .map(r => ({\n" +
    "                      name: r.name,\n" +
    "                      quantity: (st.posQty || {})[r.id] || 0,\n" +
    "                      // what they paid, not the list price: a promotion or a\n" +
    "                      // typed bundle price has to leave the lines adding up\n" +
    "                      price: (Number(r.sell) || 0) * (total > 0 ? final / total : 1)\n" +
    "                    }))\n" +
    "                },\n" +
    "                posQty: {}, posTendered: 0, posStage: 'idle', posSent: false, posContact: '', posPromo: 'none', posCustom: '',\n" +
    "                posSending: false, posReceiptNote: '',";

  return template.split(anchor).join(replacement);
}

/** The send itself, and a button that cannot claim more than it did. */
function sendItForReal(template: string): string {
  const anchor =
    "              posContact, setPosContact: e => this.setState({ posContact: e.target.value, posSent: false }),\n" +
    "              sendReceipt: () => { if (posContact.trim()) this.setState({ posSent: true }); },\n" +
    "              receiptCta: posSent ? 'Sent ✓' : 'Send receipt'";

  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing send receipt anchor");
  }

  const replacement = [
    "              posContact,",
    "              setPosContact: e => this.setState({ posContact: e.target.value, posSent: false, posReceiptNote: '' }),",
    "              sendReceipt: () => {",
    "                const address = (posContact || '').trim();",
    "                const at = address.indexOf('@');",
    "                const dot = address.lastIndexOf('.');",
    "                const looksLikeAnAddress = at > 0 && dot > at + 1 && dot < address.length - 2 && address.indexOf(' ') === -1;",
    "                if (!looksLikeAnAddress) {",
    "                  this.setState({ posReceiptNote: 'Enter an email address for the receipt.' });",
    "                  return;",
    "                }",
    "                if (this.state.posSending) return;",
    "                const done = this.state.posDone || {};",
    "                this.setState({ posSending: true, posReceiptNote: '' });",
    "                window.__baketlyApiFetch('/api/receipts', {",
    "                  method: 'POST',",
    "                  headers: { 'Content-Type': 'application/json' },",
    "                  body: JSON.stringify({",
    "                    to: address,",
    "                    bakeryName: this.state.bakeryName || '',",
    "                    total: done.total || 0,",
    "                    currency: this.state.currency || 'USD',",
    "                    method: done.method || 'Cash',",
    "                    lines: done.lines || [],",
    "                    soldAt: new Date().toISOString()",
    "                  })",
    "                }).then(response => response.json().catch(() => ({})).then(body => {",
    "                  if (response.ok && body.sent) {",
    "                    this.setState({ posSending: false, posSent: true, posReceiptNote: 'Sent to ' + address });",
    "                  } else {",
    "                    this.setState({ posSending: false, posSent: false, posReceiptNote: body.error || 'The receipt could not be sent.' });",
    "                  }",
    "                })).catch(() => {",
    "                  this.setState({ posSending: false, posSent: false, posReceiptNote: 'No connection, so the receipt was not sent.' });",
    "                });",
    "              },",
    "              receiptCta: this.state.posSending ? 'Sending…' : (posSent ? 'Sent ✓' : 'Send receipt'),",
    "              receiptNote: this.state.posReceiptNote || '',",
    "              hasReceiptNote: !!(this.state.posReceiptNote || '')",
  ].join("\n");

  return template.split(anchor).join(replacement);
}

/**
 * Email only, and room to say what happened.
 *
 * The box took "Phone or email". Baketly sends email; a phone number typed
 * there would have gone nowhere, which is worse than not offering it.
 */
function emailOnly(template: string): string {
  const field =
    '    <input class="input" value="{{ posContact }}" sc-camel-on-change="{{ setPosContact }}" placeholder="Phone or email for receipt" style="flex:1">';

  if (template.split(field).length - 1 !== 1) {
    throw new Error("Missing receipt field anchor");
  }

  const emailField =
    '    <input class="input" type="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" value="{{ posContact }}" sc-camel-on-change="{{ setPosContact }}" placeholder="Email for receipt" aria-label="Email for receipt" style="flex:1">';

  let next = template.split(field).join(emailField);

  const afterButton =
    '    <button class="btn btn-secondary" sc-camel-on-click="{{ sendReceipt }}" style="min-height:48px;flex:none">{{ receiptCta }}</button>\n' +
    "  </div>";

  if (next.split(afterButton).length - 1 !== 1) {
    throw new Error("Missing receipt button anchor");
  }

  const withNote =
    afterButton +
    '\n  <sc-if value="{{ hasReceiptNote }}" hint-placeholder-val="{{ false }}">' +
    '<div class="text-muted" style="font-size:12px;line-height:1.45;margin-bottom:10px;text-align:center">{{ receiptNote }}</div>' +
    "</sc-if>";

  next = next.split(afterButton).join(withNote);
  return next;
}

export function applyReceiptBehavior(template: string): string {
  return emailOnly(sendItForReal(captureWhatWasSold(template)));
}
