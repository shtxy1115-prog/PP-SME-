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

test("TOB 福利描述使用可读 OPPOSans 字体并为长文本预留自动换行高度", () => {
  assert.match(app, /const MAX_EXCEL_ROW_HEIGHT_PT = 409\.5/);
  assert.match(app, /Math\.min\(isTob \? MAX_EXCEL_ROW_HEIGHT_PT : 170/);
  const helperStart = app.indexOf("const WORKBOOK_COLORS");
  const helperEnd = app.indexOf("function applyWorksheetPrintXml", helperStart);
  const buildStylesXml = new Function(`${app.slice(helperStart, helperEnd)}; return buildStylesXml;`)();
  const stylesXml = buildStylesXml();
  assert.match(stylesXml, /<font><b\/><sz val="11"\/><color rgb="FF3966CA"\/><name val="OPPOSans R"\/><family val="3"\/><charset val="134"\/><\/font>/);
  assert.match(stylesXml, /<font><sz val="11"\/><color rgb="FF18324A"\/><name val="OPPOSans R"\/><family val="3"\/><charset val="134"\/><\/font>/);
  assert.match(stylesXml, /<alignment horizontal="left" vertical="top" wrapText="1"\/>/);

  const rowStart = app.indexOf("function mergedColumnWidth");
  const rowEnd = app.indexOf("const WORKBOOK_COLORS", rowStart);
  const rowHeight = new Function(`
    const columnIndexFromName = name => Array.from(name).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
    ${app.slice(rowStart, rowEnd)}
    return rowHeight;
  `)();
  const longText = "紧急医疗\nEmergency treatment\n\n保险人对在保障地域以外发生的紧急医疗，被保险人在对应保障地域以外地区发生的保险责任范围内的费用也提供保险保障\nThis benefit provides coverage for the medically necessary and reasonable expenses of emergency medical treatments outside the area of coverage";
  const sheet = {
    name: "保险责任TOB",
    widths: [34.796875, 48.19921875, 22.796875, 24.796875],
    merges: ["A1:B1"],
    rowStyles: ["body"],
  };
  assert.ok(rowHeight([longText, ""], sheet, 0) >= 130, "长福利描述的 TOB 行高不足以容纳自动换行后的中英文内容");
});

test("TOB 合并单元格为长中英文描述插入显式换行，避免 Excel 截断", () => {
  const helperStart = app.indexOf("function mergedColumnWidth");
  const helperEnd = app.indexOf("const WORKBOOK_COLORS", helperStart);
  const helpers = new Function(`
    const columnIndexFromName = name => Array.from(name).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
    ${app.slice(helperStart, helperEnd)}
    return { prepareDisplaySheet, rowHeight };
  `)();
  const nl = String.fromCharCode(10);
  const policyText = [
    "自付比例",
    "Policy Co-payment",
    "",
    "自付比例指的是被保险人发生保险责任内费用先扣除免赔额（如有）后由被保险人承担的比例",
    "The policy co-payment is a fixed percentage of covered medical expenses the member will pay for treatment. The policy co-payment applies after the deductible is met",
  ].join(nl);
  const outOfPocketText = [
    "自付限额",
    "Out-of-Pocket Maximum",
    "",
    "保险期间内，被保险人根据自付比例（非0%），按前述比例承担的保险责任内费用上限。自付额上限仅适用自付比例的费用累计",
    "The out-of-pocket maximum is the amount of covered medical expenses the member will pay in Policy Co-payment during the Policy Period before any benefits are paid in full under the policy. The out-of-pocket maximum only applies to policy co-payment",
  ].join(nl);
  const sheet = {
    name: "保险责任TOB",
    rows: [[policyText, "", "标准自付比例 0%。\nStandard co-payment 0%."], [outOfPocketText, "", "无\nNo Maximum"]],
    rowStyles: ["body", "body"],
    widths: [34.796875, 48.19921875, 22.796875, 24.796875],
    merges: ["A1:B1", "C1:D1", "A2:B2", "C2:D2"],
  };
  const displaySheet = helpers.prepareDisplaySheet(sheet);
  const displayedPolicy = displaySheet.rows[0][0];
  const displayedOutOfPocket = displaySheet.rows[1][0];

  assert.ok(displayedPolicy.split(nl).length > policyText.split(nl).length, "自付比例英文描述没有被显式分行");
  assert.ok(displayedOutOfPocket.split(nl).length > outOfPocketText.split(nl).length, "自付限额英文描述没有被显式分行");
  assert.equal(displayedPolicy.replaceAll(nl, ""), policyText.replaceAll(nl, ""), "自付比例描述被换行逻辑改写或丢字");
  assert.equal(displayedOutOfPocket.replaceAll(nl, ""), outOfPocketText.replaceAll(nl, ""), "自付限额描述被换行逻辑改写或丢字");
  assert.ok(helpers.rowHeight(displaySheet.rows[0], displaySheet, 0) >= 130, "自付比例显示行高不足");
  assert.ok(helpers.rowHeight(displaySheet.rows[1], displaySheet, 1) >= 170, "自付限额显示行高不足");
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
    assert.match(styled, new RegExp(`<c\\b[^>]*r="${ref}"[^>]*\\bs="14"`), `${ref} 未继承 TOB 表头边框样式`);
  });
});

test("Proposal 导出中的金额单元格使用金额格式，年龄仍保持整数", () => {
  const helperStart = app.indexOf("function isCurrencyCell");
  const helperEnd = app.indexOf("function applyWorksheetPrintLayout", helperStart);
  const isCurrencyCell = new Function(`${app.slice(helperStart, helperEnd)}; return isCurrencyCell;`)();
  const quotation = {
    name: "报价 Quotation",
    rows: [
      ["报价保费汇总 / Premium Summary"],
      ["保费项目 / Premium Item", "方案 1", "方案 2"],
      ["医疗保费 / Medical Premium", 1000, 2000],
      ["最终保费 Total Premium", 1000, 2000],
      ["人员保费明细 Member Premium Details"],
      ["人员 / Member", "人员类型 / Type", "年龄 / Age", "方案 1 医疗保费", "方案 2 医疗保费"],
      ["1 · E1", "员工", 40, 1000, 2000],
    ],
  };
  assert.equal(isCurrencyCell(quotation, 2, 1000, 1), true);
  assert.equal(isCurrencyCell(quotation, 2, 2000, 2), true);
  assert.equal(isCurrencyCell(quotation, 6, 40, 2), false);
  assert.equal(isCurrencyCell(quotation, 6, 1000, 3), true);
});

test("空英文名称单元格保留 Quotation 模板底色", () => {
  const helperStart = app.indexOf("function mergedColumnWidth");
  const helperEnd = app.indexOf("async function styleWorkbookBytes", helperStart);
  const styleWorksheetXml = new Function(`${app.slice(helperStart, helperEnd)}; return styleWorksheetXml;`)();
  const sheet = {
    name: "报价 Quotation",
    rows: [[], ["中文名称", "测试公司", "英文名称", "", "", "", "", ""]],
    rowStyles: ["title", "meta"],
    merges: ["D2:H2"],
  };
  const cells = ["D2", "E2", "F2", "G2", "H2"].map(ref => `<c r="${ref}"/>`).join("");
  const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H2"/><sheetData><row r="2"><c r="A2"/><c r="B2"/><c r="C2"/>${cells}</row></sheetData></worksheet>`;
  const styled = styleWorksheetXml(xml, sheet);
  ["D2", "E2", "F2", "G2", "H2"].forEach(ref => {
    const cell = styled.match(new RegExp(`<c\\b[^>]*r="${ref}"[^>]*>`))?.[0] || "";
    assert.match(cell, /s="5"/, `${ref} 空白英文名区域未应用模板值单元格底色`);
  });
});

test("TOB 纵向共享限额合并区按完整宽度换行并继承边框", () => {
  const helperStart = app.indexOf("function mergedColumnWidth");
  const helperEnd = app.indexOf("const WORKBOOK_COLORS", helperStart);
  const rowHelpers = new Function(`
    const columnIndexFromName = name => Array.from(name).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
    ${app.slice(helperStart, helperEnd)}
    return mergedColumnWidth;
  `)();
  const sheet = {
    name: "保险责任TOB",
    rows: [[], ["理疗", "", "限额", ""], ["中医", "", "", ""], ["中草药", "", "", ""]],
    widths: [34.796875, 48.19921875, 22.796875, 24.796875],
    merges: ["A2:B2", "A3:B3", "A4:B4", "C2:D4"],
  };
  const mergedWidth = 22.796875 + 24.796875;
  [1, 2, 3].forEach(rowIndex => {
    assert.equal(rowHelpers(sheet, rowIndex, 2), mergedWidth);
    assert.equal(rowHelpers(sheet, rowIndex, 3), mergedWidth);
  });

  const styleStart = app.indexOf("function mergedColumnWidth");
  const styleEnd = app.indexOf("async function styleWorkbookBytes", styleStart);
  const styleWorksheetXml = new Function(`${app.slice(styleStart, styleEnd)}; return styleWorksheetXml;`)();
  const xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D4"/><sheetData><row r="2"><c r="A2"/><c r="B2"/><c r="C2"/><c r="D2"/></row><row r="3"><c r="A3"/><c r="B3"/><c r="C3"/><c r="D3"/></row><row r="4"><c r="A4"/><c r="B4"/><c r="C4"/><c r="D4"/></row></sheetData></worksheet>';
  const styled = styleWorksheetXml(xml, { ...sheet, rowStyles: ["title", "body", "body", "body"] });
  ["C2", "D2", "C3", "D3", "C4", "D4"].forEach(ref => {
    const cell = styled.match(new RegExp(`<c\\b[^>]*r="${ref}"[^>]*>`))?.[0] || "";
    assert.match(cell, /s="19"/, `${ref} 未继承纵向合并区域的 TOB 责任单元格样式`);
  });
});

test("临终关怀描述的福利名称格沿用精神心理障碍标题格式", () => {
  const helperStart = app.indexOf("function mergedColumnWidth");
  const helperEnd = app.indexOf("async function styleWorkbookBytes", helperStart);
  const styleWorksheetXml = new Function(`${app.slice(helperStart, helperEnd)}; return styleWorksheetXml;`)();
  const sheet = {
    name: "保险责任TOB",
    rows: [[], ["临终关怀费\nHospice Care", "", "", ""]],
    rowStyles: ["title", "benefitHeading"],
    merges: ["A2:B2", "C2:D2"],
  };
  const xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D2"/><sheetData><row r="2"><c r="A2"/><c r="B2"/><c r="C2"/><c r="D2"/></row></sheetData></worksheet>';
  const styled = styleWorksheetXml(xml, sheet);
  ["A2", "B2"].forEach(ref => {
    const cell = styled.match(new RegExp(`<c\\b[^>]*r="${ref}"[^>]*>`))?.[0] || "";
    assert.match(cell, /s="15"/, `${ref} 未使用 Mental Health 标题样式`);
  });
  ["C2", "D2"].forEach(ref => {
    const cell = styled.match(new RegExp(`<c\\b[^>]*r="${ref}"[^>]*>`))?.[0] || "";
    assert.match(cell, /s="19"/, `${ref} 的赔付责任内容不应误用标题样式`);
  });
});
