import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import {
  LEGAL_EFFECTIVE,
  LEGAL_OPERATOR,
  LEGAL_PLACEHOLDER,
  LEGAL_UPDATED,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
} from "@/content/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy — OpenCharterApp" }] }),
  component: () => (
    <LegalPage
      title="Privacy policy"
      effective={LEGAL_EFFECTIVE}
      updated={LEGAL_UPDATED}
      operator={LEGAL_OPERATOR}
      placeholder={LEGAL_PLACEHOLDER}
      intro={PRIVACY_INTRO}
      sections={PRIVACY_SECTIONS}
    />
  ),
});
