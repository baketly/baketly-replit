// Where a tapped reminder lands.
//
// A notification that only opens the app has left the work to the baker.
// "Shopping for Harbour Market" should arrive at that market's shopping list;
// "Harbour Market is tomorrow" at the market itself; a morning list of to-dos
// at the home screen, which is where the list lives.
//
// The screens cannot be reached from outside — they are source text injected
// into the generated page, with no module to import — so this publishes a way
// in on the window, and native-reminders.ts calls it when a reminder is
// tapped. It is republished on every render rather than once, so the closure
// always holds the live component and never a stale one.

/**
 * The route itself.
 *
 * Opening a market is the same work the home screen's own handler does: the
 * editor is driven by a dozen pieces of state, and arriving with half of them
 * set would show the previous market's lineup under this market's name. A
 * market that is already over goes to its analytics instead, because there is
 * nothing left to plan.
 */
const controller = `      ...(() => {
        window.__baketlyOpenReminder = target => {
          const kind = (target && target.kind) || '';
          const wantedId = (target && target.eventId) || '';
          if (kind === 'todos_today') {
            this.setState({ screen: 'dash', stack: [], sheet: false });
            return;
          }

          const known = Array.isArray(this.state.eventRecords) ? this.state.eventRecords : [];
          const event = known.find(one => one && one.id === wantedId) || null;
          // The market was deleted between the reminder being scheduled and
          // the baker tapping it. Markets is the honest place to land: it
          // shows that it is gone rather than opening an empty editor.
          if (!event) {
            this.setState({ screen: 'markets', stack: [], sheet: false });
            return;
          }

          if (event.status === 'completed') {
            this.setState({
              screen: 'analyticsEvent', stack: ['dash'], analyticsEventId: event.id, eventCostsOpen: false, sheet: false
            });
            return;
          }

          const quantities = {};
          (event.plannedItems || []).forEach(item => { quantities[item.productId] = item.quantity; });
          // The shopping list sits on top of its own market, so Back from it
          // goes to the market rather than out of the app.
          const stack = kind === 'shopping_list' ? ['dash', 'event'] : ['dash'];
          this.setState({
            screen: kind === 'shopping_list' ? 'shopping' : 'event',
            stack,
            sheet: false,
            eventCurrentId: event.id,
            eventName: event.name || 'Market',
            eventDate: (event.occurredAt || '').slice(0, 10),
            eventBoothFee: Number(event.boothFee) || 0,
            eventOtherCosts: (event.otherCosts || []).map(cost => ({ label: cost.label, amount: String(cost.amount) })),
            evPicked: (event.plannedItems || []).map(item => item.productId),
            evQty: quantities,
            evSold: {},
            evStatus: 'planned',
            evSaved: true,
            evEnteringResults: false,
            evResultsOnly: false,
            evPickerOpen: false,
            evPickerSel: [],
            eventDeleteOpen: false,
            shopNeed: {},
            shopNeedText: {}
          });
        };
        return {};
      })(),
`;

export function applyReminderRoutingBehavior(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) {
    throw new Error("Missing stable controller anchor for reminder routing");
  }
  return template.replace(
    anchor,
    (_match, indent: string) => `${controller}${indent}onAnalytics: screen === 'analytics',`,
  );
}
