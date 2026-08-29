// lib/speech.ts
// speak() and listen() are browser-only — called from components, never
// from agents. speak() proxies TTS through /api/speech (ElevenLabs,
// server-side only — see app/api/speech/route.ts); lib/speech.ts itself
// never sees an ElevenLabs API key or voice_id, only the app's own
// voiceId persona label ('af_sarah', 'am_adam', ...). listen() is
// unchanged — STT stays on the browser's own SpeechRecognition. See
// CLAUDE.md, Stack and Environment.

// Tracks the in-flight/most recent utterance so a new speak() call can cut
// off whatever the client was still saying — mirrors the previous
// window.speechSynthesis.cancel() behavior.
let currentAudio: HTMLAudioElement | null = null;

export function speak(text: string, voiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
    })
      .then(async (res) => {
        if (res.status === 501) {
          // TTS isn't configured for this deployment (no ELEVENLABS_API_KEY
          // or voice mapping) — a permanent condition, not a per-turn
          // failure. Same treatment as speechSynthesis being absent:
          // resolve immediately and stay text-only. See CLAUDE.md, Failure
          // Behavior.
          resolve();
          return;
        }
        if (!res.ok) throw new Error(`speech API error: ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentAudio === audio) currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (currentAudio === audio) currentAudio = null;
          reject(new Error("audio playback failed"));
        };
        await audio.play();
      })
      .catch((err) => reject(err));
  });
}

/**
 * Feature-detects the SpeechRecognition API without instantiating it —
 * lets a caller decide whether to attempt voice mode at all before ever
 * calling listen(). Notably false in Safari (no SpeechRecognition support
 * at all), which is why voice mode always needs a working typed fallback.
 */
export function isSTTSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/**
 * One-shot speech-to-text. Resolves with the transcript once the browser's
 * own silence detection decides the user has stopped talking — that
 * built-in end-of-utterance detection is what a hands-free voice loop uses
 * for turn-taking; the caller doesn't need to build its own.
 *
 * `signal` lets a caller abort an in-flight listen (e.g. the user started
 * typing instead, or the meeting ended) — rejects with a DOMException named
 * "AbortError", which callers should treat as a cancellation, not a failure.
 */
export function listen(signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return reject(new Error("STT not available server-side"));
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return reject(new Error("STT not supported in this browser"));
    if (signal?.aborted) {
      return reject(new DOMException("Listening cancelled", "AbortError"));
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => resolve(e.results[0][0].transcript as string);
    recognition.onerror = (e: any) => reject(new Error(e.error));

    function onAbort() {
      recognition.abort();
      reject(new DOMException("Listening cancelled", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort);
    recognition.onend = () => signal?.removeEventListener("abort", onAbort);

    recognition.start();
  });
}
