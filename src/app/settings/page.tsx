import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";
import { canEncrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Configure data + LLM provider plugins, models, and portfolio assumptions. Keys are encrypted at rest and never sent to the browser."
      />
      <SettingsClient encryptionReady={canEncrypt()} />
    </div>
  );
}
