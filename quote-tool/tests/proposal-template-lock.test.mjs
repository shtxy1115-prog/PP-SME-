import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../core.js");
const JSZip = require("../vendor/jszip.min.js");
const { lockToProposalTemplate, FROZEN_SHEET_PATHS } = require("../template-lock.js");
const here = dirname(fileURLToPath(import.meta.url));
const templatePath = "/Users/doristao/Documents/PP SME/PP SME  Proposal 模板.xlsx";
const embeddedSource = readFileSync(join(here, "../proposal-template-static.js"), "utf8");
const embeddedTemplate = embeddedSource.match(/BASE64 = "([^"]+)"/)[1];

test("四张固定 Proposal 页只标记为模板锁定页，不再由报价模型重绘", () => {
  const frozenNames = [
    "昂贵医院 List of HCPs",
    "预授权 Pre-auth",
    "重大既往症 Catastrophic PEC",
    "参保条件 Eligibility",
  ];
  const sheets = core.buildWorkbookModel({ variants: [] }).sheets;
  assert.deepEqual(sheets.slice(3).map(sheet => sheet.name), frozenNames);
  assert.equal(sheets.slice(3).every(sheet => sheet.frozenTemplate === true), true);
});

test("锁定导出保留四张模板页的原始 XML", async () => {
  const templateBytes = readFileSync(templatePath);
  const lockedBytes = await lockToProposalTemplate(templateBytes, { JSZip, templateBase64: embeddedTemplate });
  const [sourceZip, lockedZip] = await Promise.all([JSZip.loadAsync(templateBytes), JSZip.loadAsync(lockedBytes)]);
  for (const path of FROZEN_SHEET_PATHS) {
    assert.equal(await lockedZip.file(path).async("string"), await sourceZip.file(path).async("string"), `${path} must remain byte-for-byte identical`);
  }
});
