import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(sourceDir, "index.html");
const styles = await readFile(resolve(sourceDir, "styles.css"), "utf8");
const core = await readFile(resolve(sourceDir, "core.js"), "utf8");
const app = await readFile(resolve(sourceDir, "app.js"), "utf8");
const xlsx = await readFile(resolve(sourceDir, "vendor/xlsx.full.min.js"), "utf8");
const jszip = await readFile(resolve(sourceDir, "vendor/jszip.min.js"), "utf8");
let html = await readFile(indexPath, "utf8");

const inlineScript = content => content.replace(/<\/script/gi, "<\\/script");
const replaceOnce = (source, marker, replacement) => source.replace(marker, () => replacement);
html = replaceOnce(html, '<link rel="stylesheet" href="styles.css">', `<style>\n${styles}\n</style>`);
html = replaceOnce(html, '<script src="vendor/xlsx.full.min.js"></script>', `<script>\n${inlineScript(xlsx)}\n</script>`);
html = replaceOnce(html, '<script src="vendor/jszip.min.js"></script>', `<script>\n${inlineScript(jszip)}\n</script>`);
html = replaceOnce(html, '<script src="core.js"></script>', `<script>\n${inlineScript(core)}\n</script>`);
html = replaceOnce(html, '<script src="app.js"></script>', `<script>\n${inlineScript(app)}\n</script>`);

const sourceTagPattern = /(?:^|\n)\s*<(?:link rel="stylesheet" href="styles\.css"|script src="(?:vendor\/xlsx\.full\.min\.js|vendor\/jszip\.min\.js|core\.js|app\.js)")/;
if (sourceTagPattern.test(html)) {
  throw new Error("Standalone build still contains a local dependency reference");
}
if (/<(?:script|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) throw new Error("Standalone build contains an external URL");

const outputPath = resolve(sourceDir, "dist/PP_Prosper_SME_报价器_Core_Reliability_v4.html");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `<!-- PP & Prosper SME Core Reliability v4 · offline standalone -->\n${html}`, "utf8");
console.log(`Built ${outputPath}`);
