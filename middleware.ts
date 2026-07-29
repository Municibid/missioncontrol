import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT the ones below.
     *
     * Exempt from Google OAuth:
     * - api/auth       — auth endpoints themselves
     * - api/telemetry  — agent writes; protected by AGENT_API_TOKEN bearer instead
     *                    (agents run headless and can't complete an OAuth flow)
     * - api/cron       — agent run reporting + public read of the schedule
     * - api/tasks      — heartbeat integration (pre-existing)
     * - api/activity   — activity feed (pre-existing)
     * - api/agents     — agent runtime state read by the dashboard shell
     * - api/models     — model registry + spend
     * - api/versions   — version history
     * - auth           — sign-in pages
     * - _next/static, _next/image, favicon.ico — static assets
     */
    "/((?!api/auth|api/telemetry|api/cron|api/tasks|api/activity|api/agents|api/models|api/versions|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
