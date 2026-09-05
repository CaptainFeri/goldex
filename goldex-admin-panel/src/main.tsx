import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./auth/auth";
import { NotifyProvider } from "./notifications/NotifyProvider";
import "./lib/chart";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotifyProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NotifyProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
