// app/meeting/page.tsx
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CallStage } from "@/components/MeetingRoom/CallStage";
import { InputBar } from "@/components/MeetingRoom/InputBar";
import { MeetingHeader } from "@/components/MeetingRoom/MeetingHeader";
import { speak, listen, isSTTSupported } from "@/lib/speech";
import type { ScenarioOutput, Message } from "@/lib/types";

export default function MeetingPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  // Whether the client's voice actually got spoken for the current turn —
  // distinct from `muted` (a deliberate choice) since TTS can also just
  // fail. Drives whether CallStage falls back to showing text: a live call
  // shows no captions while audio is genuinely working, only when it isn't.
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const initialized = useRef(false);

  // Voice-agent loop state. This is a real call, not a chat with voice
  // bolted on: when voice mode is on, the mic listens automatically once
  // it's the user's turn, submits the moment the browser's own
  // end-of-speech detection fires, and re-arms after the reply. Typing
  // stays available as an explicit, always-visible fallback — Safari has
  // no SpeechRecognition support at all, so voice mode can never be the
  // only path. See CLAUDE.md, Failure Behavior.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const listenAbortRef = useRef<AbortController | null>(null);
  const listenInFlightRef = useRef(false);

  useEffect(() => {
    const supported = isSTTSupported();
    setVoiceSupported(supported);
    setVoiceEnabled(supported);
  }, []);

  useEffect(() => {
    const rawScenario = sessionStorage.getItem("clouddesk:scenario");
    if (!rawScenario) { router.replace("/setup"); return; }
    try {
      setScenario(JSON.parse(rawScenario));
    } catch {
      router.replace("/setup");
    }
  }, [router]);

  const sendToAgent = useCallback(
    async (
      history: Message[],
      currentScenario: ScenarioOutput,
      retryContext?: { text: string; baseLength: number },
    ) => {
      setIsThinking(true);
      setSendError(null);
      // Intentional 1-2s pacing delay
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const res = await fetch("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: currentScenario, history }),
        });
        if (!res.ok) throw new Error(`Meeting API error: ${res.status}`);
        const data = await res.json();
        const reply = data.reply as string;

        const newMsg: Message = { role: "assistant", content: reply };
        setMessages((prev) => [...prev, newMsg]);
        setIsThinking(false);

        if (!mutedRef.current) {
          setIsSpeaking(true);
          setAudioUnavailable(false);
          try {
            await speak(reply, currentScenario.voiceId);
          } catch (speakErr) {
            // Audio is an enhancement, never a dependency — a TTS failure
            // must never be treated as a failed turn (it isn't one; the
            // reply above already landed). Still give it a visible state
            // per CLAUDE.md's Failure Behavior, reusing the existing banner.
            console.error("speak() failed:", speakErr);
            setSendError("Audio unavailable — continuing text-only.");
            setAudioUnavailable(true);
          } finally {
            setIsSpeaking(false);
          }
        }
      } catch (err) {
        console.error("meeting turn failed:", err);
        setIsThinking(false);
        // Preserve what the user typed — losing it mid-conversation is the
        // worst failure in the app. See CLAUDE.md, Failure Behavior.
        if (retryContext) {
          setMessages((prev) => prev.slice(0, retryContext.baseLength));
          setRestoreText({ text: retryContext.text, nonce: Date.now() });
          // The box this refers to is the typing fallback, which is hidden
          // whenever voice mode is driving the call — force it visible so
          // "back in the box" is actually true and the user can see and
          // resend what they said, whichever path it came from.
          setVoiceEnabled(false);
          setSendError("Couldn't reach the meeting agent. Your message is back in the box — send it again.");
        } else {
          setSendError("Couldn't reach the meeting agent.");
        }
      }
    },
    [],
  );

  // Fire opening greeting on mount
  useEffect(() => {
    if (!scenario || initialized.current) return;
    initialized.current = true;
    sendToAgent([], scenario);
  }, [scenario, sendToAgent]);

  const handleUserMessage = useCallback(
    async (text: string) => {
      if (!scenario || isThinking) return;
      // A typed/manually-sent message always supersedes an in-flight voice
      // capture — cancel it so a stale transcript can't arrive afterward
      // and submit a duplicate turn.
      listenAbortRef.current?.abort();
      const userMsg: Message = { role: "user", content: text };
      const baseLength = messages.length;
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      await sendToAgent(newHistory, scenario, { text, baseLength });
    },
    [scenario, isThinking, messages, sendToAgent],
  );

  const startListening = useCallback(() => {
    if (!voiceSupported || !voiceEnabled) return;
    if (listenInFlightRef.current || isThinking || isSpeaking) return;

    listenInFlightRef.current = true;
    const controller = new AbortController();
    listenAbortRef.current = controller;
    setListening(true);

    listen(controller.signal)
      .then((transcript) => {
        const trimmed = transcript.trim();
        if (trimmed) void handleUserMessage(trimmed);
        // An empty transcript just falls through — the idle, tappable mic
        // state reappears via the finally block below.
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return; // deliberate cancel, not a failure
        console.error("listen() failed:", err);
        if (err instanceof Error && err.message === "STT not supported in this browser") {
          // Only the genuine unsupported-browser case turns voice mode off
          // for good — every other error (no-speech timeout, momentary
          // permission hiccup, network blip) just falls back to an idle,
          // tappable mic rather than a scary banner on every silence.
          setVoiceEnabled(false);
          setSendError("Voice input isn't available in this browser — type your response below instead.");
        }
      })
      .finally(() => {
        listenInFlightRef.current = false;
        setListening(false);
        listenAbortRef.current = null;
      });
  }, [voiceSupported, voiceEnabled, isThinking, isSpeaking, handleUserMessage]);

  // Auto-arm listening the moment it becomes the user's turn — after the
  // greeting lands, and after every subsequent reply finishes (speaking or
  // not, if muted). This is the hands-free part of the loop.
  useEffect(() => {
    if (!scenario || isThinking || isSpeaking || !voiceEnabled || !voiceSupported) return;
    startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, isThinking, isSpeaking, voiceEnabled, voiceSupported, messages.length]);

  // Cancel any in-flight listen on unmount (route change, tab close).
  useEffect(() => {
    return () => {
      listenAbortRef.current?.abort();
    };
  }, []);

  function toggleVoiceMode() {
    if (voiceEnabled) listenAbortRef.current?.abort();
    setVoiceEnabled((v) => !v);
  }

  function retryGreeting() {
    if (!scenario || isThinking) return;
    sendToAgent([], scenario);
  }

  function handleEndMeeting() {
    listenAbortRef.current?.abort();
    sessionStorage.setItem("clouddesk:transcript", JSON.stringify(messages));
    router.push("/debrief");
  }

  if (!scenario) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading meeting…</p>
      </main>
    );
  }

  return (
    <main id="main-content" className="h-dvh bg-background flex flex-col">
      <MeetingHeader
        clientName={scenario.clientName}
        companyName={scenario.companyName}
        onEnd={handleEndMeeting}
        muted={muted}
        onMuteToggle={() => setMuted((m) => !m)}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <CallStage
          clientName={scenario.clientName}
          clientTitle={scenario.clientTitle}
          companyName={scenario.companyName}
          isSpeaking={isSpeaking}
          isThinking={isThinking}
          messages={messages}
          voiceSupported={voiceSupported}
          voiceEnabled={voiceEnabled}
          listening={listening}
          muted={muted}
          audioUnavailable={audioUnavailable}
          onToggleVoice={toggleVoiceMode}
          onManualListen={startListening}
        />
        {sendError && (
          <div className="px-4 py-2.5 border-t border-warning/20 bg-warning/10 flex items-center justify-between gap-3">
            <p className="text-warning text-xs">{sendError}</p>
            {messages.length === 0 && (
              <button onClick={retryGreeting} className="text-xs font-medium text-warning hover:underline shrink-0">
                Retry
              </button>
            )}
          </div>
        )}
        {/* The type-and-send bar is the fallback for when voice isn't the
            active path — never shown alongside a live voice call, which is
            what made this still read as a chat app no matter how the call
            stage above it looked. See CLAUDE.md, Failure Behavior. */}
        {(!voiceEnabled || !voiceSupported) && (
          <InputBar
            onSend={handleUserMessage}
            disabled={isThinking}
            restoreText={restoreText}
            showMic={voiceSupported && !voiceEnabled}
          />
        )}
      </div>
    </main>
  );
}
