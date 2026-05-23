"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";

type ProfileSettingsProps = {
  initialName: string;
  initialEmail: string;
  initialPreferredAiMode: string;
};

export function ProfileSettings({
  initialName,
  initialEmail,
  initialPreferredAiMode
}: ProfileSettingsProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [preferredAiMode, setPreferredAiMode] = useState(initialPreferredAiMode);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      setStatus(null);
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          preferredAiMode
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(response.ok ? "Profile updated." : payload?.error ?? "Unable to update profile.");
    });
  };

  const deleteAccount = () => {
    const confirmed = window.confirm(
      "Delete your Heita account? This will cancel active memberships and start the deletion process."
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/account", {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setStatus(payload?.error ?? "Unable to delete your account.");
        return;
      }

      window.location.href = "/";
    });
  };

  return (
    <Card variant="surface" className="space-y-4">
      <h2 className="section-title">Account settings</h2>
      <div className="grid gap-3">
        <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          label="Preferred AI mode"
          value={preferredAiMode}
          onChange={(event) => setPreferredAiMode(event.target.value)}
        >
          <option value="auto">Auto</option>
          <option value="local">Local only</option>
          <option value="cloud">Cloud fallback preferred</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={submit} disabled={isPending}>
          Save changes
        </Button>
        <Button asChild variant="secondary">
          <a href="/api/account/export">Download my data</a>
        </Button>
        <Button type="button" variant="danger" onClick={deleteAccount} disabled={isPending}>
          Delete account
        </Button>
      </div>
      {status ? <p className="text-sm text-ink-muted">{status}</p> : null}
    </Card>
  );
}
