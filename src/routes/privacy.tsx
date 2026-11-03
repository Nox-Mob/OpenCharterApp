import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_PLACEHOLDER, LEGAL_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from "@/content/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy — OpenCharterApp" }] }),
  component: () => (
    <LegalPage
      title="Privacy policy"
      updated={LEGAL_UPDATED}
      placeholder={LEGAL_PLACEHOLDER}
      intro={PRIVACY_INTRO}
      sections={PRIVACY_SECTIONS}
    />
  ),
});
