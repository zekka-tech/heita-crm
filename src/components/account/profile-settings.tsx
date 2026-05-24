"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("profileSettings");
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
      setStatus(response.ok ? t("updated") : payload?.error ?? t("updateError"));
    });
  };

  const deleteAccount = () => {
    const confirmed = window.confirm(t("confirmDelete"));

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/account", {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setStatus(payload?.error ?? t("deleteError"));
        return;
      }

      window.location.href = "/";
    });
  };

  return (
    <Card variant="surface" className="space-y-4">
      <h2 className="section-title">{t("title")}</h2>
      <div className="grid gap-3">
        <Input label={t("fullName")} value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          label={t("email")}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          label={t("preferredAiMode")}
          value={preferredAiMode}
          onChange={(event) => setPreferredAiMode(event.target.value)}
        >
          <option value="auto">{t("modeAuto")}</option>
          <option value="local">{t("modeLocal")}</option>
          <option value="cloud">{t("modeCloud")}</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={submit} disabled={isPending}>
          {t("saveChanges")}
        </Button>
        <Button asChild variant="secondary">
          <a href="/api/account/export">{t("downloadData")}</a>
        </Button>
        <Button type="button" variant="danger" onClick={deleteAccount} disabled={isPending}>
          {t("deleteAccount")}
        </Button>
      </div>
      {status ? <p className="text-sm text-ink-muted">{status}</p> : null}
    </Card>
  );
}
