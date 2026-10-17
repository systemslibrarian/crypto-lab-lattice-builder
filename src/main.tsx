import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import BeaconRun from "./BeaconRun";
import "./styles.css";

// Keep existing lesson and shared Basis Match URLs working. New visits launch
// the compact game; the original exhibit remains a deliberate second step.
const params = new URLSearchParams(location.search);
const classic = params.get('mode') === 'classic' || params.has('basis') ||
  /^#(?:game|signal-game|vector-flight|basis-match|advanced|expert|behind-the-puzzle)$/.test(location.hash);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {classic ? <App /> : <BeaconRun />}
  </StrictMode>,
);
