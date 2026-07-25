import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const target = process.argv[2] === "users" ? "users" : "main";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

const originalPackageText = await readFile(packagePath, "utf8");
const pkg = JSON.parse(originalPackageText);

const metadata = target === "users"
  ? {
      name: "zabota-cargo-users",
      productName: "Zabota Cargo Пользователи",
      description: "Управление сотрудниками Zabota Cargo",
    }
  : {
      name: "zabota-cargo",
      productName: "Zabota Cargo",
      description: "Рабочий кабинет карго-точки Zabota Cargo",
    };

try {
  await writeFile(packagePath, `${JSON.stringify({ ...pkg, ...metadata }, null, 2)}\n`, "utf8");
  await run("npm.cmd", ["run", "build:web"]);
  const builderArgs = target === "users"
    ? ["electron-builder", "--config", "electron-builder-users.json", "--win", "nsis", "--x64"]
    : ["electron-builder", "--win", "nsis", "--x64"];
  await run("npx.cmd", builderArgs);
} finally {
  await writeFile(packagePath, originalPackageText, "utf8");
}
