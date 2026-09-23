"use client";

import { useState } from "react";
import { requestJson } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionDetail } from "@/lib/types";

export function SessionSetup({
  onCreated,
  onCancel,
}: {
  onCreated: (session: SessionDetail) => void;
  onCancel: (() => void) | null;
}) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(["", ""]);
  const [dollarValue, setDollarValue] = useState("0.10");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setPlayerCount(next: number) {
    const size = Math.min(6, Math.max(2, next));
    setCount(size);
    setNames((current) => Array.from({ length: size }, (_, index) => current[index] ?? ""));
  }

  async function start() {
    const value = Number(dollarValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Set a dollar value greater than zero");
      return;
    }
    if (names.some((name) => name.trim() === "")) {
      setError("Enter a name for every player");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const session = await requestJson<SessionDetail>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ dollarValue: value, players: names }),
      });
      onCreated(session);
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
        Points Rummy. Set the dollar value of one point, then enter each game as you play. The
        winner is paid the other players&apos; points times that value.
      </p>

      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-base font-medium">Players</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 text-xl"
            onClick={() => setPlayerCount(count - 1)}
            disabled={count <= 2}
            aria-label="Fewer players"
          >
            −
          </Button>
          <span className="w-8 text-center text-xl tabular-nums">{count}</span>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 text-xl"
            onClick={() => setPlayerCount(count + 1)}
            disabled={count >= 6}
            aria-label="More players"
          >
            +
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {names.map((name, index) => (
          <div key={index}>
            <Label htmlFor={`player-${index}`}>Player {index + 1}</Label>
            <Input
              id={`player-${index}`}
              value={name}
              autoCapitalize="words"
              autoComplete="off"
              autoFocus={index === 0}
              onChange={(event) =>
                setNames((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                )
              }
              className="mt-1 h-12 text-base"
            />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <Label htmlFor="dollar-value">Dollars per point</Label>
        <Input
          id="dollar-value"
          inputMode="decimal"
          value={dollarValue}
          onChange={(event) => setDollarValue(event.target.value)}
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
