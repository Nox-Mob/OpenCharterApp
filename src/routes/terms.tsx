import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_PLACEHOLDER, LEGAL_UPDATED, TERMS_INTRO, TERMS_SECTIONS } from "@/content/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service — OpenCharterApp" }] }),
  component: () => (
    <LegalPage
      title="Terms of service"
      updated={LEGAL_UPDATED}
      placeholder={LEGAL_PLACEHOLDER}
      intro={TERMS_INTRO}
      sections={TERMS_SECTIONS}
    />
  ),
});
