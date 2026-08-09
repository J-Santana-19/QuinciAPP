import { cp, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(projectRoot, "dist");
const generatedEntries = await readdir(dist, { withFileTypes: true });

for (const legacyFile of ["app.js", "manifest.json"]) {
  await rm(join(projectRoot, legacyFile), { force: true });
}

for (const entry of generatedEntries) {
  const destination = join(projectRoot, entry.name);
  if (entry.isDirectory()) await rm(destination, { recursive: true, force: true });
  else await rm(destination, { force: true });
  await cp(join(dist, entry.name), destination, { recursive: true });
}

await writeFile(join(projectRoot, ".nojekyll"), "", "utf8");
console.log("Publicación estática copiada a la raíz del proyecto.");
