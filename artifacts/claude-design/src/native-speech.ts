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
  /**
   * Starts listening; `onText` is called as words arrive. Resolves when the
   * listening has ended -- the baker pressed stop, or the phone gave up on
   * the silence -- never before.
   */
  start(onText: (text: string) => void, onError: (message: string) => void): Promise<void>;
  stop(): Promise<void>;
}

/** iOS ends a recognition on its own after about a minute; this is the belt to that */
const LONGEST_LISTEN_MS = 90_000;

/** what the plugin's complaints mean to a baker */
function explain(error: unknown): string {
  const text = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  if (text.includes("permission") || text.includes("denied") || text.includes("not authorized")) {
    return "Baketly needs permission to use the microphone. You can allow it in Settings.";
  }
  if (text.includes("not available") || text.includes("unavailable")) {
    return "Dictation is not available on this phone.";
  }
  return "The microphone could not start. Try again, or type it.";
}

export function nativeSpeech(): NativeSpeech | null {
  const speech = plugin();
  if (!isNativeApp() || !speech?.start) return null;

  const quiet = async () => {
    // stopping a recogniser that already stopped is not a failure
    try {
      await speech.stop?.();
    } catch {}
    try {
      await speech.removeAllListeners?.();
    } catch {}
  };

  return {
    async start(onText, onError) {
      try {
        const ready = await speech.available?.();
        if (ready && ready.available === false) {
          onError("Dictation is not available on this phone.");
          return;
        }
        const permitted = await speech.checkPermissions?.();
        if (permitted?.speechRecognition !== "granted") {
          const asked = await speech.requestPermissions?.();
          if (asked?.speechRecognition !== "granted") {
            onError("Baketly needs permission to use the microphone.");
            return;
          }
        }
      } catch (error) {
        onError(explain(error));
        return;
      }

      // The first version awaited start() and took its return as the end of
      // the listening. With partial results on, start() returns the moment
      // the engine is running, so the button flipped back to idle at once,
      // the listeners were torn down, and whatever the baker said next was
      // heard by nobody: "it says it didn't get anything". The end of the
      // listening is an event, and this waits for it.
      await quiet();
      let finished = false;
      await new Promise<void>((resolve) => {
        let timer = 0;
        const finish = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timer);
          void speech.removeAllListeners?.().catch(() => {});
          resolve();
        };
        speech.addListener?.("partialResults", (event: unknown) => {
          const matches = (event as { matches?: unknown })?.matches;
          if (Array.isArray(matches) && typeof matches[0] === "string") onText(matches[0]);
        });
        speech.addListener?.("listeningState", (event: unknown) => {
          const status = (event as { status?: unknown })?.status;
          if (status === "stopped") finish();
        });
        timer = window.setTimeout(() => {
          void quiet();
          finish();
        }, LONGEST_LISTEN_MS);

        const options = { language: "en-US", partialResults: true, popup: false, maxResults: 1 };
        const begin = () =>
          speech.start!(options).then((result) => {
            // older plugins hand the words back here instead of as events
            const finalText = result?.matches?.[0];
            if (typeof finalText === "string" && finalText) onText(finalText);
          });
        begin().catch(async (error: unknown) => {
          // "ongoing": the engine was still running from a listen that was
          // never stopped. Stop it and go once more before giving up.
          if (String((error as { message?: unknown })?.message ?? "").toLowerCase().includes("ongoing")) {
            try {
              await speech.stop?.();
              await begin();
              return;
            } catch (again) {
              error = again;
            }
          }
          onError(explain(error));
          finish();
        });
      });
    },
    async stop() {
      // only the engine is stopped here; the listeners stay up so the
      // "stopped" event can end the listen above, and the last partial
      // result can still land in the box
      try {
        await speech.stop?.();
      } catch {}
    },
  };
}
