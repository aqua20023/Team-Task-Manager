import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const viteEntry = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url)
);

const processes = [
  spawn(process.execPath, ["--no-warnings", "server/index.js"], {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT || "5000" }
  }),
  spawn(process.execPath, [viteEntry, "--config", "client/vite.config.js"], {
    stdio: "inherit"
  })
];

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
}
