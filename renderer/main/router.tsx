import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { HomeView } from "./home-view";
import { RootView } from "./root-view";
import { QueryClient } from "@tanstack/react-query";

function RouteError({ error }: { error: Error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <p>{error.message}</p>
    </div>
  );
}

const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootView,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <p>Route not found</p>
    </div>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeView,
  staticData: {
    title: "Home",
  },
});

const routeTree = rootRoute.addChildren([homeRoute]);

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  history: createMemoryHistory(),
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  context: {
    queryClient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    title?: string;
    component?: unknown;
  }
}

export { router, queryClient };
