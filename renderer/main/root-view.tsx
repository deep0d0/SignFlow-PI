import { Outlet } from "@tanstack/react-router";

export function RootView() {
  return (
    <div className="h-full w-full">
      <Outlet />
    </div>
  );
}
