import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const source = join(process.cwd(), ".openai", "hosting.json");
const target = join(process.cwd(), "dist", ".openai", "hosting.json");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
