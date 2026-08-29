// components/MeetingRoom/InputBar.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listen } from "@/lib/speech";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  restoreText?: { text: string; nonce: number };
  // False when CallStage owns the mic (voice mode is on) — one active mic
  // control at a time, not two competing affordances on screen.
  showMic?: boolean;
}

export function InputBar({ onSend, disabled, restoreText, showMic = true }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A failed meeting turn hands the unsent text back here rather than
  // letting it vanish. See CLAUDE.md, Failure Behavior.
  useEffect(() => {
    if (restoreText) setText(restoreText.text);
  }, [restoreText]);

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleMic() {
    if (listening || disabled) return;
    setListening(true);
    try {
      const transcript = await listen();
      setText(transcript);
      textareaRef.current?.focus();
    } catch {
      // STT not supported or user denied — silently ignore
    } finally {
      setListening(false);
    }
  }

  return (
    <div className="border-t border-border/70 p-4 flex gap-3 items-end bg-card/90 backdrop-blur-xl">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={showMic ? "Type or speak your response… (Enter to send)" : "Type your response… (Enter to send)"}
        disabled={disabled}
        className="flex-1 min-h-[44px] max-h-32 resize-none rounded-2xl"
        rows={1}
      />
      {showMic && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMic}
          disabled={disabled || listening}
          className={listening ? "text-primary" : ""}
          title="Voice input"
          aria-label={listening ? "Listening…" : "Voice input"}
        >
          <Mic className={`size-4 ${listening ? "animate-pulse" : ""}`} strokeWidth={1.5} />
        </Button>
      )}
      <Button onClick={handleSend} disabled={disabled || !text.trim()} className="gap-1.5">
        Send
        <Send className="size-3.5" strokeWidth={2} />
      </Button>
    </div>
  );
}
