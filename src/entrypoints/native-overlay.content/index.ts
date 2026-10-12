import { defineContentScript } from "wxt/utils/define-content-script";
import { startNativeOverlay } from "../../content/native-overlay";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*", "file://*/*"],
  runAt: "document_start",
  allFrames: true,
  main: startNativeOverlay,
});
