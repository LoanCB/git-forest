// tauri-stubs MUST be first — it sets window.__TAURI_INTERNALS__ before
// any other module that might call into the Tauri SDK.
import "./tauri-stubs";
import "../index.css";
import "@/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
