"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetAccountAction } from "@/server/actions";

export function DangerZone({ showSeed }: { showSeed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [seeding, setSeeding] = useState(false);

  function reset() {
    startTransition(async () => {
      const result = await resetAccountAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Everything wiped");
      setOpen(false);
      router.replace("/onboarding");
      router.refresh();
    });
  }

  async function seed() {
    setSeeding(true);
    try {
      const response = await fetch("/api/dev/seed", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Seeding failed");
      toast.success(`Generated ${data.daysGenerated} days of demo history`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-4">
      {showSeed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3.5">
          <div>
            <p className="text-sm font-medium">Load demo history</p>
            <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
              Replaces everything with 45 days of fabricated but realistic data,
              so the history and progress screens have something to show.
              Development only.
            </p>
          </div>
          <Button variant="outline" onClick={seed} disabled={seeding}>
            {seeding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Database className="size-4" />
            )}
            Generate
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-destructive">
            Delete everything
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
            Profile, food entries, weight readings, achievements. Not
            recoverable.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button variant="destructive">
                <TriangleAlert className="size-4" />
                Reset
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete all your data?</DialogTitle>
              <DialogDescription>
                This wipes every meal, reading and achievement, and sends you
                back to onboarding. There is no undo.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm">
                Type <span className="font-mono text-foreground">DELETE</span> to
                confirm
              </Label>
              <Input
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={reset}
                disabled={pending || confirm !== "DELETE"}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete everything
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
