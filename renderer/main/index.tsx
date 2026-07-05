import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router, queryClient } from "./router";
import "../styles.css";
import { QueryClientProvider } from "@tanstack/react-query";

declare const __APP_DISPLAY_NAME__: string | undefined;

document.title = __APP_DISPLAY_NAME__ || document.title;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept();
}
