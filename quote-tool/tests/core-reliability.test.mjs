import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../core.js");

const employee = (id, age, extra = {}) => ({
  id,
  name: id,
  type: "employee",
  employeeId: id,
  age,
  nature: "new",
  ...extra,
});

const variant = (id, planCode, extra = {}) => ({
  id,
  planCode,
  name: id,
  maternity: "none",
  wellness: "none",
  dental: "none",
  vision: "none",
  copay: "none",
  preExisting: "standard",
  ...extra,
});

test("正式计划模型仅保留 Plan 3 WWE 与 Plan 4 WW/WWE", () => {
  const plans = core.PLANS;
  const invalidPlan3Worldwide = ["P3", "WW"].join("");
  assert.deepEqual(
    plans.filter(plan => plan.group === "P3").map(plan => plan.code),
    ["P3WWE"],
  );
  assert.equal(core.getPlan(invalidPlan3Worldwide), null);
  assert.equal(plans.some(plan => plan.code === invalidPlan3Worldwide), false);
  assert.deepEqual(
    ["P3WWE", "P4WWE", "P4WW"].map(code => plans.find(plan => plan.code === code)?.area),
    ["全球除美国", "全球除美国", "全球"],
  );
  assert.deepEqual(
    ["P3WWE", "P4WWE", "P4WW"].map(code => plans.find(plan => plan.code === code)?.rateColumn),
    ["P3WWE", "P4WWE", "P4WW"],
  );
  assert.equal(plans.every(plan => plan.rateColumn), true);
  assert.equal(core.rateFor(40, "P3WWE"), 24439);
  assert.equal(core.rateFor(40, "P4WWE"), 28147);
  assert.equal(core.rateFor(40, "P4WW"), 47391);
  const coverageArea = core.BENEFIT_DATA.find(item => item.benefitId === "COVERAGE_AREA");
  assert.equal(coverageArea.planValues.P3WWE, "全球除美国\nWorldwide excluding US.");
  assert.equal(coverageArea.planValues.P4WWE, "全球除美国\nWorldwide excluding US.");
  assert.equal(coverageArea.planValues.P4WW, "全球\nWorldwide");
  assert.equal(Object.prototype.hasOwnProperty.call(coverageArea.planValues, invalidPlan3Worldwide), false);
  const tobCoverage = planCode => core.buildTobSheet(variant(`tob-${planCode}`, planCode), 0).rows.find(row => String(row[0]).includes("保障区域"));
  assert.equal(tobCoverage("P3WWE")[1], "全球除美国\nWorldwide excluding US.");
  assert.equal(tobCoverage("P4WWE")[1], "全球除美国\nWorldwide excluding US.");
  assert.equal(tobCoverage("P4WW")[1], "全球\nWorldwide");
});

test("年龄/费率状态：65-69 自动，70+ 待人工，不以 0 冒充费率", () => {
  const p4ww = core.getPlan("P4WW");
  assert.equal(core.medicalPremiumFor(employee("E65", 65), p4ww).status, "AUTO_QUOTABLE");
  assert.equal(core.medicalPremiumFor(employee("E69", 69), p4ww).status, "AUTO_QUOTABLE");
  const pending70 = core.medicalPremiumFor(employee("E70", 70), p4ww);
  assert.equal(pending70.status, "PENDING_UW");
  assert.equal(pending70.premium, 0);
  const manual70 = core.medicalPremiumFor(employee("E70M", 70, {
    quoteStatus: "MANUAL_RATE",
    manualMedicalPremium: 120000,
  }), p4ww);
  assert.deepEqual({ status: manual70.status, premium: manual70.premium }, { status: "MANUAL_RATE", premium: 120000 });
});

test("自付比例选项：第6次起自付20%，指定就诊不计次数，Medical 保费下调6%", () => {
  const plan = core.getPlan("P4WW");
  const person = employee("E40", 40);
  const standard = variant("standard", "P4WW");
  const copay = variant("copay", "P4WW", { copay: "outpatient_from_sixth_20" });
  const copayOption = core.getCopay(copay.copay);

  assert.equal(copayOption.code, "outpatient_from_sixth_20");
  assert.match(copayOption.label, /门诊第6次起.*20%/);
  assert.match(copayOption.description, /PCP.*互联网问诊.*慢病送药/);
  assert.equal(core.medicalDiscountRate(standard, { pcpDirectBilling: false }), 0);
  assert.equal(core.medicalDiscountRate(copay, { pcpDirectBilling: false }), 0.06);
  assert.equal(core.medicalDiscountRate(copay, { pcpDirectBilling: true }), 0.09);

  const base = core.premiumBreakdown(person, standard, { pcpDirectBilling: false });
  const discounted = core.premiumBreakdown(person, copay, { pcpDirectBilling: false });
  assert.equal(base.baseMedical, 47391);
  assert.equal(discounted.baseMedical, 47391);
  assert.equal(discounted.discount, 2843);
  assert.equal(discounted.total, 44548);
  assert.equal(discounted.optional, 0);
  const withOptional = core.premiumBreakdown(person, { ...copay, maternity: "m30" }, { pcpDirectBilling: false });
  assert.equal(withOptional.optional, 4992);
  assert.equal(withOptional.discount, 2843);

  const tob = core.buildTobSheet(copay, 0);
  const tobCopayRow = tob.rows.find(row => String(row[0]).includes("自付比例"));
  assert.match(tobCopayRow[1], /门诊第6次起/);
  assert.match(tobCopayRow[1], /PCP.*互联网问诊.*慢病送药/);
  const model = core.buildWorkbookModel({
    mode: "compare",
    people: [person],
    variants: [copay],
    selectedPlanCodes: [plan.code],
    pcpDirectBilling: false,
  });
  const quotationRows = model.sheets.find(sheet => sheet.name === "报价 Quotation").rows;
  const quotationCopayRow = quotationRows.find(row => String(row[0]).includes("自付比例 Policy Co-payment"));
  assert.match(quotationCopayRow[1], /门诊第6次起/);
  const discountRow = quotationRows.find(row => String(row[0]).includes("医疗保费优惠 Medical Discount"));
  assert.equal(discountRow[1], 2843);
});

test("FMU 是最高等级既往症选项，且可与自付比例和柏盛 PCP 直付同时选择", () => {
  const fmu = core.getPreExisting("fmu");
  assert.ok(fmu);
  assert.match(fmu.label, /11EE以下.*全员.*个人健康告知/);
  assert.match(fmu.description, /不承担一切既往症/);
  assert.equal(fmu.medicalDiscountRate, 0.05);

  const selected = variant("selected", "P4WW", {
    preExisting: "fmu",
    copay: "outpatient_from_sixth_20",
  });
  assert.equal(core.medicalDiscountRate(selected, { pcpDirectBilling: true }), 0.14);
  const breakdown = core.premiumBreakdown(employee("E40", 40), selected, { pcpDirectBilling: true });
  assert.equal(breakdown.discount, 6635);
  assert.equal(breakdown.total, 40756);

  const quotationRows = core.buildWorkbookModel({
    mode: "compare",
    people: [employee("E40", 40)],
    variants: [selected],
    selectedPlanCodes: ["P4WW"],
    pcpDirectBilling: true,
  }).sheets.find(sheet => sheet.name === "报价 Quotation").rows;
  const paymentRow = quotationRows.find(row => String(row[0]).includes("支付条件 Payment Condition"));
  assert.match(paymentRow[1], /柏盛 PCP 首诊/);
  assert.match(paymentRow[1], /急诊除外/);
  const preExistingRow = quotationRows.find(row => String(row[0]).includes("既往症安排"));
  assert.match(preExistingRow[1], /FMU/);
  assert.match(preExistingRow[1], /不承担一切既往症/);
});

test("儿童 25 岁仍可自动报价，26 岁进入 INELIGIBLE", () => {
  const plan = core.getPlan("P201");
  assert.equal(core.medicalPremiumFor({ id: "C25", type: "child", age: 25 }, plan).status, "AUTO_QUOTABLE");
  assert.equal(core.medicalPremiumFor({ id: "C26", type: "child", age: 26 }, plan).status, "INELIGIBLE");
});

test("Compare 不按人数限制计划，Group 按唯一 Plan 而不是变体计数", () => {
  const people = [employee("E1", 30), employee("E2", 31), employee("E3", 32), employee("E4", 33), employee("E5", 34), employee("E6", 35)];
  const samePlanVariants = [variant("v1", "P201"), variant("v2", "P201"), variant("v3", "P201")];
  const groupMessages = core.validate({ mode: "group", people, variants: samePlanVariants, selectedPlanCodes: ["P201"] });
  assert.equal(groupMessages.some(message => message.code === "GROUP_PLAN_LIMIT"), false);
  const twoPlans = [...samePlanVariants, variant("v4", "P101"), variant("v5", "P102")];
  const tooMany = core.validate({ mode: "group", people, variants: twoPlans, selectedPlanCodes: ["P201", "P101", "P102"] });
  assert.equal(tooMany.some(message => message.code === "GROUP_PLAN_LIMIT"), true);
  const compareMessages = core.validate({ mode: "compare", people: people.slice(0, 3), variants: [variant("v1", "P201"), variant("v2", "P101"), variant("v3", "P103")] });
  assert.equal(compareMessages.some(message => message.code === "GROUP_PLAN_LIMIT"), false);
});

test("生育条件与校验等级：人数/全方案一致性为 ERROR，三年不可变仅 WARNING，人工费率为 MANUAL_REVIEW", () => {
  const people = [employee("E1", 30), employee("E2", 31), employee("E3", 32), employee("E4", 33)];
  const messages = core.validate({
    mode: "compare",
    people,
    variants: [variant("v1", "P201", { maternity: "m30" }), variant("v2", "P4WW", { maternity: "none" })],
  });
  assert.equal(messages.find(message => message.code === "MATERNITY_MIN_EMPLOYEES")?.level, "ERROR");
  assert.equal(messages.find(message => message.code === "MATERNITY_ALL_VARIANTS")?.level, "ERROR");
  assert.equal(messages.find(message => message.code === "MATERNITY_THREE_YEAR")?.level, "WARNING");
  const manualMessages = core.validate({
    mode: "compare",
    people: [employee("E70", 70)],
    variants: [variant("v1", "P4WW")],
  });
  assert.equal(manualMessages.find(message => message.code === "MANUAL_RATE_REQUIRED")?.level, "MANUAL_REVIEW");
});

test("TOB 来自结构化 Benefit Data：共享责任不靠字符串前缀/合并，妊娠并发症独立", () => {
  const therapy = core.BENEFIT_DATA.find(item => item.benefitId === "THERAPY");
  const tcm = core.BENEFIT_DATA.find(item => item.benefitId === "TCM_HOMEOPATHY");
  const herbs = core.BENEFIT_DATA.find(item => item.benefitId === "PRESCRIBED_HERBS");
  assert.equal(therapy.sharedGroup, "THERAPY_TCM_HERBAL");
  assert.equal(tcm.sharedGroup, "THERAPY_TCM_HERBAL");
  assert.equal(herbs.sharedGroup, "THERAPY_TCM_HERBAL");
  assert.match(therapy.planValues.P201, /8,000/);
  assert.equal(tcm.planValues.P201, null);
  const complications = core.BENEFIT_DATA.find(item => item.benefitId === "PREGNANCY_COMPLICATIONS");
  const maternity = core.BENEFIT_DATA.find(item => item.benefitId === "MATERNITY_CHILDBIRTH");
  assert.equal(complications.sharedGroup, null);
  assert.equal(maternity.sharedGroup, null);
  assert.notEqual(complications.sourceRow, maternity.sourceRow);
  assert.match(complications.planValues.P4WW, /年度保额/);
  assert.ok(core.HCP.length >= 20);
});

test("导出模型包含必需 sheets、状态/来源/共享责任与可解析单元格", () => {
  const model = core.buildWorkbookModel({
    companyCn: "测试团体",
    companyEn: "Test Group",
    startDate: "2026-08-30",
    endDate: "2027-08-29",
    mode: "compare",
    people: [employee("E1", 70)],
    variants: [variant("v1", "P3WWE")],
    selectedPlanCodes: ["P3WWE"],
    pcpDirectBilling: false,
  });
  assert.deepEqual(model.sheets.map(sheet => sheet.name), [
    "报价 Quotation", "费率 Premium", "方案1 TOB", "昂贵医院 List of HCPs",
    "参保条件 Eligibility", "预授权 Pre-auth", "重大既往症 Catastrophic PEC",
  ]);
  assert.ok(model.sheets.find(sheet => sheet.name === "费率 Premium").rows.flat().some(value => String(value).includes("待人工费率")));
  const tob = model.sheets.find(sheet => sheet.name === "方案1 TOB");
  assert.ok(tob.rows.flat().some(value => String(value).includes("THERAPY_TCM_HERBAL")));
  assert.equal(model.metadata.sourceWorkbook, "PP & Prosper SME 方案整理表 20260814 v2.xlsx");
});
