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
  assert.equal(tobCoverage("P3WWE")[2], "全球除美国\nWorldwide excluding US.");
  assert.equal(tobCoverage("P4WWE")[2], "全球除美国\nWorldwide excluding US.");
  assert.equal(tobCoverage("P4WW")[2], "全球\nWorldwide");
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
  assert.match(copayOption.label, /医疗保费下调6%/);
  assert.match(copayOption.description, /PCP.*互联网问诊.*慢病送药/);
  assert.equal(core.medicalDiscountRate(standard, { pcpDirectBilling: false }), 0);
  assert.equal(core.medicalDiscountRate(copay, { pcpDirectBilling: false }), 0.06);
  assert.equal(core.medicalDiscountRate(standard, { pcpDirectBilling: true }), 0.03);
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
  assert.match(tobCopayRow[2], /门诊第6次起/);
  assert.match(tobCopayRow[2], /PCP.*互联网问诊.*慢病送药/);
  assert.match(tobCopayRow[2], /A 20% co-payment applies from the 6th outpatient visit; PCP visits, online consultations and chronic medicine delivery do not count toward the outpatient visit count\./);
  const model = core.buildWorkbookModel({
    mode: "compare",
    people: [person],
    variants: [copay],
    selectedPlanCodes: [plan.code],
    pcpDirectBilling: false,
  });
  const quotationRows = model.sheets.find(sheet => sheet.name === "报价 Quotation").rows;
  const quotationCopayRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
  assert.match(quotationCopayRow.join("\n"), /门诊第6次起/);
  const discountRow = quotationRows.find(row => row.some(cell => String(cell).includes("医疗保费优惠")));
  assert.equal(discountRow[1], 2843);
});

test("费率 Premium 按已选 Medical 折扣只显示实际调整后费率", () => {
  const selected = variant("selected", "P4WW", {
    copay: "outpatient_from_sixth_20",
  });
  const model = core.buildWorkbookModel({
    mode: "compare",
    people: [employee("E40", 40)],
    variants: [selected],
    selectedPlanCodes: ["P4WW"],
    pcpDirectBilling: true,
  });
  const premium = model.sheets.find(sheet => sheet.name === "费率 Premium");
  const rateHeader = premium.rows.find(row => String(row[0]).includes("年龄段 / Age Band"));
  const rateRow = premium.rows.find(row => row[0] === "40-44");

  assert.deepEqual(rateHeader, ["年龄段 / Age Band", "医疗保费/\nMedical Premium", ""]);
  assert.deepEqual(rateRow, ["40-44", 43126, ""]);
  assert.match(premium.rows.find(row => String(row[0]).includes("方案调整选择"))[1], /医疗保费下调/);
});

test("PCP 直付使用正式英文，Medical 折扣后按整元向上取整", () => {
  const selected = variant("pcp", "P4WW", { copay: "outpatient_from_sixth_20" });
  const person = employee("E10011", 70, { quoteStatus: "MANUAL_RATE", manualMedicalPremium: 10011 });
  const breakdown = core.premiumBreakdown(person, selected, { pcpDirectBilling: true });

  assert.equal(core.adjustedMedicalRateFor(10011, selected, { pcpDirectBilling: true }), 9111);
  assert.equal(breakdown.baseMedical, 10011);
  assert.equal(breakdown.discount, 900);
  assert.equal(breakdown.total, 9111);

  const quotationRows = core.buildWorkbookModel({
    mode: "compare",
    people: [person],
    variants: [selected],
    selectedPlanCodes: ["P4WW"],
    pcpDirectBilling: true,
  }).sheets.find(sheet => sheet.name === "报价 Quotation").rows;
  const paymentRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
  assert.match(paymentRow.join("\n"), /Direct billing is available following an initial consultation with a Prosper PCP; emergency treatment is exempt from this requirement\./);
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
  assert.equal(Number(core.medicalDiscountRate(selected, { pcpDirectBilling: true }).toFixed(2)), 0.14);
  const breakdown = core.premiumBreakdown(employee("E40", 40), selected, { pcpDirectBilling: true });
  assert.equal(breakdown.discount, 6634);
  assert.equal(breakdown.total, 40757);

  const quotationRows = core.buildWorkbookModel({
    mode: "compare",
    people: [employee("E40", 40)],
    variants: [selected],
    selectedPlanCodes: ["P4WW"],
    pcpDirectBilling: true,
  }).sheets.find(sheet => sheet.name === "报价 Quotation").rows;
  const paymentRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
  assert.match(paymentRow.join("\n"), /柏盛 ?PCP ?首诊/);
  assert.match(paymentRow.join("\n"), /急诊除外/);
  assert.match(paymentRow.join("\n"), /医疗保费下调3%/);
  const preExistingRow = quotationRows.find(row => String(row[0]).includes("方案调整选择"));
  assert.match(preExistingRow.join("\n"), /FMU/);
  assert.match(preExistingRow.join("\n"), /不承担一切既往症/);
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

test("TOB 使用已确认的福利责任展示模板", () => {
  const model = core.buildWorkbookModel({
    mode: "compare",
    variants: [variant("greaterChina", "P201"), variant("worldwide", "P4WW")],
    selectedPlanCodes: ["P201", "P4WW"],
    people: [],
  });
  const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
  const benefitText = text => tob.rows.find(row => String(row[0]).startsWith(text))?.[0];

  assert.equal(tob.rows.length, 88);
  assert.equal(benefitText("保障区域\nCoverage Area"), "保障区域\nCoverage Area");
  assert.equal(
    benefitText("紧急医疗\nEmergency treatment"),
    "紧急医疗\nEmergency treatment\n\n保险人对在保障地域以外发生的紧急医疗，被保险人在对应保障地域以外地区发生的保险责任范围内的费用也提供保险保障\nThis benefit provides coverage for the medically necessary and reasonable expenses of emergency medical treatments outside the area of coverage",
  );
  assert.equal(
    benefitText("自付比例\nPolicy Co-payment"),
    "自付比例\nPolicy Co-payment\n\n自付比例指的是被保险人发生保险责任内费用先扣除免赔额（如有）后由被保险人承担的比例\nThe policy co-payment is a fixed percentage of covered medical expenses the member will pay for treatment. The policy co-payment applies after the deductible is met",
  );
  assert.ok(benefitText("临终关怀费\nHospice Care"));
  assert.ok(tob.rows.some(row => row[0] === "特殊检查费\nSpecial Examination Fee"));
  assert.ok(tob.rows.some(row => row[0] === "精神和心理障碍治疗费\nMental Health and Psychotherapeutic Treatment"));
  assert.equal(
    benefitText("1. 眼科检查费（每一保单年度一次）"),
    "1. 眼科检查费（每一保单年度一次）\nEye examination Fee once per policy year\n\n2. 每一保单年度一次框架眼镜费或隐性眼镜费\nOne pair of glasses or contact lenses",
  );
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
    "报价 Quotation", "费率 Premium", "保险责任TOB", "昂贵医院 List of HCPs",
    "预授权 Pre-auth", "重大既往症 Catastrophic PEC", "参保条件 Eligibility",
  ]);
  assert.ok(model.sheets.find(sheet => sheet.name === "费率 Premium").rows.flat().some(value => String(value).includes("待人工费率")));
  const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
  assert.ok(tob.rows.flat().some(value => String(value).includes("理疗费")));
  assert.equal(model.metadata.sourceWorkbook, "PP & Prosper SME 方案整理表 20260814 v2.xlsx");
});

test("报价导出遵循 Proposal 模板的固定工作表与列布局", () => {
  const model = core.buildWorkbookModel({
    companyCn: "测试团体",
    companyEn: "Test Group",
    startDate: "2026-08-30",
    endDate: "2027-08-29",
    mode: "compare",
    people: [employee("E1", 40)],
    variants: [variant("v1", "P201"), variant("v2", "P4WW")],
    selectedPlanCodes: ["P201", "P4WW"],
    pcpDirectBilling: false,
  });
  const quotation = model.sheets.find(sheet => sheet.name === "报价 Quotation");
  assert.equal(quotation.widths.length, 8);
  assert.equal(quotation.merges.includes("A1:H1"), true);
  assert.equal(quotation.merges.includes("D2:H2"), true);
  assert.equal(quotation.merges.includes("A7:H7"), true);
  assert.equal(quotation.merges.includes("A11:H11"), true);
  assert.equal(quotation.rows.every(row => row.length <= 8), true);
  assert.equal(quotation.rows.filter(row => String(row[0]).includes("人员保费明细")).length, 1);
  assert.equal(quotation.rows.find(row => row[0] === "人员 / Member").length, 8);

  const premium = model.sheets.find(sheet => sheet.name === "费率 Premium");
  assert.equal(premium.widths.length, 3);
  assert.equal(premium.rows.every(row => row.length <= 3), true);
  assert.equal(premium.rows.filter(row => String(row[0]).includes("计划 / Plan")).length, 1);
  assert.deepEqual(premium.widths, [34, 50.796875, 50.796875]);
  assert.equal(premium.merges.includes("A1:C1"), true);
  assert.equal(premium.rows.some(row => row.some(value => String(value).includes("展示实际费率"))), false);

  const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
  assert.deepEqual(quotation.widths, [36, 44.796875, 41.796875, 30.796875, 33, 29.59765625, 26, 29]);
  assert.deepEqual(tob.widths, [34.796875, 48.19921875, 22.796875, 24.796875, 22.796875, 24.796875]);
  assert.equal(tob.rows.every(row => row.length <= 6), true);
  assert.ok(tob.merges.some(ref => ref === "A4:B4"));
  assert.ok(tob.merges.some(ref => ref === "C4:D4"));
  assert.ok(tob.merges.some(ref => ref === "E4:F4"));
  const frozenNames = ["昂贵医院 List of HCPs", "预授权 Pre-auth", "重大既往症 Catastrophic PEC", "参保条件 Eligibility"];
  assert.equal(model.sheets.filter(sheet => frozenNames.includes(sheet.name)).every(sheet => sheet.frozenTemplate === true), true);

  assert.equal(core.proposalPlanCode("P3WWE"), "P301");
  assert.equal(core.proposalPlanCode("P4WWE"), "P401");
  assert.equal(core.proposalPlanCode("P4WW"), "P402");
  const proposalText = model.sheets.flatMap(sheet => sheet.rows.flat()).join("\n");
  assert.match(proposalText, /P402/);
  assert.doesNotMatch(proposalText, /P4WW/);
});

test("Quotation 逐方案分列，仅显示已选择的可选福利保费", () => {
  const person = employee("E30", 30);
  const modelFor = variants => core.buildWorkbookModel({
    mode: "compare",
    people: [person],
    variants,
    selectedPlanCodes: variants.map(item => item.planCode),
  }).sheets.find(sheet => sheet.name === "报价 Quotation");

  const noOptions = modelFor([variant("one", "P201"), variant("two", "P4WW")]);
  assert.equal(noOptions.rows.some(row => /可选(?:生育|体检|牙科|眼科)福利保费/.test(String(row[0]))), false);
  const noOptionHeader = noOptions.rows.find(row => row[0] === "人员 / Member");
  assert.deepEqual(noOptionHeader.slice(0, 5), [
    "人员 / Member",
    "人员类型 / Type",
    "年龄 / Age",
    "方案 1 · P201\n医疗保费 / Medical Premium",
    "方案 2 · P402\n医疗保费 / Medical Premium",
  ]);

  const selected = modelFor([
    variant("one", "P201"),
    variant("two", "P4WW", { wellness: "w3000" }),
  ]);
  const medical = selected.rows.find(row => row[0] === "医疗保费 / Medical Premium");
  assert.equal(typeof medical[1], "number");
  assert.equal(typeof medical[2], "number");
  assert.notEqual(medical[1], medical[2]);
  assert.doesNotMatch(String(medical[1]), /方案 1|方案 2/);
  const optionalRows = selected.rows.filter(row => /可选(?:生育|体检|牙科|眼科)福利保费/.test(String(row[0])));
  assert.deepEqual(optionalRows.map(row => row[0]), ["可选体检福利保费\nOptional Wellness Benefits Premium"]);
  assert.equal(optionalRows[0][1], "");
  assert.equal(optionalRows[0][2], 2472);

  const detailHeaderIndex = selected.rows.findIndex(row => row[0] === "人员 / Member");
  const detailHeader = selected.rows[detailHeaderIndex];
  const detailValues = selected.rows[detailHeaderIndex + 1];
  assert.deepEqual(detailHeader.slice(3, 6), [
    "方案 1 · P201\n医疗保费 / Medical Premium",
    "方案 2 · P402\n医疗保费 / Medical Premium",
    "方案 2 · P402\n可选体检福利保费\nOptional Wellness Benefits Premium",
  ]);
  assert.equal(typeof detailValues[3], "number");
  assert.equal(typeof detailValues[4], "number");
  assert.equal(detailValues[5], 2472);
  assert.equal(selected.rowStyles[optionalRows[0] ? selected.rows.indexOf(optionalRows[0]) : -1], "meta");
});

test("Premium 按实际已选可选福利展示相应计划费率；未选择时隐藏可选区", () => {
  const unselected = core.buildWorkbookModel({
    mode: "compare",
    variants: [variant("mainland", "P101"), variant("worldwide", "P4WW")],
    selectedPlanCodes: ["P101", "P4WW"],
    people: [],
  }).sheets.find(sheet => sheet.name === "费率 Premium");
  assert.equal(unselected.rows.some(row => row[0] === "可选方案费率"), false);
  assert.equal(unselected.rows.some(row => /(?:Maternity|Wellness|Dental|Vision) Benefits/.test(String(row[0]))), false);

  const model = core.buildWorkbookModel({
    mode: "compare",
    variants: [
      variant("mainland", "P201", { dental: "d5000" }),
      variant("worldwide", "P4WW", { wellness: "w3000" }),
    ],
    selectedPlanCodes: ["P201", "P4WW"],
    people: [],
  });
  const premium = model.sheets.find(sheet => sheet.name === "费率 Premium");
  assert.deepEqual(premium.widths, [34, 50.796875, 50.796875]);
  assert.deepEqual(premium.rows[0], ["费率表 Premium", "", ""]);
  assert.deepEqual(premium.rows[1], ["计划 / Plan", "P201 · 大中华计划 选项一", "P402 · 全球计划"]);
  assert.deepEqual(premium.rows[5], ["年龄段 / Age Band", "医疗保费/\nMedical Premium", "医疗保费/\nMedical Premium"]);
  assert.deepEqual(premium.rows[6], ["0-7", core.rateFor(0, "P201"), core.rateFor(0, "P4WW")]);
  assert.equal(premium.rows[6].length, 3);
  const optionalTitle = premium.rows.findIndex(row => row[0] === "可选方案费率");
  assert.ok(optionalTitle > 0);
  assert.deepEqual(premium.rows[optionalTitle + 1], ["保险责任 / Benefits", "额度 / Sum of Assured", "保费 / Premium"]);
  assert.match(premium.rows[optionalTitle + 2][0], /牙科福利[\s\S]*方案 1 · P201/);
  assert.deepEqual(premium.rows[optionalTitle + 2].slice(1), ["5,000元 / CNY5,000", 3408]);
  assert.match(premium.rows[optionalTitle + 3][0], /体检福利[\s\S]*方案 2 · P402/);
  assert.deepEqual(premium.rows[optionalTitle + 3].slice(1), ["3,000元 / CNY3,000", 2472]);
  assert.equal(premium.rows.slice(optionalTitle + 2).some(row => /Maternity|生育福利/.test(String(row[0]))), false);
  assert.deepEqual(premium.merges, ["A1:C1", `A${optionalTitle + 1}:C${optionalTitle + 1}`]);
});

test("TOB 复用修订后的福利模板文本、共享合并和条件责任", () => {
  const base = variant("one", "P201");
  const tob = core.buildTobSheet(base, 0);
  const rows = tob.rows;
  const benefitRow = label => rows.find(row => String(row[0]).startsWith(label));
  const online = benefitRow("在线问诊\nOnline Consultations");
  assert.equal(online[0], "在线问诊\nOnline Consultations\n（不含精神和心理障碍治疗）\n(Mental and psychological disorders treatment is not covered)");
  assert.equal(online[2], "中国大陆公立医院开设的互联网医院：\nPublic Internet hospitals in Mainland China\n赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient maximum and outpatient prescription drug benefit maximum\n\n授权通过的私立医院/诊所：\nApproved private providers:\n赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient maximum and outpatient prescription drug benefit maximum");
  assert.equal(benefitRow("慢病送药服务\nChronic Disease Medicine Delivery")[2], "赔付至门诊医疗上限\nCovered up to outpatient maximum");
  assert.equal(benefitRow("门诊肾透析、门诊恶性肿瘤电疗")[2], "赔付至年度最高保额，且不受限于门诊各项福利限制及门诊医疗上限\nCovered up to annual maximum, and not subject to outpatient benefits sub limitations and maximum");
  assert.equal(core.buildTobSheet(variant("one", "P4WW"), 0).rows.find(row => String(row[0]).startsWith("家庭护理\nHome Nursing"))[2], "100天\n100 days");

  const flu = benefitRow("流感疫苗\nInfluenza Vaccine");
  assert.equal(flu[2], "300元\nCNY 300");
  const wellnessSelected = core.buildTobSheet(variant("wellness", "P201", { wellness: "w3000" }), 0);
  assert.equal(wellnessSelected.rows.find(row => String(row[0]).startsWith("流感疫苗\nInfluenza Vaccine"))[2], "不涵盖\nNot Covered");

  const model = core.buildWorkbookModel({
    mode: "compare",
    variants: [variant("mainland", "P201"), variant("worldwide", "P4WW")],
    selectedPlanCodes: ["P201", "P4WW"],
    people: [],
  });
  const parallelTob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
  const sharedRows = ["理疗费\nTherapeutic Services", "传统中医治疗和顺势疗法费", "中草药费\nPrescribed Traditional Chinese Medicine"]
    .map(label => parallelTob.rows.findIndex(row => String(row[0]).startsWith(label)));
  assert.ok(sharedRows.every(index => index >= 0));
  assert.equal(sharedRows[1], sharedRows[0] + 1);
  assert.equal(sharedRows[2], sharedRows[1] + 1);
  assert.ok(parallelTob.merges.includes(`C${sharedRows[0] + 1}:D${sharedRows[2] + 1}`));
  assert.ok(parallelTob.merges.includes(`E${sharedRows[0] + 1}:F${sharedRows[2] + 1}`));
  assert.equal(parallelTob.rows[sharedRows[0]][2], "累计赔付限额：8,000元\nCovered up to CNY 8,000");
  assert.equal(parallelTob.rows[sharedRows[1]][2], "");
  assert.equal(parallelTob.rows[sharedRows[2]][2], "");
  const therapyBlock = core.buildTobSheet(base, 0);
  const singleSharedRows = ["理疗费\nTherapeutic Services", "传统中医治疗和顺势疗法费", "中草药费\nPrescribed Traditional Chinese Medicine"]
    .map(label => therapyBlock.rows.findIndex(row => String(row[0]).startsWith(label)));
  assert.ok(therapyBlock.merges.includes(`C${singleSharedRows[0] + 1}:D${singleSharedRows[2] + 1}`));

  const hospiceIndex = parallelTob.rows.findIndex(row => String(row[0]).startsWith("临终关怀费\nHospice Care"));
  const mentalTitleIndex = parallelTob.rows.findIndex(row => row[0] === "精神和心理障碍治疗费\nMental Health and Psychotherapeutic Treatment");
  assert.equal(parallelTob.rowStyles[hospiceIndex], "section");
  assert.ok(parallelTob.merges.includes(`A${hospiceIndex + 1}:F${hospiceIndex + 1}`));
  assert.equal(parallelTob.rowStyles[mentalTitleIndex], "section");
});

test("多方案 TOB 按方案列并列展示，不重复垂直方案块", () => {
  const model = core.buildWorkbookModel({
    mode: "compare",
    variants: [variant("mainland", "P201"), variant("worldwide", "P4WW")],
    selectedPlanCodes: ["P201", "P4WW"],
    people: [],
  });
  const tob = model.sheets.find(sheet => sheet.name === "保险责任TOB");
  assert.deepEqual(tob.widths, [34.796875, 48.19921875, 22.796875, 24.796875, 22.796875, 24.796875]);
  assert.deepEqual(tob.rows[0], ["保险责任\nTable of Benefits", "", "", "", "", ""]);
  assert.match(tob.rows[1][2], /P201/);
  assert.match(tob.rows[1][4], /P402/);
  assert.equal(tob.rows.every(row => row.length <= 6), true);
  assert.equal(tob.rows.filter(row => String(row[0]).includes("方案 2")).length, 0);
  assert.equal(tob.rows.filter(row => row[0] === "福利责任 Benefit").length, 1);
  assert.ok(tob.merges.includes("A1:F1"));

  const coverageArea = tob.rows.find(row => String(row[0]).includes("保障区域"));
  assert.equal(coverageArea.length, 6);
  assert.match(coverageArea[2], /中国大陆/);
  assert.match(coverageArea[4], /全球/);
});
