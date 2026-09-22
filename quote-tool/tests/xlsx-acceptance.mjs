import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const core = require("../core.js");
const XLSX = require("../vendor/xlsx.full.min.js");
const JSZip = require("../vendor/jszip.min.js");
const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const styleStart = appSource.indexOf("function mergedColumnWidth");
const styleEnd = appSource.indexOf("async function exportExcel", styleStart);
const windowMock = { JSZip, PPProposalTemplateLock: { lockToProposalTemplate: async bytes => bytes } };
const workbookHelpers = new Function("window", "XLSX", `${appSource.slice(styleStart, styleEnd)}; return { prepareDisplaySheet, applyWorkbookLayout, styleWorkbookBytes };`)(windowMock, XLSX);
const outputPath = join(tmpdir(), "pp-sme-v4-validation.xlsx");

const employee = (id, age, extra = {}) => ({ id, name: id, type: "employee", employeeId: id, age, nature: "new", ...extra });
const variant = (id, planCode, extra = {}) => ({ id, planCode, name: id, maternity: "none", wellness: "none", dental: "none", vision: "none", preExisting: "standard", ...extra });

const fixedCases = [
  {
    name: "65-69 自动报价",
    check() { assert.equal(core.medicalPremiumFor(employee("E65", 65), "P4WW").status, "AUTO_QUOTABLE"); assert.equal(core.medicalPremiumFor(employee("E69", 69), "P4WW").status, "AUTO_QUOTABLE"); },
  },
  {
    name: "70+ 人工路径",
    check() { assert.equal(core.medicalPremiumFor(employee("E70", 70), "P4WW").status, "PENDING_UW"); assert.equal(core.medicalPremiumFor(employee("E70M", 70, { quoteStatus: "MANUAL_RATE", manualMedicalPremium: 120000 }), "P4WW").premium, 120000); },
  },
  {
    name: "儿童年龄边界",
    check() { assert.equal(core.medicalPremiumFor({ id: "C25", type: "child", age: 25 }, "P201").status, "AUTO_QUOTABLE"); assert.equal(core.medicalPremiumFor({ id: "C26", type: "child", age: 26 }, "P201").status, "INELIGIBLE"); },
  },
  {
    name: "Compare/Group 唯一 Plan",
    check() {
      const people = [1, 2, 3, 4, 5, 6].map(index => employee(`E${index}`, 30 + index));
      assert.equal(core.validate({ mode: "group", people, variants: [variant("a", "P201"), variant("b", "P201"), variant("c", "P201")] }).some(message => message.code === "GROUP_PLAN_LIMIT"), false);
      assert.equal(core.validate({ mode: "group", people, variants: [variant("a", "P201"), variant("b", "P101"), variant("c", "P102")] }).some(message => message.code === "GROUP_PLAN_LIMIT"), true);
      assert.equal(core.validate({ mode: "compare", people: people.slice(0, 3), variants: [variant("a", "P201"), variant("b", "P101"), variant("c", "P103")] }).some(message => message.code === "GROUP_PLAN_LIMIT"), false);
    },
  },
  {
    name: "生育/共享责任与 XLSX 结构",
    async check() {
      const people = [1, 2, 3, 4, 5].map(index => employee(`E${index}`, 30 + index));
      const state = {
        companyCn: "测试团体",
        companyEn: "",
        startDate: "2026-08-30",
        endDate: "2027-08-29",
        mode: "compare",
        people,
        variants: [
          variant("maternity", "P201", { maternity: "m30", wellness: "w3000", dental: "d5000", copay: "outpatient_from_sixth_20" }),
          variant("standard", "P4WW"),
        ],
        selectedPlanCodes: ["P201", "P4WW"],
        pcpDirectBilling: false,
      };
      const messages = core.validate(state);
      assert.equal(messages.some(message => message.code === "MATERNITY_THREE_YEAR" && message.level === "WARNING"), true);
      assert.equal(core.BENEFIT_DATA.find(item => item.benefitId === "THERAPY").sharedGroup, "THERAPY_TCM_HERBAL");
      assert.equal(core.BENEFIT_DATA.find(item => item.benefitId === "PREGNANCY_COMPLICATIONS").sharedGroup, null);
      const model = core.buildWorkbookModel(state);
      const quotation = model.sheets.find(sheet => sheet.name === "报价 Quotation");
      assert.equal(quotation.rows[1][0], "团体中文名称 \nCompany Name (Chinese)");
      assert.equal(quotation.rows[1].length, 8);
      assert.ok(quotation.merges.includes("A1:H1"));
      assert.ok(quotation.merges.includes("D2:H2"));
      assert.ok(quotation.merges.includes("A7:H7"));
      assert.ok(quotation.merges.includes("A15:H15"));
      const medicalSummary = quotation.rows.find(row => row[0] === "医疗保费 / Medical Premium");
      assert.equal(typeof medicalSummary[1], "number");
      assert.equal(typeof medicalSummary[2], "number");
      assert.notEqual(medicalSummary[1], medicalSummary[2]);
      for (const label of [
        "可选生育福利保费\nOptional Maternity Benefits Premium",
        "可选体检福利保费\nOptional Wellness Benefits Premium",
        "可选牙科福利保费\nOptional Dental Benefits Premium",
      ]) {
        const optionalRow = quotation.rows.find(row => row[0] === label);
        assert.ok(optionalRow, `${label} is shown because Plan 1 selected it`);
        assert.ok(optionalRow[1] > 0);
        assert.equal(optionalRow[2], "", `${label} is blank for Plan 2, where it was not selected`);
      }
      assert.equal(quotation.rows.some(row => String(row[0]).includes("Optional Vision Benefits Premium")), false);
      const premium = model.sheets.find(sheet => sheet.name === "费率 Premium");
      assert.equal(premium.rows[1].length, 3);
      assert.match(premium.rows[1][1], /P201/);
      assert.match(premium.rows[1][2], /P402/);
      assert.deepEqual(premium.rows.find(row => String(row[0]).includes("年龄段 / Age Band")), [
        "年龄段 / Age Band",
        "医疗保费/\nMedical Premium",
        "医疗保费/\nMedical Premium",
      ]);
      assert.deepEqual(premium.rows.find(row => row[0] === "30-34"), ["30-34", core.adjustedMedicalRateFor(core.rateFor(30, "P201"), state.variants[0], state), core.rateFor(30, "P4WW")]);
      assert.ok(premium.rows.some(row => row[0] === "可选方案费率"));
      assert.ok(premium.rows.some(row => String(row[0]).includes("生育福利 / Maternity Benefits\n方案 1 · P201")));
      assert.ok(premium.rows.some(row => String(row[0]).includes("体检福利 / Wellness Benefits\n方案 1 · P201")));
      assert.ok(premium.rows.some(row => String(row[0]).includes("牙科福利 / Dental Benefits\n方案 1 · P201")));
      assert.equal(premium.rows.some(row => String(row[0]).includes("Vision Benefits")), false);
      const preauth = model.sheets.find(sheet => sheet.name === "预授权 Pre-auth");
      assert.equal(preauth.frozenTemplate, true);
      const tobSource = model.sheets.find(sheet => sheet.name === "保险责任TOB");
      assert.deepEqual(tobSource.widths, [34.796875, 48.19921875, 22.796875, 24.796875, 22.796875, 24.796875]);
      assert.match(tobSource.rows[1][2], /P201/);
      assert.match(tobSource.rows[1][4], /P402/);
      const onlineSourceRow = tobSource.rows.findIndex(row => String(row[0]).startsWith("在线问诊\nOnline Consultations"));
      const hospiceSourceRow = tobSource.rows.findIndex(row => String(row[0]).startsWith("临终关怀费\nHospice Care"));
      const homeNursingRow = tobSource.rows.find(row => String(row[0]).startsWith("家庭护理\nHome Nursing"));
      const influenzaRow = tobSource.rows.find(row => String(row[0]).startsWith("流感疫苗\nInfluenza Vaccine"));
      assert.equal(homeNursingRow[2], "不涵盖\nNot covered");
      assert.equal(homeNursingRow[4], "100天\n100 days");
      assert.equal(influenzaRow[2], "不涵盖\nNot Covered");
      assert.equal(influenzaRow[4], "300元\nCNY 300");
      const workbook = XLSX.utils.book_new();
      const displayModel = { ...model, sheets: model.sheets.map(workbookHelpers.prepareDisplaySheet) };
      displayModel.sheets.forEach(sheet => {
        const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows, { sheetStubs: true });
        workbookHelpers.applyWorkbookLayout(worksheet, sheet);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      });
      const rawBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
      const styledBytes = await workbookHelpers.styleWorkbookBytes(rawBytes, displayModel);
      writeFileSync(outputPath, Buffer.from(styledBytes));
      const outputZip = await JSZip.loadAsync(styledBytes);
      const quotationXml = await outputZip.file("xl/worksheets/sheet1.xml").async("string");
      assert.match(quotationXml, /<c\b[^>]*r="D2"[^>]*\bs="5"/);
      for (const cell of ["D2", "E2", "F2", "G2", "H2"]) {
        assert.match(quotationXml, new RegExp(`<c\\b[^>]*r="${cell}"[^>]*\\bs="5"`), `${cell} must retain the blank English company-name fill`);
      }
      const quotationStyleId = cell => quotationXml.match(new RegExp(`<c\\b[^>]*r="${cell}"[^>]*\\bs="(\\d+)"`))?.[1];
      for (const cell of ["A10", "A11", "A12"]) assert.equal(quotationStyleId(cell), quotationStyleId("A9"), `${cell} must match the Medical Premium label formatting`);
      for (const cell of ["B10", "B11", "B12"]) assert.equal(quotationStyleId(cell), quotationStyleId("B9"), `${cell} must match the Medical Premium amount formatting`);
      const tobXml = await outputZip.file("xl/worksheets/sheet3.xml").async("string");
      assert.match(tobXml, /<mergeCell ref="C\d+:D\d+"/);
      const hospiceRowNumber = hospiceSourceRow + 1;
      assert.match(tobXml, new RegExp(`<mergeCell ref="A${hospiceRowNumber}:F${hospiceRowNumber}"`), "Hospice Care heading must merge across the full multi-plan TOB row");
      const readBack = XLSX.read(readFileSync(outputPath), { type: "buffer", cellStyles: true, sheetStubs: true });
      assert.deepEqual(readBack.SheetNames, ["报价 Quotation", "费率 Premium", "保险责任TOB", "昂贵医院 List of HCPs", "预授权 Pre-auth", "重大既往症 Catastrophic PEC", "参保条件 Eligibility"]);
      const premiumText = XLSX.utils.sheet_to_json(readBack.Sheets["费率 Premium"], { header: 1, raw: false }).flat().join("\n");
      assert.match(premiumText, /P201/);
      const tobText = XLSX.utils.sheet_to_json(readBack.Sheets["保险责任TOB"], { header: 1, raw: false }).flat().join("\n");
      assert.match(tobText, /理疗费/);
      assert.match(tobText, /PREGNANCY_COMPLICATIONS|妊娠并发症/);
      assert.match(tobText, /自付比例指的是被保险人发生保险责任内费用/);
      assert.match(tobText, /特殊检查费/);
      assert.match(tobText, /临终关怀费/);
      const onlineCell = XLSX.utils.encode_cell({ r: onlineSourceRow, c: 2 });
      const onlineReadback = String(readBack.Sheets["保险责任TOB"][onlineCell]?.v ?? "");
      assert.equal(onlineReadback.replace(/\n/g, ""), tobSource.rows[onlineSourceRow][2].replace(/\n/g, ""));
      const onlineHeight = readBack.Sheets["保险责任TOB"]["!rows"][onlineSourceRow].hpt;
      const hospiceHeight = readBack.Sheets["保险责任TOB"]["!rows"][hospiceSourceRow].hpt;
      assert.ok(onlineHeight > 300 && onlineHeight <= 409.5, "Online Consultations coverage must not be clipped by the old 300pt cap");
      assert.ok(hospiceHeight > 120 && hospiceHeight <= 409.5, "the full-width Hospice heading must exceed the old section-height cap without exceeding Excel's limit");
      const hospiceCell = XLSX.utils.encode_cell({ r: hospiceSourceRow, c: 0 });
      const hospiceReadback = String(readBack.Sheets["保险责任TOB"][hospiceCell]?.v ?? "");
      assert.equal(hospiceReadback.replace(/\n/g, ""), tobSource.rows[hospiceSourceRow][0].replace(/\n/g, ""));
      const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
      const sharedStart = tob.rows.findIndex(row => String(row[0]).startsWith("理疗费\nTherapeutic Services"));
      const sharedEnd = tob.rows.findIndex(row => String(row[0]).startsWith("中草药费\nPrescribed Traditional Chinese Medicine"));
      assert.ok(readBack.Sheets["保险责任TOB"]["!merges"].some(range =>
        range.s.r === sharedStart && range.e.r === sharedEnd && range.s.c === 2 && range.e.c === 3,
      ));
      const quotationText = XLSX.utils.sheet_to_json(readBack.Sheets["报价 Quotation"], { header: 1, raw: false }).flat().join("\n");
      assert.match(quotationText, /方案调整选择/);
      assert.match(quotationText, /门诊第6次起就诊自付20%/);
      assert.match(quotationText, /医疗保费下调6%/);
      assert.equal(readBack.Sheets["报价 Quotation"].D2?.t, "s");
      assert.equal(readBack.Sheets["报价 Quotation"].D2?.v, "");
      const readBackQuotationRows = XLSX.utils.sheet_to_json(readBack.Sheets["报价 Quotation"], { header: 1, raw: false });
      const readBackMedical = readBackQuotationRows.find(row => row[0] === "医疗保费 / Medical Premium");
      assert.notEqual(readBackMedical[1], readBackMedical[2], "the two Plan premiums remain separate XLSX cells");
    },
  },
  {
    name: "FMU/柏盛 PCP 直付/门诊自付可组合且金额取整",
    check() {
      const people = [40, 41, 42].map((age, index) => employee(`E${index + 1}`, age));
      const state = {
        companyCn: "测试团体",
        mode: "compare",
        people,
        variants: [variant("highest", "P4WW", { preExisting: "fmu", copay: "outpatient_from_sixth_20" })],
        selectedPlanCodes: ["P4WW"],
        pcpDirectBilling: true,
      };
      const model = core.buildWorkbookModel(state);
      const quotationRows = model.sheets.find(sheet => sheet.name === "报价 Quotation").rows;
      const paymentRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
      const preExistingRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
      const discountRow = quotationRows.find(row => row.some(cell => String(cell).includes("医疗保费优惠")));
      const totalRow = quotationRows.find(row => String(row[0]).includes("最终保费 Total Premium"));
      assert.match(paymentRow.join("\n"), /柏盛 ?PCP ?首诊/);
      assert.match(paymentRow.join("\n"), /急诊除外/);
      assert.match(paymentRow.join("\n"), /医疗保费下调3%/);
      assert.match(preExistingRow.join("\n"), /最高等级 FMU/);
      assert.equal(discountRow[1], 19902);
      assert.equal(totalRow[1], 122271);
      assert.equal(Number.isInteger(discountRow[1]), true);
      assert.equal(Number.isInteger(totalRow[1]), true);
      const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
      const pecRow = tob.rows.find(row => String(row[0]).includes("一般既往症"));
      assert.match(pecRow[2], /个人健康告知/);
      assert.match(pecRow[2], /不承担一切既往症/);
    },
  },
  {
    name: "多方案 TOB 横向并列输出",
    check() {
      const state = {
        mode: "compare",
        variants: [variant("greaterChina", "P201"), variant("worldwide", "P4WW")],
        selectedPlanCodes: ["P201", "P4WW"],
        people: [],
      };
      const model = core.buildWorkbookModel(state);
      const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
      assert.deepEqual(tob.widths, [34.796875, 48.19921875, 22.796875, 24.796875, 22.796875, 24.796875]);
      assert.match(tob.rows[1][2], /P201/);
      assert.match(tob.rows[1][4], /P402/);
      assert.equal(tob.rows.filter(row => String(row[0]).includes("方案 2")).length, 0);
      assert.ok(tob.merges.includes("C4:D4"));
      assert.ok(tob.merges.includes("E4:F4"));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(tob.rows);
      worksheet["!merges"] = tob.merges.map(ref => XLSX.utils.decode_range(ref));
      worksheet["!cols"] = tob.widths.map(width => ({ wch: width }));
      XLSX.utils.book_append_sheet(workbook, worksheet, tob.name);
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellStyles: true });
      const readBack = XLSX.read(bytes, { type: "buffer", cellStyles: true });
      const rows = XLSX.utils.sheet_to_json(readBack.Sheets[tob.name], { header: 1, raw: false });
      assert.equal(rows[0][0], "保险责任\nTable of Benefits");
      assert.match(rows[1][2], /P201/);
      assert.match(rows[1][4], /P402/);
      assert.equal(rows.filter(row => String(row[0]).includes("方案 2")).length, 0);
    },
  },
];

for (const testCase of fixedCases) {
  await testCase.check();
  console.log(`PASS ${testCase.name}`);
}
console.log(`PASS XLSX write/read: ${outputPath}`);
