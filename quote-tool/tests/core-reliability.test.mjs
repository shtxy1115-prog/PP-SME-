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
  preExisting: "standard",
  ...extra,
});

test("计划模型完整区分 P3/P4 的 WWE 与 WW，并保留 P3WW 费率缺口", () => {
  const plans = core.PLANS;
  assert.deepEqual(
    ["P3WWE", "P3WW", "P4WWE", "P4WW"].map(code => plans.find(plan => plan.code === code)?.area),
    ["全球除美国", "全球", "全球除美国", "全球"],
  );
  assert.equal(plans.find(plan => plan.code === "P3WWE").rateColumn, "P3WWE");
  assert.equal(plans.find(plan => plan.code === "P4WWE").rateColumn, "P4WWE");
  assert.equal(plans.find(plan => plan.code === "P4WW").rateColumn, "P4WW");
  assert.equal(plans.find(plan => plan.code === "P3WW").rateColumn, null);
  assert.match(plans.find(plan => plan.code === "P3WW").source.note, /没有.*P3WW.*列/);
});

test("五类年龄/费率状态：65-69 自动，70+ 与 P3WW 待人工，不以 0 冒充费率", () => {
  const p4ww = core.getPlan("P4WW");
  const p3ww = core.getPlan("P3WW");
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
  assert.equal(core.medicalPremiumFor(employee("E3WW", 40), p3ww).status, "PENDING_UW");
  assert.equal(core.medicalPremiumFor(employee("E3WWM", 40, {
    quoteStatus: "MANUAL_RATE",
    manualMedicalPremium: 90000,
  }), p3ww).premium, 90000);
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
    people: [employee("E1", 30)],
    variants: [variant("v1", "P3WW")],
    selectedPlanCodes: ["P3WW"],
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
