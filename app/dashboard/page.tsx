// app/dashboard/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTrail } from "@/components/IconTrail";
import { DomainBars } from "@/components/Dashboard/DomainBars";
import { SessionList } from "@/components/Dashboard/SessionList";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  readUserModel,
  getCertProgress,
  getUserId,
  exportUserModel,
  importUserModel,
  resetUserModel,
} from "@/lib/userModel";
import { CERT_REGISTRY, type CertId } from "@/data/domains";
import type { UserModel, CertProgress } from "@/lib/types";

const CERT_IDS = Object.keys(CERT_REGISTRY) as CertId[];

function lastUsedCert(): CertId {
  const raw = sessionStorage.getItem("clouddesk:config");
  if (!raw) return "az-104";
  try {
    const cert = (JSON.parse(raw) as { cert?: CertId }).cert;
    return cert && cert in CERT_REGISTRY ? cert : "az-104";
  } catch {
    return "az-104";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<UserModel | null>(null);
  const [certId, setCertId] = useState<CertId>("az-104");
  const [certProgress, setCertProgress] = useState<CertProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function loadModel(forCertId: CertId) {
    const userId = getUserId();
    const m = readUserModel(userId);
    setModel(m);
    setCertProgress(getCertProgress(m, forCertId));
  }

  useEffect(() => {
    const initialCert = lastUsedCert();
    setCertId(initialCert);
    loadModel(initialCert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwitchCert(id: CertId) {
    setCertId(id);
    if (model) setCertProgress(getCertProgress(model, id));
  }

  function handleExport() {
    const userId = getUserId();
    const blob = new Blob([exportUserModel(userId)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clouddesk-progress-${userId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importUserModel(text);
      const importedCertIds = Object.keys(imported.certs) as CertId[];
      const nextCertId = importedCertIds.includes(certId) ? certId : (importedCertIds[0] ?? certId);
      setCertId(nextCertId);
      setNoticeIsError(false);
      setNotice("Progress imported.");
      loadModel(nextCertId);
    } catch (err) {
      setNoticeIsError(true);
      setNotice(err instanceof Error ? err.message : "Import failed — file was not a valid export.");
    }
  }

  function handleReset() {
    setShowResetConfirm(false);
    resetUserModel();
    setNoticeIsError(false);
    setNotice("Progress reset.");
    loadModel(certId);
  }

  if (!model || !certProgress) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-background py-16 px-4 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 800px 420px at 50% -10%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 70%)",
        }}
      />
      <div className="relative max-w-xl mx-auto space-y-9">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="eyebrow mb-3">Your progress</span>
            <h1 className="font-display text-4xl font-medium text-foreground">{CERT_REGISTRY[certId].name}</h1>
          </div>
          <Button onClick={() => router.push("/setup")} className="shrink-0">
            New Session
            <IconTrail>
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </IconTrail>
          </Button>
        </div>

        <div className="flex gap-1.5 flex-wrap bg-muted p-1.5 rounded-full w-fit">
          {CERT_IDS.map((id) => (
            <button
              key={id}
              onClick={() => handleSwitchCert(id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                certId === id
                  ? "bg-card text-primary shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>

        <section>
          <h2 className="text-sm font-medium text-foreground mb-4">Domain scores</h2>
          <DomainBars certId={certId} certProgress={certProgress} />
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground mb-4">
            Sessions ({certProgress.sessions.length})
          </h2>
          <SessionList sessions={certProgress.sessions} />
        </section>

        <section className="border-t border-border pt-6 flex flex-wrap gap-2 items-center">
          <Button variant="secondary" onClick={handleExport}>
            Export progress
          </Button>
          <Button variant="secondary" onClick={handleImportClick}>
            Import progress
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="destructive" onClick={() => setShowResetConfirm(true)}>
            Reset progress
          </Button>
          {notice && (
            <p className={`text-xs w-full ${noticeIsError ? "text-destructive" : "text-muted-foreground"}`}>
              {notice}
            </p>
          )}
        </section>

        <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset all progress?</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">This cannot be undone.</p>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReset}>
                Reset progress
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
