import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";
import { canEncrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Provider plugins, analysis assumptions, and keys. Keys are encrypted at rest and never sent to the browser."
      />
      <p className="mb-6 rounded-lg border bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted)]">
        Grounded analysis sends the computed data packet (and, in future
        versions, relevant excerpts from files you attach) to your configured
        LLM provider — that is the core function of this app. Nothing is sent
        anywhere else.
      </p>
      <SettingsClient encryptionReady={canEncrypt()} />
    </div>
  );
}
