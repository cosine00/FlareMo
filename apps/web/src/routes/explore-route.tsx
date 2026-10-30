import { createRoute } from "@tanstack/react-router";
import { ExplorePage } from "@/pages/explore-page";
import { rootRoute } from "@/routes/root-route";

/**
 * The public timeline. Deliberately outside `AuthenticatedRoute`: this is the
 * page an anonymous visitor lands on, so it must never bounce to /login.
 */
export const exploreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/explore",
  component: ExplorePage,
});
