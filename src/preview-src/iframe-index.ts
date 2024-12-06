// @ts-ignore
import { activate, initialize } from "react-devtools-inline/backend";

// The DevTools hook needs to be installed before React is even required!
// The safest way to do this is probably to install it in a separate script tag.
initialize(window);

// Wait for the frontend to let us know that it's ready.
function onMessage({ data }: MessageEvent) {
  switch (data.type) {
    case "activate-backend":
      window.removeEventListener("message", onMessage);

      activate(window);
      break;
    default:
      break;
  }
}

window.addEventListener("message", onMessage);