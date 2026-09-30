// What a good answer has to be true of.
//
// Not "the answer is this sentence" — the model words things differently every
// time and that check would fail on wording rather than on meaning. These are
// properties: things that must be said, and things that must never be.
//
// Every case here is a defect that actually happened. The comment on each says
// what it said before, so a failure is recognisable rather than abstract.

/** The answer must match. */
const says = (what, pattern) => ({ what, ok: (answer) => pattern.test(answer) });

/** The answer must not match. */
const never = (what, pattern) => ({ what, ok: (answer) => !pattern.test(answer) });

// Things no answer should ever contain, whatever was asked.
export const ALWAYS = [
  never(
    "leaks a field name from the tools",
    /labourCosted|labourMissing|productsMissingBatchTime|labourCountedEverywhere|recordedProfit|profitPerUnitAtTodaysCost|sellingBelowCostToday|hourlyRateSet|getNextStep|getPantry|getBakerySummary/i,
  ),
  never("uses markdown or bullets", /^\s*[-*•]\s|\*\*|^#{1,6}\s/m),
  never("talks about the baker in the third person", /\bthe baker\b/i),
  never("spells out a percentage", /\b(ninety|eighty|seventy|sixty|fifty)[- ]?\w* percent\b/i),
];

export const CASES = [
  // ---- an empty bakery ---------------------------------------------------
  {
    bakery: "empty",
    // It used to answer about local price checks to someone with no recipes.
    ask: ["how much should i charge for my bread?"],
    checks: [
      says("says there is nothing recorded", /nothing (in your bakery|recorded)|have not (added|recorded)/i),
      says("names the first thing to add", /recipe|ingredient/i),
      never("talks about price checks", /price check/i),
    ],
  },
  {
    bakery: "empty",
    ask: ["whats my best seller?"],
    checks: [
      says("says there is nothing recorded", /nothing (in your bakery|recorded)/i),
      never("names a product", /sourdough|babka/i),
    ],
  },

  // ---- a recipe, nothing sold -------------------------------------------
  {
    bakery: "recipeNoSales",
    // Said "Sourdough makes you the most money, bringing in $8.11 per unit"
    // about a loaf nobody had ever bought.
    ask: ["which product makes me the most money?"],
    checks: [
      never(
        "claims money was made when nothing has sold",
        /\b(has )?(earned|brought in|made you|making you)\b/i,
      ),
      says("says nothing has sold yet", /no(thing| sales)? (sold|recorded)|not sold|haven't sold|have not sold/i),
      says("frames it as what one would keep", /would keep|if you (baked and )?sold/i),
    ],
  },
  {
    bakery: "recipeNoSales",
    ask: ["what should i do next?"],
    checks: [says("asks for a sale", /sale|sell/i)],
  },

  // ---- too little trading to tell ---------------------------------------
  {
    bakery: "threeSales",
    // Three sales were reported as a best seller.
    ask: ["whats my best seller?"],
    checks: [
      says("says there is not enough trading", /not enough|too (few|little)|only three|just three/i),
      says("says more sales would change it", /more sales|record(ing)? a few more/i),
      never("declares a best seller outright", /is your best seller\b/i),
    ],
  },

  // ---- a rate that reaches nothing --------------------------------------
  {
    bakery: "rateNoMinutes",
    // Said "it does count your time because your hourly rate is set" when not
    // one recipe had a batch time on it.
    ask: ["how much did i make this month?"],
    checks: [
      says("says hours are not counted", /not (count|include)\w* your hours|not your hours|your hours are not/i),
      never("claims time is counted", /does count your time|includes your hours|your time is (counted|included)/i),
      says("names batch time as the fix", /batch|how long|minutes/i),
      never("tells them to set a rate they have set", /set (an|your) hourly rate/i),
    ],
  },
  {
    bakery: "rateNoMinutes",
    ask: ["is my sourdough priced right?"],
    checks: [
      says("answers the pricing question", /\bI'?d\b|I would/i),
      never(
        "invents what other bakeries charge",
        /neighbou?rs? (are )?charg|others charge|nearby bakeries charge \$/i,
      ),
      never("invents a sell-out it cannot know", /sold out|every (single )?loaf you brought/i),
    ],
  },

  // ---- keeping the thread -----------------------------------------------
  {
    bakery: "rateNoMinutes",
    // "What would you change about it?" after two answers about a loaf was
    // answered about markets, twice.
    ask: ["how is my sourdough doing?", "what would you change about it?"],
    checks: [
      // Checked as subject, not vocabulary: "I'd keep the price where
      // it is at .00" is plainly about the loaf without naming it, and an
      // earlier version of this check failed that perfectly good answer.
      says("answers about the loaf", /sourdough|price|recipe|batch|bake/i),
      // Naming market results as evidence it does not have is honest. The
      // defect was answering about markets instead of the loaf: 'you have
      // no markets recorded, so add one' to a question about a price.
      never(
        "pivots to advice about markets",
        /add (a|your) (first )?market|start by (adding|logging|saving)[^.]{0,30}market|nothing to change there/i,
      ),
    ],
  },

  // ---- the pantry --------------------------------------------------------
  {
    bakery: "rateNoMinutes",
    // Answered about a product, because no tool could read the pantry.
    ask: ["which ingredient costs me the most?"],
    checks: [
      says("names an ingredient", /flour|butter|vanilla/i),
      never("answers about a product instead", /^(your )?(sourdough|chocolate babka)\b/i),
    ],
  },

  // ---- off topic ---------------------------------------------------------
  {
    bakery: "rateNoMinutes",
    ask: ["who won the world cup?"],
    checks: [
      says("declines", /only know your|can'?t help|don'?t know about/i),
      says("invites a bakery question", /ask|bakery|kitchen|numbers/i),
      never("answers it", /argentina|france|brazil|germany|spain/i),
    ],
  },

  // ---- fully costed: nothing to hedge ------------------------------------
  {
    bakery: "fullyCosted",
    ask: ["how much did i make this month?"],
    checks: [
      never(
        "hedges about hours that are already counted",
        /not your hours|does not count your time|still needs? (how long|the minutes)/i,
      ),
    ],
  },
  {
    bakery: "fullyCosted",
    ask: ["what should i do next?"],
    checks: [says("asks for a market or a price check", /market|price check/i)],
  },
];
