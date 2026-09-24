// The microphone, inside the app.
//
// Ask Baketly's mic uses the browser's Web Speech API, which a WKWebView does
// not have: wrapped for iOS, the button was dead. The native recogniser does
// the same job — Apple transcribes and hands back text — so this exposes it
// through the same three verbs the chat screen already uses, and the screen
// takes whichever exists.
//
// Kept as a global rather than an import because the chat screen is injected
// source text inside a template literal and cannot import anything.

import { isNativeApp } from "./api";

interface SpeechPlugin {
  available?: () => Promise<{ available?: boolean }>;
  checkPermissions?: () => Promise<{ speechRecognition?: string }>;
  requestPermissions?: () => Promise<{ speechRecognition?: string }>;
  start?: (options: Record<string, unknown>) => Promise<{ matches?: string[] } | undefined>;
  stop?: () => Promise<unknown>;
  addListener?: (event: string, handler: (data: unknown) => void) => unknown;
  removeAllListeners?: () => Promise<unknown>;
}

function plugin(): SpeechPlugin | null {
  const capacitor = (window as {
    Capacitor?: { Plugins?: { SpeechRecognition?: SpeechPlugin } };
  }).Capacitor;
  return capacitor?.Plugins?.SpeechRecognition ?? null;
}

export interface NativeSpeech {
  /** starts listening; `onText` is called as words arrive */
  start(onText: (text: string) => void, onError: (message: string) => void): Promise<void>;
  stop(): Promise<void>;
}

export function nativeSpeech(): NativeSpeech | null {
  const speech = plugin();
  if (!isNativeApp() || !speech?.start) return null;

  return {
    async start(onText, onError) {
      try {
        const permitted = await speech.checkPermissions?.();
        if (permitted?.speechRecognition !== "granted") {
          const asked = await speech.requestPermissions?.();
          if (asked?.speechRecognition !== "granted") {
            onError("Baketly needs permission to use the microphone.");
            return;
          }
        }

        // partial results land in the box as they are spoken, the way the
        // browser's recogniser behaves
        await speech.removeAllListeners?.();
        speech.addListener?.("partialResults", (event: unknown) => {
          const matches = (event as { matches?: unknown })?.matches;
          if (Array.isArray(matches) && typeof matches[0] === "string") onText(matches[0]);
        });

        const result = await speech.start({
          language: "en-US",
          partialResults: true,
          popup: false,
          maxResults: 1,
        });
        const finalText = result?.matches?.[0];
        if (typeof finalText === "string" && finalText) onText(finalText);
      } catch {
        onError("I did not catch that. Try again, or type it.");
      }
    },
    async stop() {
      try {
        await speech.stop?.();
        await speech.removeAllListeners?.();
      } catch {
        // stopping a recogniser that already stopped is not a failure
      }
    },
  };
}
