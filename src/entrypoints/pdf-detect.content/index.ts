import { defineContentScript } from "wxt/utils/define-content-script";
import { startPdfEmbedWatcher } from "../../content/pdf-embeds";
import "./style.css";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*", "file://*/*"],
  runAt: "document_start",
  allFrames: true,
  main: startPdfEmbedWatcher,
});
