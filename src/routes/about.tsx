import { createFileRoute, Link } from "@tanstack/react-router";
import { AboutLicenses } from "@shared/ui/About";

// About and open-source licenses (SHARED-SPEC §10.3): the services the suite uses and every
// package OpenCharterApp ships, from public/third-party.json (shared/licenses/generate.mjs).
export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About and open-source licenses — OpenCharterApp" },
      {
        name: "description",
        content:
          "The services OpenCharterApp uses and the open-source software it's built on, with each license.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        OpenCharterApp
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">About and open-source licenses</h1>
      <div className="mt-6">
        <AboutLicenses appName="OpenCharterApp" />
      </div>
    </main>
  );
}
