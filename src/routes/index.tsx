import { createFileRoute, redirect } from "@tanstack/react-router";

// No landing page: everyone arrives through OpenAppHub (hosted) or the sign-in page
// (self-hosted). "/" opens the dashboard; its sign-in check sends signed-out visitors to /auth.
// Public join pages (/join/<slug>) are unchanged.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
