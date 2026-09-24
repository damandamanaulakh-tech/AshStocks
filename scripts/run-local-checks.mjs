import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Execute the existing package scripts with this Node runtime when npm is not
// installed. No shell, downloads, lifecycle hooks or extra commands are added.
const root = fileURLToPath(new URL("../", import.meta.url));
const { scripts } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const name = process.argv[2] || "check";
const allowed = new Set(["check", "guard", "test:mongo-memory", "test:paper-flow", "test:live-release", "test:institutional", "test:rotation", "test:valuation", "test:official-market"]);
if (!allowed.has(name)) throw new Error(`Unsupported local check: ${name}`);

function expand(script, stack = []) {
  if (stack.includes(script) || !scripts[script]) throw new Error(`Invalid package script: ${script}`);
  return scripts[script].split(" && ").flatMap((command) => {
    const args = command.trim().split(/\s+/);
    if (args[0] === "npm" && args[1] === "run" && args.length === 3 && allowed.has(args[2])) return expand(args[2], [...stack, script]);
    if (args[0] !== "node" || args.slice(1).some((arg) => !/^[A-Za-z0-9_./:-]+$/.test(arg))) throw new Error(`Unsupported command in ${script}: ${command}`);
    return [args.slice(1)];
  });
}
const commands = expand(name);
for (const [index, args] of commands.entries()) {
  console.log(`[${index + 1}/${commands.length}] node ${args.join(" ")}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (status, signal) => resolve(signal ? 1 : status ?? 1));
  });
  if (code !== 0) process.exit(code);
}
console.log(`Local package-script check passed: ${name}, ${commands.length} commands.`);
