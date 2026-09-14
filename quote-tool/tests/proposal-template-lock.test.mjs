import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../core.js");
const JSZip = require("../vendor/jszip.min.js");
const XLSX = require("../vendor/xlsx.full.min.js");
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

test("锁定导出兼容动态工作簿缺少 sharedStrings.xml 的正常场景", async () => {
  const workbook = XLSX.utils.book_new();
  for (const name of ["报价", "费率", "福利"]) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[`${name} 动态内容`], [123]]), name);
  }
  const generatedBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
  const generatedZip = await JSZip.loadAsync(generatedBytes);
  assert.equal(generatedZip.file("xl/sharedStrings.xml"), null, "回归场景应保持 SheetJS 的无 sharedStrings 输出");

  const lockedBytes = await lockToProposalTemplate(generatedBytes, { JSZip, templateBase64: embeddedTemplate });
  const [sourceZip, lockedZip] = await Promise.all([JSZip.loadAsync(readFileSync(templatePath)), JSZip.loadAsync(lockedBytes)]);
  assert.match(await lockedZip.file("xl/worksheets/sheet1.xml").async("string"), /报价 动态内容/);
  for (const path of FROZEN_SHEET_PATHS) {
    assert.equal(await lockedZip.file(path).async("string"), await sourceZip.file(path).async("string"), `${path} must remain byte-for-byte identical`);
  }
});

test("锁定导出的 styles.xml 集合 count 与实际子节点一致，避免 Excel 丢弃样式", async () => {
  const workbook = XLSX.utils.book_new();
  for (const name of ["报价", "费率", "福利"]) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[`${name} 动态内容`], [123]]), name);
  }
  const generatedBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
  const lockedBytes = await lockToProposalTemplate(generatedBytes, { JSZip, templateBase64: embeddedTemplate });
  const lockedZip = await JSZip.loadAsync(lockedBytes);
  const stylesXml = await lockedZip.file("xl/styles.xml").async("string");
  for (const [container, child] of [["numFmts", "numFmt"], ["fonts", "font"], ["fills", "fill"], ["borders", "border"], ["cellXfs", "xf"]]) {
    const match = stylesXml.match(new RegExp(`<${container}\\b[^>]*>([\\s\\S]*?)<\\/${container}>`));
    assert.ok(match, `styles.xml must contain ${container}`);
    const declared = Number(match[0].match(/\bcount="(\d+)"/)[1]);
    const actual = (match[1].match(new RegExp(`<${child}\\b`, "g")) || []).length;
    assert.equal(declared, actual, `${container} count must match its direct child count`);
  }
});
