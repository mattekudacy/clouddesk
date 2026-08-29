// components/Brief/JoinButton.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTrail } from "@/components/IconTrail";

export function JoinButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "connecting">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleJoin() {
    setState("connecting");
    timerRef.current = setTimeout(() => {
      router.push("/meeting");
    }, 500);
  }

  return (
    <Button
      onClick={handleJoin}
      disabled={state === "connecting"}
      size="lg"
      className="px-8"
    >
      {state === "connecting" ? "Connecting…" : "Join Meeting"}
      {state !== "connecting" && (
        <IconTrail>
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </IconTrail>
      )}
    </Button>
  );
}
