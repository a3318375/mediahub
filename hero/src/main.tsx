import { HeroUISmoke } from "./components/ui/HeroUISmoke";
import { Toast } from "@heroui/react";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./layouts/MediaApp";
import "./styles/base.css";
import "./styles/media.css";
import "./components/ui/AppControls.css";
import "./styles/focus.css";
const Template = lazy(() => import("./mocks/dashboard-template"));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toast.Provider />
    {new URLSearchParams(window.location.search).get("herouiSmoke") === "1" && <HeroUISmoke />}
    {new URLSearchParams(window.location.search).get("template") ===
    "dashboard" ? (
      <Suspense fallback={<p>正在加载演示…</p>}>
        <Template />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
