// The home screen: a greeting, the week ahead, and what to do next.
//
// It used to be a dashboard — eight rearrangeable modules of numbers, every
// one of them a report you could already get from Analytics. A baker opening
// the app in the morning does not want a report; they want to know what day it
// is, what is coming, and what to do next.
//
// The whole screen is replaced in one piece rather than patched module by
// module: fewer exact-string anchors to break, and the layout is readable in
// one file.

const GREETING_HOURS = { morning: 12, afternoon: 18 };

const homeController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const st = this.state;
        const recipes = Array.isArray(st.recipeRecords) ? st.recipeRecords : [];
        const events = Array.isArray(st.eventRecords) ? st.eventRecords : [];
        const ingredients = st.ingredientRecords || {};
        const packaging = st.packagingRecords || {};
        const removedIng = new Set(st.removedIngredientKeys || []);
        const removedPack = new Set(st.removedPackagingKeys || []);

        const hasIngredients = Object.keys(ingredients).filter(k => !removedIng.has(k)).length > 0;
        const hasPackaging = Object.keys(packaging).filter(k => !removedPack.has(k)).length > 0;
        const hasRecipes = recipes.length > 0;

        // ---- greeting ---------------------------------------------------
        const now = new Date();
        const hour = now.getHours();
        const partOfDay = hour < ${GREETING_HOURS.morning} ? 'Good morning'
          : (hour < ${GREETING_HOURS.afternoon} ? 'Good afternoon' : 'Good evening');
        // Whatever they typed, greet them by the first word of it. Split on a
        // plain space rather than a pattern: this controller is injected as the
        // text of a template literal, where a backslash-s collapses to a bare
        // s and the name would be cut at its first lowercase s instead.
        const name = String(st.ownerName || '').trim().split(' ')[0] || '';
        const greeting = name ? partOfDay + ', ' + name : partOfDay;
        // day before month, the way a date is spoken: 'Thursday, 27 August'
        const todayLine = now.toLocaleDateString('en-US', { weekday: 'long' })
          + ', ' + now.getDate() + ' ' + now.toLocaleDateString('en-US', { month: 'long' });

        // ---- the week ahead ---------------------------------------------
        const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const today = startOfDay(now);
        const dayKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

        const eventsByDay = {};
        events.forEach(event => {
          const when = new Date(event.occurredAt || 0);
          if (isNaN(when.getTime())) return;
          const key = dayKey(startOfDay(when));
          if (!eventsByDay[key]) eventsByDay[key] = [];
          eventsByDay[key].push(event);
        });

        // A to-do belongs to a day, the way a market does. One saved before
        // to-dos had a day sits on today, so nothing already written vanishes.
        const todos = Array.isArray(st.todoItems) ? st.todoItems : [];
        const todayKey = dayKey(today);
        const openTodosByDay = {};
        todos.forEach(item => {
          if (!item || item.done) return;
          const key = item.day || todayKey;
          openTodosByDay[key] = (openTodosByDay[key] || 0) + 1;
        });

        const selected = Math.min(6, Math.max(0, Number(st.homeDayIndex) || 0));
        const week = [];
        for (let offset = 0; offset < 7; offset++) {
          const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
          const key = dayKey(date);
          const isToday = offset === 0;
          const isPicked = offset === selected;
          week.push({
            letter: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
            number: String(date.getDate()),
            key,
            dotOpacity: (eventsByDay[key] || []).length > 0 ? '1' : '0',
            dotColor: isPicked ? '#ffffff' : 'var(--color-accent)',
            todoDotOpacity: (openTodosByDay[key] || 0) > 0 ? '1' : '0',
            todoDotColor: isPicked ? '#f5d58f' : '#d4953a',
            bg: isPicked ? 'var(--color-accent)' : (isToday ? 'var(--color-accent-100)' : 'transparent'),
            color: isPicked ? '#ffffff' : 'var(--color-text)',
            border: isToday && !isPicked ? '1px solid var(--color-accent-300)' : '1px solid transparent',
            pick: () => this.setState({ homeDayIndex: offset })
          });
        }

        const pickedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + selected);
        const pickedLabel = selected === 0
          ? 'Today'
          : pickedDate.toLocaleDateString('en-US', { weekday: 'long' })
            + ', ' + pickedDate.getDate() + ' ' + pickedDate.toLocaleDateString('en-US', { month: 'long' });

        // A market that has happened opens its breakdown; one still to come
        // opens its own preview, loaded the same way the Upcoming list loads it.
        const openEvent = event => () => {
          if (event.status === 'completed') {
            return this.setState(s => ({
              screen: 'analyticsEvent', stack: [...s.stack, s.screen], analyticsEventId: event.id, eventCostsOpen: false
            }));
          }
          const quantities = {};
          (event.plannedItems || []).forEach(item => { quantities[item.productId] = item.quantity; });
          return this.setState(s => ({
            screen: 'event',
            stack: [...s.stack, s.screen],
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
            evPickerOpen: false,
            evPickerSel: [],
            eventDeleteOpen: false,
            shopNeed: {},
            shopNeedText: {}
          }));
        };

        const dayItems = (eventsByDay[dayKey(pickedDate)] || []).map(event => {
          const planned = (event.plannedItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
          return {
            name: event.name || 'Market',
            detail: planned > 0
              ? planned + (planned === 1 ? ' item to bake' : ' items to bake')
              : 'Nothing planned to bake yet',
            open: openEvent(event)
          };
        });

        // ---- this month, at a glance --------------------------------------
        // Made is what the ledger took this month, from any kind of sale.
        // Projected adds what this month's markets still to come are planned
        // to bring in, at today's prices. Events counts every market dated
        // this month, done or not.
        const sales = Array.isArray(st.saleRecords) ? st.saleRecords : [];
        const monthKey = dayKey(today).slice(0, 7);
        const inThisMonth = iso => {
          const when = new Date(iso || 0);
          return !isNaN(when.getTime()) && dayKey(startOfDay(when)).slice(0, 7) === monthKey;
        };
        const madeThisMonth = sales
          .filter(sale => inThisMonth(sale.occurredAt))
          .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
        const monthEvents = events.filter(event => inThisMonth(event.occurredAt));
        const plannedValue = event => (event.plannedItems || []).reduce((sum, item) => {
          const recipe = recipes.find(r => r.id === item.productId);
          return sum + (Number(item.quantity) || 0) * (recipe ? Number(recipe.price) || 0 : 0);
        }, 0);
        const stillToCome = monthEvents
          .filter(event => event.status !== 'completed' && startOfDay(new Date(event.occurredAt)) >= today)
          .reduce((sum, event) => sum + plannedValue(event), 0);
        const money = value => CUR + Math.round(value).toLocaleString('en-US');

        // ---- the next market ------------------------------------------------
        const nextEvent = events
          .filter(event => event.status !== 'completed')
          .map(event => ({ event, day: startOfDay(new Date(event.occurredAt || 0)) }))
          .filter(entry => !isNaN(entry.day.getTime()) && entry.day >= today)
          .sort((a, b) => a.day.getTime() - b.day.getTime())[0] || null;
        const daysToNext = nextEvent ? Math.round((nextEvent.day.getTime() - today.getTime()) / 86400000) : 0;

        // ---- what to do next ---------------------------------------------
        const goIngredientNew = () => this.setState(s => ({
          screen: 'ingredientEdit', stack: [...s.stack, s.screen],
          activeIngredientKey: null, ingredientDraft: null, ingredientSaveError: ''
        }));
        const goPackagingNew = () => this.setState(s => ({
          screen: 'packagingEdit', stack: [...s.stack, s.screen],
          activePackagingKey: null, packagingDraft: null, packagingSaveError: ''
        }));

        // Each starter step disappears the moment it is genuinely done, so the
        // list empties itself as the baker works rather than being ticked off.
        const starter = [
          { label: 'Add your first ingredient', done: hasIngredients, go: goIngredientNew },
          { label: 'Add your first packaging', done: hasPackaging, go: goPackagingNew },
          { label: 'Create your first recipe', done: hasRecipes, go: () => this.setState(s => ({ screen: 'ingredients', pantryTab: 'rec', stack: [...s.stack, s.screen] })) }
        ].filter(step => !step.done);

        const pickedKey = dayKey(pickedDate);
        const todoRows = todos
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => ((item && item.day) || todayKey) === pickedKey)
          .map(({ item, index }) => ({
          text: String(item && item.text || ''),
          done: !!(item && item.done),
          boxBg: item && item.done ? 'var(--color-accent)' : '#fff',
          boxBorder: item && item.done ? 'var(--color-accent)' : 'var(--color-neutral-300)',
          tick: item && item.done ? '#fff' : 'transparent',
          textColor: item && item.done ? '#9a947f' : 'var(--color-text)',
          strike: item && item.done ? 'line-through' : 'none',
          toggle: () => this.setState(s => ({
            todoItems: (s.todoItems || []).map((entry, i) => i === index ? { ...entry, done: !entry.done } : entry)
          })),
          remove: () => this.setState(s => ({
            todoItems: (s.todoItems || []).filter((_, i) => i !== index)
          }))
        }));

        const addTodo = () => this.setState(s => {
          const text = String(s.todoDraft || '').trim().slice(0, 120);
          if (!text) return {};
          const at = Math.min(6, Math.max(0, Number(s.homeDayIndex) || 0));
          const forDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + at);
          return { todoItems: [...(s.todoItems || []), { text, done: false, day: dayKey(forDay) }], todoDraft: '' };
        });

        // ---- what changed nearby -------------------------------------------
        const check = st.marketCheck || null;
        const checkedWhen = check && check.checkedAt ? new Date(check.checkedAt) : null;
        const nearbyLine = check && check.summary
          ? String(check.summary)
          : (String(st.bakeryLocation || '').trim()
            ? 'Baketly has not looked yet. Check what bakeries near you charge.'
            : 'Add where you sell and Baketly will tell you how your prices compare nearby.');

        return {
          homeGreeting: greeting,
          homeToday: todayLine,

          homeWeek: week,
          homeDayLabel: pickedLabel,
          homeDayItems: dayItems,
          homeDayHasItems: dayItems.length > 0,
          homeDayEmpty: dayItems.length === 0,

          homeMonthLabel: now.toLocaleDateString('en-US', { month: 'long' }),
          homeProjectedStr: money(madeThisMonth + stillToCome),
          homeMadeStr: money(madeThisMonth),
          homeEventsStr: String(monthEvents.length),

          homeHasNext: !!nextEvent,
          homeNextName: nextEvent ? (nextEvent.event.name || 'Market') : '',
          homeNextCount: daysToNext === 0 ? 'Today' : (daysToNext === 1 ? 'Tomorrow' : String(daysToNext)),
          homeNextUnit: daysToNext > 1 ? 'days to go' : '',
          homeNextDate: nextEvent
            ? nextEvent.day.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + nextEvent.day.getDate()
              + ' ' + nextEvent.day.toLocaleDateString('en-US', { month: 'long' })
            : '',
          openNextEvent: nextEvent ? openEvent(nextEvent.event) : () => {},

          homeStarter: starter,
          homeHasStarter: starter.length > 0,
          homeTodos: todoRows,
          homeHasTodos: todoRows.length > 0,
          homeTodoPlaceholder: selected === 0
            ? 'Add something to do today…'
            : 'Add something for ' + pickedDate.toLocaleDateString('en-US', { weekday: 'long' }) + '…',
          todoDraft: st.todoDraft || '',
          setTodoDraft: e => this.setState({ todoDraft: e.target.value.slice(0, 120) }),
          addTodo,

          homeNearby: nearbyLine,
          homeNearbyWhen: checkedWhen && !isNaN(checkedWhen.getTime())
            ? 'Checked ' + checkedWhen.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Not checked yet',

          goIngredientNew,
          goPackagingNew,
        };
      })(),
`;

function addHomeController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable home anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${homeController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

// The same cog the General section wears inside Settings. Home used a
// different drawing of one — spokes rather than a toothed wheel — so the
// button that opens Settings and the tab it lands on looked like two features.
import { SETTINGS_GEAR } from "./settings-template";

const iconButton = (handler: string, label: string, path: string) =>
  `<button class="btn btn-icon btn-secondary" sc-camel-on-click="{{ ${handler} }}" aria-label="${label}" style="width:40px;height:40px">` +
  `<svg width="17" height="17" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg></button>`;

const quickAction = (handler: string, label: string, path: string) =>
  `      <button class="btn btn-secondary" sc-camel-on-click="{{ ${handler} }}" style="flex:1;min-width:0;min-height:66px;flex-direction:column;gap:5px;padding:10px 4px;border-radius:16px">` +
  `<svg width="18" height="18" sc-camel-view-box="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>` +
  `<span style="font-size:9.5px;font-weight:600;line-height:1.2;text-align:center;letter-spacing:-0.01em">${label}</span></button>`;

const homeMarkup = `
<div style="padding:18px 20px 28px">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:22px">
    <div style="min-width:0">
      <h2 style="font-size:26px;line-height:1.2;margin:0 0 4px">{{ homeGreeting }}</h2>
      <div class="text-muted" style="font-size:13px">{{ homeToday }}</div>
    </div>
    <div style="display:flex;gap:6px;flex:none">
      ${iconButton("goChat", "Ask Baketly", '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"></path>')}
      ${iconButton("goSettings", "Settings", SETTINGS_GEAR)}
    </div>
  </div>

  <div style="display:flex;gap:6px;margin-bottom:20px">
    <sc-for list="{{ homeWeek }}" as="day" hint-placeholder-count="7">
      <div sc-camel-on-click="{{ day.pick }}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 7px;border-radius:14px;cursor:pointer;background:{{ day.bg }};color:{{ day.color }};border:{{ day.border }};box-sizing:border-box">
        <span style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.75">{{ day.letter }}</span>
        <span style="font-size:15px;font-weight:600;font-feature-settings:'tnum'">{{ day.number }}</span>
        <span style="display:flex;gap:3px"><span style="width:4px;height:4px;border-radius:50%;background:{{ day.dotColor }};opacity:{{ day.dotOpacity }}"></span><span style="width:4px;height:4px;border-radius:50%;background:{{ day.todoDotColor }};opacity:{{ day.todoDotOpacity }}"></span></span>
      </div>
    </sc-for>
  </div>

  <div style="display:flex;gap:5px">
${quickAction("goIngredientNew", "New<br>ingredient", '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"></path><path d="M3 8l9 5 9-5"></path>')}
${quickAction("goPackagingNew", "New<br>packaging", '<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M3 11h18M12 7v13"></path>')}
${quickAction("goNewRecipe", "New<br>recipe", '<path d="M6 3h9l4 4v14H6z"></path><path d="M9 12h7M9 16h5"></path>')}
${quickAction("startNewEvent", "New<br>event", '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4"></path>')}
  </div>

  <div style="height:22px"></div>
  <sc-if value="{{ homeHasNext }}" hint-placeholder-val="{{ false }}">
    <div class="card" sc-camel-on-click="{{ openNextEvent }}" style="flex-direction:row;align-items:center;gap:14px;padding:14px 16px;margin-bottom:24px;cursor:pointer">
      <div style="flex:none;min-width:64px;text-align:center;padding:8px 10px;border-radius:14px;background:var(--color-accent-100)">
        <div style="font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1.1;color:var(--color-accent-700);font-feature-settings:'tnum'">{{ homeNextCount }}</div>
        <div style="font-size:10px;color:var(--color-accent-700)">{{ homeNextUnit }}</div>
      </div>
      <div style="flex:1;min-width:0">
        <span class="card-kicker">Next market</span>
        <div style="font-size:15px;font-weight:600;margin-top:2px;overflow-wrap:anywhere">{{ homeNextName }}</div>
        <div class="text-muted" style="font-size:12px">{{ homeNextDate }}</div>
      </div>
      <span class="text-muted" style="flex:none;font-size:17px">›</span>
    </div>
  </sc-if>

  <h6 style="margin:0 0 8px">{{ homeDayLabel }}</h6>
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
    <sc-for list="{{ homeDayItems }}" as="item" hint-placeholder-count="1">
      <div class="card" sc-camel-on-click="{{ item.open }}" style="gap:4px;padding:15px 16px;cursor:pointer">
        <div style="font-size:15px;font-weight:600">{{ item.name }}</div>
        <div class="text-muted" style="font-size:12px">{{ item.detail }}</div>
      </div>
    </sc-for>
    <sc-if value="{{ homeDayEmpty }}" hint-placeholder-val="{{ true }}">
      <div class="text-muted" style="font-size:13px;line-height:1.5;padding:16px 2px;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider)">Nothing booked for this day. Markets you plan will show up here.</div>
    </sc-if>
  </div>

  <sc-if value="{{ homeHasStarter }}" hint-placeholder-val="{{ false }}">
    <h6 style="margin:0 0 8px">Getting set up</h6>
    <div style="display:flex;flex-direction:column;margin-bottom:22px">
      <sc-for list="{{ homeStarter }}" as="step" hint-placeholder-count="3">
        <div class="bk-row" sc-camel-on-click="{{ step.go }}" style="display:flex;align-items:center;gap:12px;padding:13px 2px;border-top:1px solid var(--color-divider);cursor:pointer;min-height:44px">
          <span style="width:22px;height:22px;flex:none;border-radius:7px;border:1.5px solid var(--color-neutral-300);background:#fff"></span>
          <span style="flex:1;font-size:14px">{{ step.label }}</span>
          <span class="text-muted" style="flex:none;font-size:17px">›</span>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <h6 style="margin:0 0 8px">To do</h6>
  <div style="display:flex;flex-direction:column;margin-bottom:10px">
    <sc-for list="{{ homeTodos }}" as="todo" hint-placeholder-count="2">
      <div style="display:flex;align-items:center;gap:12px;padding:11px 2px;border-top:1px solid var(--color-divider);min-height:44px">
        <button sc-camel-on-click="{{ todo.toggle }}" aria-label="Done" style="width:22px;height:22px;flex:none;border-radius:7px;border:1.5px solid {{ todo.boxBorder }};background:{{ todo.boxBg }};cursor:pointer;display:grid;place-items:center;padding:0">
          <svg width="12" height="12" sc-camel-view-box="0 0 24 24" fill="none" stroke="{{ todo.tick }}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
        </button>
        <span style="flex:1;font-size:14px;color:{{ todo.textColor }};text-decoration:{{ todo.strike }}">{{ todo.text }}</span>
        <button sc-camel-on-click="{{ todo.remove }}" aria-label="Remove" style="flex:none;width:30px;height:30px;border:0;background:none;cursor:pointer;color:var(--color-neutral-400);font-size:18px;line-height:1">×</button>
      </div>
    </sc-for>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:24px">
    <input class="input" value="{{ todoDraft }}" sc-camel-on-change="{{ setTodoDraft }}" aria-label="Add a to-do" placeholder="{{ homeTodoPlaceholder }}" style="flex:1;min-width:0;padding:11px 14px;font-size:13px">
    <button class="btn btn-secondary" sc-camel-on-click="{{ addTodo }}" style="flex:none;min-height:44px;padding:0 16px">Add</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff;margin-bottom:24px">
    <div style="padding:11px 12px">
      <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3px">Projected</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:18px;font-feature-settings:'tnum';overflow-wrap:anywhere">{{ homeProjectedStr }}</div>
    </div>
    <div style="padding:11px 12px;border-left:1px solid var(--color-divider)">
      <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3px">Made</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:18px;font-feature-settings:'tnum';overflow-wrap:anywhere">{{ homeMadeStr }}</div>
    </div>
    <div style="padding:11px 12px;border-left:1px solid var(--color-divider)">
      <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:3px">Events</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:18px;font-feature-settings:'tnum'">{{ homeEventsStr }}</div>
    </div>
    <div class="text-muted" style="grid-column:1 / -1;border-top:1px solid var(--color-divider);padding:7px 12px;font-size:11px">{{ homeMonthLabel }} · projected adds markets to come</div>
  </div>

  <div class="card" sc-camel-on-click="{{ goAlerts }}" style="gap:7px;margin-bottom:22px;cursor:pointer">
    <span class="card-kicker">What changed nearby</span>
    <div style="font-size:14px;line-height:1.55">{{ homeNearby }}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <span class="text-muted" style="font-size:11px">{{ homeNearbyWhen }}</span>
      <span style="font-size:12px;font-weight:600;color:var(--color-accent-700)">See what changed ›</span>
    </div>
  </div>

</div>
`;

/**
 * Swaps the whole dashboard for the new screen. One anchor instead of the
 * eleven the module-by-module version needed.
 */
function replaceHomeScreen(template: string): string {
  const open = '<sc-if value="{{ onDash }}"';
  const start = template.indexOf(open);
  if (start === -1) throw new Error("Missing home screen anchor");
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", cursor);
    const nextClose = template.indexOf("</sc-if>", cursor);
    if (nextClose === -1) throw new Error("Unclosed home screen block");
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 6;
    } else {
      depth -= 1;
      if (depth === 0) return template.slice(0, innerStart) + homeMarkup + template.slice(nextClose);
      cursor = nextClose + 8;
    }
  }
  throw new Error("Unclosed home screen block");
}

/** The greeting needs a name to greet, so Settings gains one field. */
function addNameField(template: string): string {
  const anchor =
    '<div class="field"><label>Bakery name</label><input class="input" value="{{ bakeryName }}"';
  if (!template.includes(anchor)) throw new Error("Missing settings bakery name anchor");
  return template.replace(
    anchor,
    () =>
      '<div class="field"><label>Your name</label><input class="input" value="{{ ownerName }}" sc-camel-on-change="{{ setOwnerName }}" aria-label="Your name" placeholder="what Baketly should call you"></div>' +
      anchor,
  );
}

const nameBinding = `      ownerName: this.state.ownerName || '',
      setOwnerName: e => this.setState({ ownerName: e.target.value.slice(0, 60) }),
`;

function addNameBinding(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable owner name anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${nameBinding}${indent}onAnalytics: screen === 'analytics',`,
  );
}

export function applyHomeBehavior(template: string): string {
  return addNameField(addNameBinding(replaceHomeScreen(addHomeController(template))));
}
