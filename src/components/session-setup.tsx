"use client";

import { useState } from "react";
import { requestJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_POINT_VALUE } from "@/lib/scoring";
import type { SeatClaim } from "@/lib/types";

export function SessionSetup({
  onCreated,
  onCancel,
}: {
  onCreated: (claim: SeatClaim) => void;
  onCancel: (() => void) | null;
}) {
  const [name, setName] = useState("");
  const [pointValue, setPointValue] = useState(DEFAULT_POINT_VALUE.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function start() {
    const value = Number(pointValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Set a dollar value greater than zero");
      return;
    }
    if (name.trim() === "") {
      setError("Enter your name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const claim = await requestJson<SeatClaim>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ pointValue: value, name }),
      });
      onCreated(claim);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="pb-28"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">New session</h2>
        {onCancel && (
          <Button type="button" variant="outline" className="h-12 px-4" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
      <p className="mb-5 text-base text-[#5e584e]">
        Points Rummy. Set the dollar value of one point and your name. The other players join from
        their phones. The winner is paid the other players&apos; points times that value.
      </p>

      <div>
        <Label htmlFor="your-name">Your name</Label>
        <Input
          id="your-name"
          value={name}
          autoCapitalize="words"
          autoComplete="off"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          className="mt-1 h-12 text-base"
        />
      </div>

      <div className="mt-5">
        <Label htmlFor="point-value">Dollars per point</Label>
        <Input
          id="point-value"
          inputMode="decimal"
          value={pointValue}
          onChange={(event) => setPointValue(event.target.value)}
          className="mt-1 h-12 text-base tabular-nums"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl">
          <Button type="submit" size="xl" className="w-full" disabled={saving}>
            {saving ? "Starting…" : "Start session"}
          </Button>
        </div>
      </div>
    </form>
  );
}
