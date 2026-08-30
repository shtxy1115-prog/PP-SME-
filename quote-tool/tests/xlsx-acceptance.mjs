import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const core = require("../core.js");
const XLSX = require("../vendor/xlsx.full.min.js");
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
    check() {
      const people = [1, 2, 3, 4, 5].map(index => employee(`E${index}`, 30 + index));
      const state = { companyCn: "测试团体", companyEn: "Test Group", startDate: "2026-08-30", endDate: "2027-08-29", mode: "compare", people, variants: [variant("maternity", "P201", { maternity: "m30", wellness: "w3000", dental: "d5000" })], selectedPlanCodes: ["P201"], pcpDirectBilling: false };
      const messages = core.validate(state);
      assert.equal(messages.some(message => message.code === "MATERNITY_THREE_YEAR" && message.level === "WARNING"), true);
      assert.equal(core.BENEFIT_DATA.find(item => item.benefitId === "THERAPY").sharedGroup, "THERAPY_TCM_HERBAL");
      assert.equal(core.BENEFIT_DATA.find(item => item.benefitId === "PREGNANCY_COMPLICATIONS").sharedGroup, null);
      const model = core.buildWorkbookModel(state);
      const workbook = XLSX.utils.book_new();
      model.sheets.forEach(sheet => {
        const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
        worksheet["!merges"] = (sheet.merges || []).map(ref => XLSX.utils.decode_range(ref));
        worksheet["!cols"] = (sheet.widths || []).map(width => ({ wch: width }));
        worksheet["!rows"] = sheet.rows.map(() => ({ hpt: 28 }));
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      });
      writeFileSync(outputPath, XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true, cellStyles: true }));
      const readBack = XLSX.read(readFileSync(outputPath), { type: "buffer", cellStyles: true });
      assert.deepEqual(readBack.SheetNames, ["报价 Quotation", "费率 Premium", "方案1 TOB", "昂贵医院 List of HCPs", "参保条件 Eligibility", "预授权 Pre-auth", "重大既往症 Catastrophic PEC"]);
      const premiumText = XLSX.utils.sheet_to_json(readBack.Sheets["费率 Premium"], { header: 1, raw: false }).flat().join("\n");
      assert.match(premiumText, /P2O1|P201/);
      const tobText = XLSX.utils.sheet_to_json(readBack.Sheets["方案1 TOB"], { header: 1, raw: false }).flat().join("\n");
      assert.match(tobText, /THERAPY_TCM_HERBAL/);
      assert.match(tobText, /PREGNANCY_COMPLICATIONS|妊娠并发症/);
    },
  },
];

fixedCases.forEach(testCase => { testCase.check(); console.log(`PASS ${testCase.name}`); });
console.log(`PASS XLSX write/read: ${outputPath}`);
