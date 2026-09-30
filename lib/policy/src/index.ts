// The privacy policy, written once.
//
// It is shown in two places that must never disagree: a screen inside the app,
// which is where a baker actually reads it, and a public page the API serves,
// which is the URL the App Store requires and anyone can open without the app.
// Two copies of a policy is two policies, and the one nobody edits becomes a
// promise the app no longer keeps.
//
// So it lives here as structure rather than markup, and each side renders it
// the way it renders everything else.

export const PRIVACY_UPDATED = "24 September 2026";

export interface PolicyBullet {
  /** the few words in bold at the front of the line */
  lead: string;
  text: string;
}

export interface PolicySection {
  /** absent on the opening paragraph, which stands before any heading */
  heading?: string;
  paragraphs?: string[];
  bullets?: PolicyBullet[];
}

/**
 * What Baketly does with a baker's data, in the order they would ask.
 *
 * Plain about the parts that are easy to be vague about: photographs of labels
 * and questions asked of the chat both leave the phone and go to Google, and
 * saying so is both the requirement and the decent thing.
 */
export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    paragraphs: [
      "Baketly is a tool for home bakers: it works out what a bake costs, what to charge for it, and what a market earned. This policy explains what it keeps, what leaves your phone, and how to get rid of all of it.",
    ],
  },
  {
    heading: "What Baketly stores",
    bullets: [
      {
        lead: "Your account:",
        text: "your email address, and a password stored only as a cryptographic hash — nobody at Baketly can read it. If you sign in with Google or Apple, we store the identifier they give us, not your password with them.",
      },
      {
        lead: "Your bakery:",
        text: "ingredients and their prices, recipes, packaging, products, photos you add to recipes, sales, markets and their results, your to-do list, and your settings. This is yours, kept so it is there on your next visit.",
      },
      {
        lead: "Where you sell:",
        text: "the town or address you enter, used to find bakeries near you. Baketly does not track your location, and does not ask the phone for it.",
      },
    ],
  },
  {
    heading: "What leaves your phone, and where it goes",
    bullets: [
      {
        lead: "Photographs of nutrition labels",
        text: "are sent to Google's Gemini API to be read. Google processes the image to return the text on it.",
      },
      {
        lead: "Questions you ask Baketly",
        text: "are sent to Google's Gemini API, together with the figures needed to answer them — for example a market's revenue and costs. Your full bakery is never sent.",
      },
      {
        lead: "Speech,",
        text: "when you use the microphone, is transcribed by the service your phone provides (Apple on iOS). Baketly receives only the resulting text.",
      },
      {
        lead: "Prices at nearby bakeries",
        text: "are read from those bakeries' own public websites. Nothing about you is sent to them.",
      },
    ],
    paragraphs: [
      "Baketly does not sell your data, does not share it with advertisers, and shows no advertising.",
    ],
  },
  {
    heading: "Other bakeries' prices",
    paragraphs: [
      "Baketly reads prices published on nearby bakeries' public websites to show how yours compare. Those prices are facts about shops, not about you, and are kept separately from your account.",
    ],
  },
  {
    heading: "Deleting everything",
    paragraphs: [
      "Open Settings, then Account, then Delete my account. That removes your account and everything in it — recipes, ingredients, sales, markets and prices — and it cannot be undone. You can also write to us and ask.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "Baketly is for people running a small baking business and is not directed at children under 13.",
    ],
  },
  {
    heading: "Changes",
    paragraphs: [
      "If this policy changes in a way that matters, the date above changes and the app will say so.",
    ],
  },
];

/** Where a question about any of it should go. */
export function policyContact(): string {
  return "contact@baketly.com";
}
