import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const app = readFileSync(new URL("app.js", root), "utf8");
const styles = readFileSync(new URL("styles.css", root), "utf8");

test("页面采用工作台式层级与可见的选中反馈", () => {
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="intro-section"/);
  assert.match(html, /class="step-nav"/);
  assert.match(html, /href="#company"/);
  assert.match(html, /href="#plans"/);
  assert.match(html, /href="#people"/);
  assert.match(html, /href="#results"/);
  assert.match(html, /id="downloadSection"/);
  assert.match(app, /downloadButtonBottom/);
  assert.match(app, /navy:\s*"143B72"/);
  assert.match(app, /blue:\s*"3966CA"/);
  assert.match(app, /ink:\s*"18324A"/);
  assert.match(app, /line:\s*"D5DFEB"/);
  assert.match(styles, /\.option-card:has\(input:checked\)/);
  assert.match(styles, /\.medical-plan:has\(input:checked\)/);
  assert.match(styles, /\.people-table-wrap\s*\{[^}]*height:/);
});

test("第一部分只提供全局核心选项，不展开报价方案卡片", () => {
  const firstSection = html.match(/<section class="card content-section" id="company">[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(firstSection, /id="pcpDirectBilling"/);
  assert.match(firstSection, /id="coreOptions"/);
  assert.ok(firstSection.indexOf("id=\"coreOptions\"") > firstSection.indexOf("id=\"pcpDirectBilling\""));
  assert.doesNotMatch(firstSection, /core-condition-panel|P3WWE|P4WW|P4WWE/);
  assert.doesNotMatch(app, /renderCoreConditions|coreConditions|core-condition-panel/);

  const renderCoreOptionsIndex = app.indexOf("function renderCoreOptions()");
  const renderOptionsIndex = app.indexOf("function renderOptions()");
  const updateIndex = app.indexOf("function update()");
  const updateBody = app.slice(updateIndex, app.indexOf("function addPerson()", updateIndex));
  assert.ok(renderCoreOptionsIndex >= 0);
  assert.ok(renderCoreOptionsIndex < renderOptionsIndex);
  assert.match(updateBody, /renderCoreOptions\(\);\s*renderOptions\(\);/);

  const renderCoreOptionsEnd = app.indexOf("function renderOptions", renderCoreOptionsIndex);
  const renderCoreOptions = app.slice(renderCoreOptionsIndex, renderCoreOptionsEnd);
  assert.match(renderCoreOptions, /outpatientFromSixth20/);
  assert.match(renderCoreOptions, /fmuPreExisting/);
  assert.match(renderCoreOptions, /type = "checkbox"/);
  assert.doesNotMatch(renderCoreOptions, /selectedPlans\(\)|selectedVariantsForPlan\(\)/);
});

test("核心选项统一同步到所有报价变体并持久化", () => {
  assert.match(app, /let copayOption = "none"/);
  assert.match(app, /let preExistingOption = "standard"/);
  assert.match(app, /preExistingOption,\s*copayOption/);
  assert.match(app, /variant\.copay = copayOption/);
  assert.match(app, /variant\.preExisting = preExistingOption/);
  assert.match(app, /function applyGlobalCoreOptions\(\)/);
});

test("PCP 首诊直付选项显示正式的 3% Medical 折扣", () => {
  const pcpOption = html.match(/id="pcpDirectBilling"[\s\S]*?<\/label>/)?.[0] || "";
  assert.match(pcpOption, /医疗保费下调 3%/);
  assert.doesNotMatch(pcpOption, /医疗保费下调 6%/);
});

test("第二部分不再重复渲染既往症和自付比例控件", () => {
  const renderOptionsStart = app.indexOf("function renderOptions()");
  const renderOptionsEnd = app.indexOf("function addSummaryMetric", renderOptionsStart);
  const renderOptions = app.slice(renderOptionsStart, renderOptionsEnd);
  assert.doesNotMatch(renderOptions, /core\.PRE_EXISTING_OPTIONS/);
  assert.doesNotMatch(renderOptions, /core\.COPAY_OPTIONS/);
});

test("Excel 导出设置页面适配，避免 Quotation/Premium 横向分页", () => {
  assert.match(app, /function applyWorksheetPrintLayout\(worksheet, sheet\)/);
  assert.match(app, /fitToWidth:\s*1/);
  assert.match(app, /fitToPage\s*=\s*\"1\"/);
  assert.match(app, /landscape/);
  assert.match(app, /left:\s*0\.25/);
  assert.match(app, /sheet\.name\.includes\("TOB"\)/);
  assert.match(app, /Math\.max\(56, computed\)/);

  const helperStart = app.indexOf("function applyWorksheetPrintXml");
  const helperEnd = app.indexOf("function styleWorksheetXml", helperStart);
  const applyWorksheetPrintXml = new Function(`${app.slice(helperStart, helperEnd)}; return applyWorksheetPrintXml;`)();
  const baseXml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D1"/><sheetData/></worksheet>';
  const quotationXml = applyWorksheetPrintXml(baseXml, { name: "报价 Quotation" });
  assert.match(quotationXml, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
  assert.match(quotationXml, /<sheetViews><sheetView showGridLines="0" workbookViewId="0"\/><\/sheetViews>/);
  assert.match(quotationXml, /<pageMargins left="0\.25"[^>]*\/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"\/>/);
  const listXml = applyWorksheetPrintXml(baseXml, { name: "昂贵医院 List of HCPs" });
  assert.match(listXml, /<pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0" paperSize="9"\/>/);

  const xmlWithIgnoredErrors = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D1"/><sheetData/><ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:D1"/></ignoredErrors></worksheet>';
  const orderedXml = applyWorksheetPrintXml(xmlWithIgnoredErrors, { name: "报价 Quotation" });
  assert.ok(orderedXml.indexOf("<pageMargins") < orderedXml.indexOf("<pageSetup"));
  assert.ok(orderedXml.indexOf("<pageSetup") < orderedXml.indexOf("<ignoredErrors"));
});

test("Excel 样式字体和边框遵循 OOXML 子节点顺序，避免整份 styles.xml 被删除", () => {
  const helperStart = app.indexOf("const WORKBOOK_COLORS");
  const helperEnd = app.indexOf("function applyWorksheetPrintXml", helperStart);
  const buildStylesXml = new Function(`${app.slice(helperStart, helperEnd)}; return buildStylesXml;`)();
  const stylesXml = buildStylesXml();
  assert.match(stylesXml, /<font><b\/><sz val="15"\/><color rgb="FFFFFFFF"\/><name val="OPPOSans R"\/><family val="3"\/><charset val="134"\/><\/font>/);
  assert.doesNotMatch(stylesXml, /<font><name val="Aptos Display"\/>/);
  assert.match(stylesXml, /<fill><patternFill patternType="solid"><fgColor rgb="FF143B72"/);
  const bordersXml = stylesXml.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)?.[1] || "";
  const borders = Array.from(bordersXml.matchAll(/<border>([\s\S]*?)<\/border>/g), match => match[1]);

  assert.ok(borders.length > 0);
  borders.forEach((borderXml, index) => {
    const childPositions = ["left", "right", "top", "bottom", "diagonal"].map(tag => borderXml.indexOf(`<${tag}`));
    assert.ok(childPositions.every(position => position >= 0), `border ${index} 缺少标准子节点`);
    assert.deepEqual(childPositions, [...childPositions].sort((left, right) => left - right), `border ${index} 子节点顺序无效`);
  });
});

test("TOB 动态样式使用可显示中文的 Proposal 字体", () => {
  const helperStart = app.indexOf("const WORKBOOK_COLORS");
  const helperEnd = app.indexOf("function applyWorksheetPrintXml", helperStart);
  const buildStylesXml = new Function(`${app.slice(helperStart, helperEnd)}; return buildStylesXml;`)();
  const stylesXml = buildStylesXml();

  assert.match(stylesXml, /<font><b\/><sz val="15"\/><color rgb="FFFFFFFF"\/><name val="OPPOSans R"\/><family val="3"\/><charset val="134"\/><\/font>/);
  assert.match(stylesXml, /<font><sz val="10"\/><color rgb="FF18324A"\/><name val="OPPOSans R"\/><family val="3"\/><charset val="134"\/><\/font>/);
  assert.doesNotMatch(stylesXml, /<name val="Aptos"\/>/);
});

test("TOB 合并区域内的空白单元格也必须继承同一边框样式", () => {
  const helperStart = app.indexOf("function mergedColumnWidth");
  const helperEnd = app.indexOf("async function styleWorkbookBytes", helperStart);
  const styleWorksheetXml = new Function(`${app.slice(helperStart, helperEnd)}; return styleWorksheetXml;`)();
  const sheet = {
    name: "保险责任TOB",
    rows: [[], ["福利责任 Benefit", "", "赔付限额/责任 Coverage and Limit", "", "赔付限额/责任 Coverage and Limit", ""]],
    rowStyles: ["title", "header"],
    merges: ["A2:B2", "C2:D2", "E2:F2"],
  };
  const xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F2"/><sheetData><row r="2"><c r="A2" t="str"><v>福利责任 Benefit</v></c><c r="B2"/><c r="C2" t="str"><v>赔付限额/责任 Coverage and Limit</v></c><c r="D2"/><c r="E2" t="str"><v>赔付限额/责任 Coverage and Limit</v></c><c r="F2"/></row></sheetData></worksheet>';
  const styled = styleWorksheetXml(xml, sheet);

  ["A2", "B2", "C2", "D2", "E2", "F2"].forEach(ref => {
    assert.match(styled, new RegExp(`<c\\b[^>]*r="${ref}"[^>]*\\bs="2"`), `${ref} 未继承 TOB 表头边框样式`);
  });
});

test("Proposal 导出中的金额单元格使用金额格式，年龄仍保持整数", () => {
  const helperStart = app.indexOf("function isCurrencyCell");
  const helperEnd = app.indexOf("function applyWorksheetPrintLayout", helperStart);
  const isCurrencyCell = new Function(`${app.slice(helperStart, helperEnd)}; return isCurrencyCell;`)();
  const quotation = {
    name: "报价 Quotation",
    rows: [
      [], [], [], [], [],
      ["医疗保费 / Medical Premium", 1000, "可选生育福利保费", 2000],
      [], [], [], [], [],
      ["1 · E1", "员工", 40, 1000, 2000],
    ],
  };
  assert.equal(isCurrencyCell(quotation, 5, 1000, 1), true);
  assert.equal(isCurrencyCell(quotation, 5, 2000, 3), true);
  assert.equal(isCurrencyCell(quotation, 11, 40, 2), false);
  assert.equal(isCurrencyCell(quotation, 11, 1000, 3), true);
});
