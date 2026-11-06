import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import {
  LEGAL_EFFECTIVE,
  LEGAL_OPERATOR,
  LEGAL_PLACEHOLDER,
  LEGAL_UPDATED,
  TERMS_INTRO,
  TERMS_SECTIONS,
} from "@/content/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service — OpenCharterApp" }] }),
  component: () => (
    <LegalPage
      title="Terms of service"
      effective={LEGAL_EFFECTIVE}
      updated={LEGAL_UPDATED}
      operator={LEGAL_OPERATOR}
      placeholder={LEGAL_PLACEHOLDER}
      intro={TERMS_INTRO}
      sections={TERMS_SECTIONS}
    />
  ),
});
