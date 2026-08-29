// components/MeetingRoom/MeetingHeader.tsx
"use client";
import { useState, useEffect } from "react";
import { Volume2, VolumeX, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  clientName: string;
  companyName: string;
  onEnd: () => void;
  muted: boolean;
  onMuteToggle: () => void;
}

export function MeetingHeader({ clientName, companyName, onEnd, muted, onMuteToggle }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  return (
    <header className="border-b border-border/70 px-5 py-3.5 flex items-center justify-between bg-card/90 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <div>
          <p className="text-foreground font-medium text-sm">{clientName} · {companyName}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">{mins}:{secs}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onMuteToggle} className="gap-1.5">
          {muted ? <VolumeX className="size-4" strokeWidth={1.5} /> : <Volume2 className="size-4" strokeWidth={1.5} />}
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setShowConfirm(true)} className="gap-1.5">
          <PhoneOff className="size-4" strokeWidth={1.5} />
          End Meeting
        </Button>
      </div>
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End the meeting?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            This will end the session and take you to the debrief.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { setShowConfirm(false); onEnd(); }}>
              End Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
