/*
 * Pure quotation rules and source-backed export model.
 * The browser UI and the Node regression tests both consume this file.
 */
(function attachQuoteCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuoteCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createQuoteCore() {
  "use strict";

  const SOURCE_WORKBOOK = "PP & Prosper SME 方案整理表 20260814 v2.xlsx";
  const SOURCE_SHEET_BENEFITS = "福利表";
  const SOURCE_SHEET_RATES = "Quotation";
  const QUOTE_STATUSES = Object.freeze({
    AUTO_QUOTABLE: "AUTO_QUOTABLE",
    MANUAL_RATE: "MANUAL_RATE",
    PENDING_UW: "PENDING_UW",
    INELIGIBLE: "INELIGIBLE",
  });
  const VALIDATION_LEVELS = Object.freeze({ ERROR: "ERROR", WARNING: "WARNING", MANUAL_REVIEW: "MANUAL_REVIEW" });

  const RATE_COLUMNS = Object.freeze([
    { name: "P1O1", sheetColumn: "B", label: "P1O1" },
    { name: "P1O2", sheetColumn: "C", label: "P1O2" },
    { name: "P1O3", sheetColumn: "D", label: "P1O3" },
    { name: "P2O1", sheetColumn: "E", label: "P2O1" },
    { name: "P2O2", sheetColumn: "F", label: "P2O2" },
    { name: "P2O3", sheetColumn: "G", label: "P2O3" },
    { name: "P3WWE", sheetColumn: "H", label: "P3WWE" },
    { name: "P4WW", sheetColumn: "I", label: "P4WW" },
    { name: "P4WWE", sheetColumn: "J", label: "P4WWE" },
  ]);

  const RATE_BANDS = Object.freeze([
    { label: "0-7", min: 0, max: 7, rates: { P1O1: 11068, P1O2: 11998, P1O3: 13191, P2O1: 13565, P2O2: 14774, P2O3: 26822, P3WWE: 24426, P4WW: 47365, P4WWE: 28131 } },
    { label: "8-18", min: 8, max: 18, rates: { P1O1: 10183, P1O2: 11038, P1O3: 12136, P2O1: 12479, P2O2: 13592, P2O3: 24676, P3WWE: 22471, P4WW: 43576, P4WWE: 25881 } },
    { label: "19-24", min: 19, max: 24, rates: { P1O1: 8855, P1O2: 9598, P1O3: 10553, P2O1: 10852, P2O2: 11819, P2O3: 21458, P3WWE: 19540, P4WW: 37892, P4WWE: 22505 } },
    { label: "25-29", min: 25, max: 29, rates: { P1O1: 8855, P1O2: 9598, P1O3: 10553, P2O1: 10852, P2O2: 11819, P2O3: 21458, P3WWE: 19540, P4WW: 37892, P4WWE: 22505 } },
    { label: "30-34", min: 30, max: 34, rates: { P1O1: 9410, P1O2: 10200, P1O3: 11214, P2O1: 11532, P2O2: 12560, P2O3: 22803, P3WWE: 20765, P4WW: 40267, P4WWE: 23915 } },
    { label: "35-39", min: 35, max: 39, rates: { P1O1: 10557, P1O2: 11443, P1O3: 12581, P2O1: 12937, P2O2: 14091, P2O3: 25582, P3WWE: 23296, P4WW: 45175, P4WWE: 26830 } },
    { label: "40-44", min: 40, max: 44, rates: { P1O1: 11075, P1O2: 12004, P1O3: 13199, P2O1: 13572, P2O2: 14782, P2O3: 26837, P3WWE: 24439, P4WW: 47391, P4WWE: 28147 } },
    { label: "45-49", min: 45, max: 49, rates: { P1O1: 12160, P1O2: 13181, P1O3: 14492, P2O1: 14902, P2O2: 16231, P2O3: 29467, P3WWE: 26834, P4WW: 52036, P4WWE: 30905 } },
    { label: "50-54", min: 50, max: 54, rates: { P1O1: 13800, P1O2: 14958, P1O3: 16447, P2O1: 16912, P2O2: 18420, P2O3: 33442, P3WWE: 30454, P4WW: 59055, P4WWE: 35074 } },
    { label: "55-59", min: 55, max: 59, rates: { P1O1: 16008, P1O2: 17351, P1O3: 19078, P2O1: 19618, P2O2: 21366, P2O3: 38791, P3WWE: 35325, P4WW: 68501, P4WWE: 40684 } },
    { label: "60-65", min: 60, max: 65, rates: { P1O1: 21027, P1O2: 22792, P1O3: 25060, P2O1: 25769, P2O2: 28066, P2O3: 50955, P3WWE: 46402, P4WW: 89980, P4WWE: 53442 } },
    { label: "66-69", min: 66, max: 69, rates: { P1O1: 26577, P1O2: 28807, P1O3: 31674, P2O1: 32570, P2O2: 35473, P2O3: 64403, P3WWE: 58649, P4WW: 113729, P4WWE: 67546 } },
  ]);

  const PLAN_GROUP_CODES = Object.freeze({
    P1: ["P101", "P102", "P103"],
    P2: ["P201", "P202", "P203"],
    P3: ["P3WWE", "P3WW"],
    P4: ["P4WWE", "P4WW"],
  });

  const PLANS = Object.freeze([
    { code: "P101", group: "P1", name: "大陆计划", option: "选项一", area: "中国大陆", region: "MAINLAND", rateColumn: "P1O1", outpatientMaximum: "30,000元/人/年", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P1O1" } },
    { code: "P102", group: "P1", name: "大陆计划", option: "选项二", area: "中国大陆", region: "MAINLAND", rateColumn: "P1O2", outpatientMaximum: "50,000元/人/年", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P1O2" } },
    { code: "P103", group: "P1", name: "大陆计划", option: "选项三", area: "中国大陆", region: "MAINLAND", rateColumn: "P1O3", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P1O3" } },
    { code: "P201", group: "P2", name: "大中华计划", option: "选项一", area: "中国大陆、港澳台", region: "GREATER_CHINA", rateColumn: "P2O1", outpatientMaximum: "50,000元/人/年", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P2O1" } },
    { code: "P202", group: "P2", name: "大中华计划", option: "选项二", area: "中国大陆、港澳台", region: "GREATER_CHINA", rateColumn: "P2O2", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P2O2" } },
    { code: "P203", group: "P2", name: "大中华计划", option: "选项三", area: "中国大陆、港澳台", region: "GREATER_CHINA", rateColumn: "P2O3", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P2O3" } },
    { code: "P3WWE", group: "P3", name: "全球除美计划", option: "", area: "全球除美国", region: "WORLDWIDE_EXCLUDING_US", rateColumn: "P3WWE", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P3WWE" } },
    { code: "P3WW", group: "P3", name: "全球计划", option: "", area: "全球", region: "WORLDWIDE", rateColumn: null, outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: null, status: "NEEDS_CONFIRMATION", note: "原始费率表没有 P3WW 列；不得复用其他计划费率" } },
    { code: "P4WWE", group: "P4", name: "全球计划", option: "", area: "全球除美国", region: "WORLDWIDE_EXCLUDING_US", rateColumn: "P4WWE", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P4WWE" } },
    { code: "P4WW", group: "P4", name: "全球计划", option: "", area: "全球", region: "WORLDWIDE", rateColumn: "P4WW", outpatientMaximum: "赔付至年度最高保额", source: { sheet: SOURCE_SHEET_RATES, row: 9, column: "P4WW" } },
  ]);

  const PLAN_BY_CODE = new Map(PLANS.map(plan => [plan.code, plan]));

  function expandPlanValues(baseValues = {}, overrides = {}) {
    const values = {};
    Object.entries(PLAN_GROUP_CODES).forEach(([group, codes]) => {
      codes.forEach(code => { values[code] = Object.prototype.hasOwnProperty.call(baseValues, group) ? baseValues[group] : null; });
    });
    Object.assign(values, overrides);
    return values;
  }

  function makeBenefit({ benefitId, section, cnName, enName, cnDescription, enDescription, baseValues = {}, planOverrides = {}, sharedGroup = null, sourceRow }) {
    return Object.freeze({
      benefitId,
      section,
      cnName,
      enName,
      cnDescription: cnDescription || cnName,
      enDescription: enDescription || enName,
      planValues: Object.freeze(expandPlanValues(baseValues, planOverrides)),
      sharedGroup,
      sourceSheet: SOURCE_SHEET_BENEFITS,
      sourceRow,
    });
  }

  /*
   * This is a normalized copy of the non-heading rows A:E of the supplied
   * 福利表. The source row is retained so every rendered TOB cell remains
   * traceable. Blank source values stay null; they are never reverse-inferred.
   */
  const BENEFIT_DATA = Object.freeze([
    makeBenefit({ benefitId: "ANNUAL_MAXIMUM", section: "core", cnName: "年度最高保额", enName: "Overall Annual Maximum per Insured Person", cnDescription: "所有责任年度赔付限额", enDescription: "All benefits share this annual maximum", baseValues: { P1: "8,000,000元\nCNY 8,000,000", P2: "16,000,000元\nCNY 16,000,000", P3: "16,000,000元\nCNY 16,000,000", P4: "20,000,000元\nCNY 20,000,000" }, sourceRow: 5 }),
    makeBenefit({ benefitId: "COVERAGE_AREA", section: "core", cnName: "保障区域", enName: "Coverage Area", cnDescription: "承保区域按计划定义；全球计划在美国适用网络医疗规则", enDescription: "Coverage area follows the plan; worldwide plans use the US network rule", baseValues: { P1: "中国大陆\nMainland China", P2: "中国大陆和港澳台\nMainland China, Hong Kong, Macao and Taiwan", P3: "全球除美国\nWorldwide excluding US.", P4: "全球\nWorldwide" }, sourceRow: 6 }),
    makeBenefit({ benefitId: "EMERGENCY_TREATMENT", section: "core", cnName: "紧急医疗", enName: "Emergency Treatment", cnDescription: "保障区域以外发生的紧急医疗，在责任范围内提供保障", enDescription: "Emergency treatment outside the coverage area is covered within the insured benefits", baseValues: { P1: "涵盖\nCovered", P2: "涵盖\nCovered", P3: "涵盖\nCovered", P4: "——" }, sourceRow: 7 }),
    makeBenefit({ benefitId: "DIRECT_BILLING", section: "core", cnName: "直付服务", enName: "Direct Billing Service", baseValues: { P1: "涵盖\nCovered", P2: "涵盖\nCovered", P3: "涵盖\nCovered", P4: "涵盖\nCovered" }, sourceRow: 8 }),
    makeBenefit({ benefitId: "PUBLIC_HOSPITAL", section: "hospital", cnName: "公立医院普通部、VIP或特需部", enName: "Public Hospitals general ward, VIP or international department", baseValues: { P1: "0", P2: "0", P3: "0", P4: "0" }, sourceRow: 10 }),
    makeBenefit({ benefitId: "PRIVATE_HOSPITAL", section: "hospital", cnName: "私立医院或诊所（不含昂贵医疗机构）", enName: "Private Hospital or Clinic (excluding High Cost Providers)", baseValues: { P1: "0", P2: "0", P3: "0", P4: "0" }, sourceRow: 11 }),
    makeBenefit({ benefitId: "HIGH_COST_PROVIDERS", section: "hospital", cnName: "昂贵医疗机构", enName: "High Cost Providers", cnDescription: "参见完整昂贵医疗机构列表", enDescription: "See the full List of High Cost Providers", baseValues: { P1: "1", P2: "100%", P3: "0.2", P4: "0" }, planOverrides: { P203: "0" }, sourceRow: 12 }),
    makeBenefit({ benefitId: "NON_CATASTROPHIC_PEC", section: "underwriting", cnName: "一般既往症", enName: "Non-catastrophic Pre-existing Conditions", baseValues: { P1: "11EE及以上 100% Refund\n11EE以下：10,000元/年", P2: "11EE及以上 100% Refund\n11EE以下：10,000元/年", P3: "11EE及以上 100% Refund\n11EE以下：10,000元/年", P4: "11EE及以上 100% Refund\n11EE以下：10,000元/年" }, sourceRow: 14 }),
    makeBenefit({ benefitId: "CATASTROPHIC_PEC", section: "underwriting", cnName: "重大既往症", enName: "Catastrophic Pre-existing Conditions", baseValues: { P1: "无赔付\nNot Covered", P2: "无赔付\nNot Covered", P3: "无赔付\nNot Covered", P4: "无赔付\nNot Covered" }, sourceRow: 15 }),
    makeBenefit({ benefitId: "WAITING_PERIOD", section: "underwriting", cnName: "等待期", enName: "Waiting period", baseValues: { P1: "无等待期\nNo waiting period", P2: "无等待期\nNo waiting period", P3: "无等待期\nNo waiting period", P4: "无等待期\nNo waiting period" }, sourceRow: 16 }),
    makeBenefit({ benefitId: "ANNUAL_DEDUCTIBLE", section: "deductible", cnName: "年免赔额", enName: "Annual Deductible", baseValues: { P1: "个人年度免赔额：0元\nIndividual Annual Deductible: CNY 0\n\n家庭年度免赔额：0元\nFamily Annual Deductible: CNY 0", P2: "个人年度免赔额：0元\nIndividual Annual Deductible: CNY 0\n\n家庭年度免赔额：0元\nFamily Annual Deductible: CNY 0", P3: "个人年度免赔额：0元\nIndividual Annual Deductible: CNY 0\n\n家庭年度免赔额：0元\nFamily Annual Deductible: CNY 0", P4: "个人年度免赔额：0元\nIndividual Annual Deductible: CNY 0\n\n家庭年度免赔额：0元\nFamily Annual Deductible: CNY 0" }, sourceRow: 18 }),
    makeBenefit({ benefitId: "VISIT_DEDUCTIBLE", section: "deductible", cnName: "次免赔额", enName: "Per Visit Deductible", baseValues: { P1: "0 元\nCNY 0", P2: "0 元\nCNY 0", P3: "0 元\nCNY 0", P4: "0 元\nCNY 0" }, sourceRow: 19 }),
    makeBenefit({ benefitId: "POLICY_COPAY", section: "deductible", cnName: "自付比例", enName: "Policy Co-payment", cnDescription: "门诊第6次起就诊自付比例20%；通过PCP、互联网问诊、慢病送药不计入门诊次数", enDescription: "20% co-payment from the sixth outpatient visit; PCP, online consultation and chronic medicine delivery do not count", baseValues: { P1: "0", P2: "0", P3: "0", P4: "0" }, sourceRow: 20 }),
    makeBenefit({ benefitId: "OUT_OF_POCKET_MAXIMUM", section: "deductible", cnName: "自付限额", enName: "Out-of-Pocket Maximum", baseValues: { P1: "无\nNo Maximum", P2: "无\nNo Maximum", P3: "无\nNo Maximum", P4: "无\nNo Maximum" }, sourceRow: 21 }),
    makeBenefit({ benefitId: "INPATIENT_MAXIMUM", section: "inpatient", cnName: "住院医疗责任累计限额", enName: "Annual Inpatient Maximum", baseValues: { P1: "8,000,000元\nCNY 8,000,000", P2: "16,000,000元\nCNY 16,000,000", P3: "16,000,000元\nCNY 16,000,000", P4: "20,000,000元\nCNY 20,000,000" }, sourceRow: 23 }),
    makeBenefit({ benefitId: "PRIVATE_ROOM", section: "inpatient", cnName: "标准单人病房床位费", enName: "Standard private room", baseValues: { P1: "每日限额1,500元\nUp to CNY 1,500 per day", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 24 }),
    makeBenefit({ benefitId: "MEALS", section: "inpatient", cnName: "膳食和营养配餐费", enName: "Costs of meals and/or special diets during the hospital stay", baseValues: { P1: "每日理赔不超过200元\nFully covered up to CNY 200 per day", P2: "每日理赔不超过200元\nFully covered up to CNY 200 per day", P3: "每日理赔不超过200元\nFully covered up to CNY 200 per day", P4: "每日理赔不超过200元\nFully covered up to CNY 200 per day" }, sourceRow: 25 }),
    makeBenefit({ benefitId: "ICU", section: "inpatient", cnName: "重症监护病房费", enName: "Intensive Care Unit", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 26 }),
    makeBenefit({ benefitId: "COMPANION_BED", section: "inpatient", cnName: "加床费", enName: "Companion Bed", cnDescription: "未满18岁附属被保险人或指定新生婴儿的陪同住院加床费", enDescription: "Bed for a parent accompanying a child under 18 or a qualifying newborn", baseValues: { P1: "每日限额1,500元，最多30天\nUp to CNY 1,500 per day, max. 30 days", P2: "无单项限额，最多30天\nFully covered, max. 30 days", P3: "无单项限额，最多30天\nFully covered, max. 30 days", P4: "无单项限额，最多30天\nFully covered, max. 30 days" }, sourceRow: 27 }),
    makeBenefit({ benefitId: "PHYSICIAN_NURSING", section: "inpatient", cnName: "诊疗和护理费", enName: "Physician and nursing Fee", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 28 }),
    makeBenefit({ benefitId: "INPATIENT_DIAGNOSTICS", section: "inpatient", cnName: "检查、药品、化验、吸氧、输血等费用", enName: "Examinations, medication, laboratory tests, oxygen and blood services", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 29 }),
    makeBenefit({ benefitId: "INPATIENT_SURGERY", section: "inpatient", cnName: "住院手术费", enName: "Inpatient Surgery", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 30 }),
    makeBenefit({ benefitId: "RECONSTRUCTIVE_SURGERY", section: "inpatient", cnName: "矫形改造手术费", enName: "Reconstructive Surgery", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 31 }),
    makeBenefit({ benefitId: "INPATIENT_SPECIAL_TREATMENT", section: "inpatient", cnName: "放射、呼吸、化学、物理、职业治疗费", enName: "Radiation, respiratory, chemotherapy, physical and occupational therapy", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 32 }),
    makeBenefit({ benefitId: "ORGAN_TRANSPLANT", section: "inpatient", cnName: "器官、骨髓移植费", enName: "Organ and Bone Marrow Transplantation Fee", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 33 }),
    makeBenefit({ benefitId: "REHABILITATION", section: "inpatient", cnName: "康复治疗和专业护理费", enName: "Rehabilitation Treatment", baseValues: { P1: "累计赔付日数限额: 90日\nUp to 90 nights", P2: "累计赔付日数限额: 90日\nUp to 90 nights", P3: "累计赔付日数限额: 90日\nUp to 90 nights", P4: "累计赔付日数限额: 90日\nUp to 90 nights" }, sourceRow: 34 }),
    makeBenefit({ benefitId: "OUTPATIENT_MAXIMUM", section: "outpatient", cnName: "门诊医疗责任累计限额", enName: "Overall Outpatient Maximum", baseValues: { P1: "选项一：30,000元/年；选项二：50,000元/年；选项三：同年度最高保额", P2: "选项一：50,000元/年；选项二/三：同年度最高保额", P3: "赔付至年度最高保额\nCovered up to annual maximum", P4: "赔付至年度最高保额\nCovered up to annual maximum" }, planOverrides: { P101: "30,000元/年", P102: "50,000元/年", P103: "同年度最高保额", P201: "50,000元/年", P202: "同年度最高保额", P203: "同年度最高保额" }, sourceRow: 36 }),
    makeBenefit({ benefitId: "OUTPATIENT_DOCTOR", section: "outpatient", cnName: "医师诊疗费", enName: "Doctor Fee", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 37 }),
    makeBenefit({ benefitId: "PRESCRIPTION_DRUGS", section: "outpatient", cnName: "处方药费", enName: "Prescription Drugs", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 38 }),
    makeBenefit({ benefitId: "DIAGNOSTIC_LAB", section: "outpatient", cnName: "检查费和化验费", enName: "Diagnostic and Laboratory Tests", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 39 }),
    makeBenefit({ benefitId: "ADVANCED_IMAGING", section: "outpatient", cnName: "大型检查费", enName: "Advanced Imaging", baseValues: { P1: "累计赔付限额: 20,000元\nCovered up to CNY 20,000", P2: "累计赔付限额: 30,000元\nCovered up to CNY 30,000", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 40 }),
    makeBenefit({ benefitId: "OUTPATIENT_SURGERY", section: "outpatient", cnName: "门诊手术费", enName: "Out-patient Surgery", baseValues: { P1: "无单项限额，不受门诊保额限制\nFully covered, not subject to outpatient coverage limit", P2: "无单项限额，不受门诊保额限制\nFully covered, not subject to outpatient coverage limit", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 41 }),
    makeBenefit({ benefitId: "THERAPY", section: "outpatient", cnName: "理疗费", enName: "Therapeutic Services", cnDescription: "物理治疗、脊椎矫正、职业疗法、语言治疗、电疗等", enDescription: "Physiotherapy, chiropractic, vocational, speech, occupational and electrotherapy", baseValues: { P1: "累计赔付限额：6,000元\nCovered up to CNY 6,000", P2: "累计赔付限额：8,000元\nCovered up to CNY 8,000", P3: "累计赔付限额：10,000元\nCovered up to CNY 10,000", P4: "无单项限额\nFully covered" }, sharedGroup: "THERAPY_TCM_HERBAL", sourceRow: 42 }),
    makeBenefit({ benefitId: "TCM_HOMEOPATHY", section: "outpatient", cnName: "传统中医治疗和顺势疗法费", enName: "Traditional Chinese Medicine Treatment and Homeopathy", cnDescription: "源表未给出独立金额；与理疗/中草药责任组共享限额", enDescription: "The source has no independent amount; this belongs to the shared therapy/herbal limit group", baseValues: { P1: null, P2: null, P3: null, P4: null }, sharedGroup: "THERAPY_TCM_HERBAL", sourceRow: 43 }),
    makeBenefit({ benefitId: "PRESCRIBED_HERBS", section: "outpatient", cnName: "中草药费", enName: "Prescribed Traditional Chinese Medicine", cnDescription: "注册中医医师处方的医学必需且合理的中草药费用；源表未给出独立金额", enDescription: "Medically necessary prescribed Chinese herbal medicine; the source has no independent amount", baseValues: { P1: null, P2: null, P3: null, P4: null }, sharedGroup: "THERAPY_TCM_HERBAL", sourceRow: 44 }),
    makeBenefit({ benefitId: "EMERGENCY_DENTAL", section: "outpatient", cnName: "牙科意外伤害治疗费", enName: "Emergency Dental Treatment", baseValues: { P1: "累计赔付限额：10,000元\nCovered up to CNY 10,000", P2: "累计赔付限额：10,000元\nCovered up to CNY 10,000", P3: "累计赔付限额：10,000元\nCovered up to CNY 10,000", P4: "无单项限额\nFully covered" }, sourceRow: 45 }),
    makeBenefit({ benefitId: "ONLINE_CONSULTATIONS", section: "outpatient", cnName: "在线问诊", enName: "Online Consultations", cnDescription: "不含精神和心理障碍治疗；受门诊医疗及门诊处方药上限约束", enDescription: "Excludes mental and psychological disorder treatment; subject to outpatient and prescription drug maxima", baseValues: { P1: "赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient and prescription drug maxima", P2: "赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient and prescription drug maxima", P3: "赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient and prescription drug maxima", P4: "赔付至门诊医疗上限，且受限于门诊处方药上限\nCovered up to outpatient and prescription drug maxima" }, sourceRow: 46 }),
    makeBenefit({ benefitId: "CHRONIC_MEDICINE_DELIVERY", section: "outpatient", cnName: "慢病送药服务", enName: "Chronic Disease Medicine Delivery", baseValues: { P1: "赔付至门诊医疗上限", P2: "赔付至门诊医疗上限", P3: "赔付至门诊医疗上限", P4: "赔付至门诊医疗上限" }, sourceRow: 47 }),
    makeBenefit({ benefitId: "OUTPATIENT_CANCER_DIALYSIS", section: "special", cnName: "门诊肾透析及门诊恶性肿瘤治疗", enName: "Out-patient Kidney Dialysis and Out-patient Cancer Treatment", baseValues: { P1: "赔付至年度最高保额，且不受限于门诊各项福利限制及门诊医疗上限", P2: "赔付至年度最高保额，且不受限于门诊各项福利限制及门诊医疗上限", P3: "赔付至年度最高保额，且不受限于门诊各项福利限制及门诊医疗上限", P4: "赔付至年度最高保额，且不受限于门诊各项福利限制及门诊医疗上限" }, sourceRow: 49 }),
    makeBenefit({ benefitId: "HOME_NURSING", section: "special", cnName: "家庭护理", enName: "Home Nursing", baseValues: { P1: "不涵盖\nNot covered", P2: "不涵盖\nNot covered", P3: "100天", P4: "100天" }, sourceRow: 50 }),
    makeBenefit({ benefitId: "PROFESSIONAL_NURSING", section: "special", cnName: "专业护理", enName: "Professional Nursing", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 51 }),
    makeBenefit({ benefitId: "DME", section: "special", cnName: "耐用医疗设备购买或租赁费", enName: "Durable Medical Equipment (Purchase or Rental)", baseValues: { P1: "累计赔付限额20,000元\nCovered up to CNY 20,000", P2: "累计赔付限额20,000元\nCovered up to CNY 20,000", P3: "累计赔付限额30,000元\nCovered up to CNY 30,000", P4: "无单项限额\nFully covered" }, sourceRow: 52 }),
    makeBenefit({ benefitId: "SLEEP", section: "special", cnName: "睡眠检查和治疗费", enName: "Sleep Studies/Tests and Treatment", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 53 }),
    makeBenefit({ benefitId: "CONGENITAL", section: "special", cnName: "先天性疾病和症状治疗费", enName: "Congenital Conditions and Birth Anomalies", baseValues: { P1: "累计赔付限额20,000元\nCovered up to CNY 20,000", P2: "累计赔付限额60,000元\nCovered up to CNY 60,000", P3: "累计赔付限额60,000元\nCovered up to CNY 60,000", P4: "累计赔付限额60,000元\nCovered up to CNY 60,000" }, sourceRow: 54 }),
    makeBenefit({ benefitId: "BREAST_CERVICAL_SCREENING", section: "special", cnName: "乳腺癌筛查和宫颈癌筛查", enName: "Breast Cancer Screening and Cervical Cancer Screening", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 56 }),
    makeBenefit({ benefitId: "PROSTATE_SCREENING", section: "special", cnName: "前列腺癌筛查", enName: "Prostate Cancer Screening", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 57 }),
    makeBenefit({ benefitId: "FAMILY_HISTORY_SCREENING", section: "special", cnName: "经医师推荐的家族疾病筛查费", enName: "Screenings Due to Family Medical History", baseValues: { P1: "不涵盖\nNot covered", P2: "累计赔付限额：2,000元\nCovered up to CNY 2,000", P3: "累计赔付限额：2,000元\nCovered up to CNY 2,000", P4: "累计赔付限额：2,000元\nCovered up to CNY 2,000" }, sourceRow: 58 }),
    makeBenefit({ benefitId: "HOSPICE_OUTPATIENT", section: "special", cnName: "临终关怀：门诊费用", enName: "Hospice Care: Outpatient", baseValues: { P1: "累计赔付限额：40,000元\nCovered up to CNY 40,000", P2: "累计赔付限额：40,000元\nCovered up to CNY 40,000", P3: "累计赔付限额：40,000元\nCovered up to CNY 40,000", P4: "累计赔付限额：40,000元\nCovered up to CNY 40,000" }, sourceRow: 60 }),
    makeBenefit({ benefitId: "HOSPICE_INPATIENT", section: "special", cnName: "临终关怀：住院费用", enName: "Hospice Care: Inpatient", baseValues: { P1: "累计赔付日数限额：45日\nUp to 45 nights", P2: "累计赔付日数限额：45日\nUp to 45 nights", P3: "累计赔付日数限额：45日\nUp to 45 nights", P4: "累计赔付日数限额：45日\nUp to 45 nights" }, sourceRow: 61 }),
    makeBenefit({ benefitId: "MENTAL_HEALTH_OUTPATIENT", section: "special", cnName: "精神和心理障碍治疗费：门诊", enName: "Mental Health and Psychotherapeutic Treatment: Outpatient", baseValues: { P1: "不涵盖\nNot covered", P2: "累计赔付限额5,000元\nCovered up to CNY 5,000", P3: "累计赔付限额10,000元\nCovered up to CNY 10,000", P4: "累计赔付限额20,000元\nCovered up to CNY 20,000" }, sourceRow: 63 }),
    makeBenefit({ benefitId: "MENTAL_HEALTH_INPATIENT", section: "special", cnName: "精神和心理障碍治疗费：住院", enName: "Mental Health and Psychotherapeutic Treatment: Inpatient", baseValues: { P1: "不涵盖\nNot covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 64 }),
    makeBenefit({ benefitId: "ALCOHOL_DRUG_REHAB", section: "special", cnName: "酒精和药物滥用的戒断治疗费", enName: "Rehabilitation Treatment for alcohol and drug abuse", baseValues: { P1: "不涵盖\nNot covered", P2: "不涵盖\nNot covered", P3: "不涵盖\nNot covered", P4: "不涵盖\nNot covered" }, sourceRow: 65 }),
    makeBenefit({ benefitId: "AMBULANCE", section: "assistance", cnName: "紧急医疗运送费", enName: "Emergency Ambulance Services", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 67 }),
    makeBenefit({ benefitId: "EVACUATION", section: "assistance", cnName: "紧急医疗转运费", enName: "Emergency Medical Evacuation Fees", baseValues: { P1: "无单项限额\nFully covered", P2: "无单项限额\nFully covered", P3: "无单项限额\nFully covered", P4: "无单项限额\nFully covered" }, sourceRow: 68 }),
    makeBenefit({ benefitId: "EVACUATION_COMPANION_LODGING", section: "assistance", cnName: "陪同人员住宿费", enName: "For an accompanying person during Medical Evacuation", baseValues: { P1: "累计赔付日数限额：12日，每日限额800元\nCNY 800 per night, up to 12 nights", P2: "累计赔付日数限额：12日，每日限额800元\nCNY 800 per night, up to 12 nights", P3: "累计赔付日数限额：12日，每日限额800元\nCNY 800 per night, up to 12 nights", P4: "累计赔付日数限额：12日，每日限额800元\nCNY 800 per night, up to 12 nights" }, sourceRow: 69 }),
    makeBenefit({ benefitId: "REPATRIATION", section: "assistance", cnName: "遗体运返或安葬费", enName: "Repatriation or Local Burial of Mortal Remains", baseValues: { P1: "累计赔付限额：160,000元\nCovered up to CNY 160,000", P2: "累计赔付限额：160,000元\nCovered up to CNY 160,000", P3: "累计赔付限额：160,000元\nCovered up to CNY 160,000", P4: "累计赔付限额：160,000元\nCovered up to CNY 160,000" }, sourceRow: 70 }),
    makeBenefit({ benefitId: "MATERNITY_WAITING", section: "maternity", cnName: "生育等待期", enName: "Maternity Waiting Period", cnDescription: "无等待期；不承担入保前已经怀孕的生育及相关检查费用", enDescription: "No waiting period; pregnancy existing before enrollment is not covered", baseValues: { P1: "无等待期\nNo waiting period", P2: "无等待期\nNo waiting period", P3: "无等待期\nNo waiting period", P4: "无等待期\nNo waiting period" }, sourceRow: 73 }),
    makeBenefit({ benefitId: "MATERNITY_CHILDBIRTH", section: "maternity", cnName: "孕产费", enName: "Maternity and Childbirth Benefit", cnDescription: "每次怀孕分娩及相关产前、产后、医学必需治疗费用；孕产费不受住院/门诊上限限制", enDescription: "Delivery and related prenatal, postnatal and medically necessary treatment; not subject to inpatient/outpatient maximum", baseValues: { P1: "累计赔付限额30,000元\nCovered up to CNY 30,000", P2: "累计赔付限额30,000元\nCovered up to CNY 30,000", P3: "累计赔付限额60,000元\nCovered up to CNY 60,000", P4: "累计赔付限额60,000元\nCovered up to CNY 60,000" }, sourceRow: 74 }),
    makeBenefit({ benefitId: "PREGNANCY_COMPLICATIONS", section: "maternity", cnName: "妊娠并发症治疗费", enName: "Complications of Pregnancy", cnDescription: "与孕产费责任独立；仅按福利表计划值呈现，源表计划1/2为空", enDescription: "Independent from maternity childbirth; shown only where the source table has a plan value", baseValues: { P1: null, P2: null, P3: "涵盖，且受限于年度保额上限\nCovered, subject to the cap limit of annual maximum", P4: "涵盖，且受限于年度保额上限\nCovered, subject to the cap limit of annual maximum" }, sourceRow: 75 }),
    makeBenefit({ benefitId: "ROUTINE_EXAMS", section: "wellness", cnName: "常规体检", enName: "Routine Exams, Annual Check-ups", baseValues: { P1: "1,500元/ 3,000元\nCNY 1,500/ CNY 3,000", P2: "1,500元/ 3,000元\nCNY 1,500/ CNY 3,000", P3: "1,500元/ 3,000元/ 5,000元\nCNY 1,500/ CNY 3,000/ CNY 5,000", P4: "1,500元/ 3,000元/ 5,000元\nCNY 1,500/ CNY 3,000/ CNY 5,000" }, sharedGroup: "WELLNESS_IMMUNIZATION", sourceRow: 77 }),
    makeBenefit({ benefitId: "IMMUNIZATIONS", section: "wellness", cnName: "免疫费", enName: "Immunizations", baseValues: { P1: "1,500元/ 3,000元\nCNY 1,500/ CNY 3,000", P2: "1,500元/ 3,000元\nCNY 1,500/ CNY 3,000", P3: "1,500元/ 3,000元/ 5,000元\nCNY 1,500/ CNY 3,000/ CNY 5,000", P4: "1,500元/ 3,000元/ 5,000元\nCNY 1,500/ CNY 3,000/ CNY 5,000" }, sharedGroup: "WELLNESS_IMMUNIZATION", sourceRow: 78 }),
    makeBenefit({ benefitId: "INFLUENZA_VACCINE", section: "wellness", cnName: "流感疫苗", enName: "Influenza Vaccine", cnDescription: "仅限优选医疗机构（和睦家）；源表注明未选 wellness 时的赠送安排，需按业务确认", enDescription: "Preferred providers only; the source notes a gift arrangement when wellness is not selected and requires business confirmation", baseValues: { P1: "300元\nCNY 300", P2: "300元\nCNY 300", P3: "300元\nCNY 300", P4: "300元\nCNY 300" }, sourceRow: 79 }),
    makeBenefit({ benefitId: "ROUTINE_DENTAL", section: "dental", cnName: "常规牙科保障", enName: "Routine dental care", baseValues: { P1: "2,000元/ 5,000元\nCNY 2,000/ CNY 5,000", P2: "2,000元/ 5,000元\nCNY 2,000/ CNY 5,000", P3: "2,000元/ 5,000元/ 10,000元\nCNY 2,000/ CNY 5,000/ CNY 10,000", P4: "2,000元/ 5,000元/ 10,000元\nCNY 2,000/ CNY 5,000/ CNY 10,000" }, sharedGroup: "DENTAL_ANNUAL_LIMIT", sourceRow: 81 }),
    makeBenefit({ benefitId: "DENTAL_PREVENTIVE", section: "dental", cnName: "牙科预防治疗费", enName: "Preventive Treatment", baseValues: { P1: "1", P2: "1", P3: "1", P4: "1" }, sharedGroup: "DENTAL_ANNUAL_LIMIT", sourceRow: 82 }),
    makeBenefit({ benefitId: "DENTAL_BASIC", section: "dental", cnName: "牙科基础治疗费", enName: "Basic Treatment", baseValues: { P1: "0.8", P2: "0.8", P3: "0.8", P4: "0.8" }, sharedGroup: "DENTAL_ANNUAL_LIMIT", sourceRow: 83 }),
    makeBenefit({ benefitId: "DENTAL_MAJOR", section: "dental", cnName: "牙科重大治疗费", enName: "Major Treatment", baseValues: { P1: "0.5", P2: "0.5", P3: "0.5", P4: "0.5" }, sharedGroup: "DENTAL_ANNUAL_LIMIT", sourceRow: 84 }),
    makeBenefit({ benefitId: "DENTAL_ORTHODONTIC", section: "dental", cnName: "牙齿矫正", enName: "Orthodontic Treatment", baseValues: { P1: "不涵盖\nNot covered", P2: "不涵盖\nNot covered", P3: "不涵盖\nNot covered", P4: "不涵盖\nNot covered" }, sharedGroup: "DENTAL_ANNUAL_LIMIT", sourceRow: 85 }),
    makeBenefit({ benefitId: "VISION", section: "vision", cnName: "眼科检查及眼镜/隐形眼镜", enName: "Eye examination and glasses/contact lenses", cnDescription: "每一保单年度一次眼科检查及一副框架眼镜或隐形眼镜", enDescription: "One eye examination and one pair of glasses or contact lenses per policy year", baseValues: { P1: "1,000元\nCNY 1,000", P2: "1,000元\nCNY 1,000", P3: "1,000元\nCNY 1,000", P4: "1,000元\nCNY 1,000" }, sourceRow: 87 }),
  ]);

  const SOURCE_SECTIONS = Object.freeze({
    core: "核心责任 / Core Benefits",
    hospital: "医院范围与自付 / Hospital Scope and Co-payment",
    underwriting: "既往症与等待期 / Underwriting and Waiting Period",
    deductible: "免赔额与自付 / Deductibles and Co-payment",
    inpatient: "住院医疗 / Inpatient and Day-care Benefits",
    outpatient: "门诊医疗 / Outpatient Healthcare Benefits",
    special: "特殊疾病与项目 / Special Disease and Medical Care Benefits",
    assistance: "医疗及身故援助 / Medical Emergency and Death Assistance",
    maternity: "孕产和新生婴儿 / Maternity and Newborn Infant Care",
    wellness: "体检责任 / Wellness Benefits",
    dental: "牙科责任 / Dental Benefits",
    vision: "眼科责任 / Vision Benefits",
  });

  function planPremiumMap(values = {}) {
    return Object.freeze({ ...values });
  }

  const OPTIONALS = Object.freeze({
    maternity: [
      { code: "none", label: "不选生育 / No maternity", premiumByPlan: planPremiumMap({}) },
      { code: "m30", label: "生育保障 30,000元 / Maternity CNY 30,000", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 2580, P102: 2580, P103: 2580, P201: 2580, P202: 2580, P203: 2580, P3WWE: 3324, P4WWE: 3324, P4WW: 4992 }) },
      { code: "m60", label: "生育保障 60,000元 / Maternity CNY 60,000", allowedGroups: ["P3", "P4"], premiumByPlan: planPremiumMap({ P3WWE: 4836, P4WWE: 4836, P4WW: 7272 }) },
    ],
    wellness: [
      { code: "none", label: "不选体检/疫苗 / No wellness", premiumByPlan: planPremiumMap({}) },
      { code: "w1500", label: "体检及疫苗 1,500元 / Wellness CNY 1,500", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 1332, P102: 1332, P103: 1332, P201: 1332, P202: 1332, P203: 1332, P3WWE: 1332, P4WWE: 1332, P4WW: 1332 }) },
      { code: "w3000", label: "体检及疫苗 3,000元 / Wellness CNY 3,000", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 2472, P102: 2472, P103: 2472, P201: 2472, P202: 2472, P203: 2472, P3WWE: 2472, P4WWE: 2472, P4WW: 2472 }) },
      { code: "w5000", label: "体检及疫苗 5,000元 / Wellness CNY 5,000", allowedGroups: ["P3", "P4"], premiumByPlan: planPremiumMap({ P3WWE: 3672, P4WWE: 3672, P4WW: 3672 }) },
    ],
    dental: [
      { code: "none", label: "不选牙科 / No dental", premiumByPlan: planPremiumMap({}) },
      { code: "d2000", label: "牙科 2,000元 / Dental CNY 2,000", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 1920, P102: 1920, P103: 1920, P201: 1920, P202: 1920, P203: 1920, P3WWE: 1920, P4WWE: 1920, P4WW: 1920 }) },
      { code: "d5000", label: "牙科 5,000元 / Dental CNY 5,000", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 3408, P102: 3408, P103: 3408, P201: 3408, P202: 3408, P203: 3408, P3WWE: 3408, P4WWE: 3408, P4WW: 3408 }) },
      { code: "d10000", label: "牙科 10,000元（含正畸） / Dental CNY 10,000 incl. orthodontics", allowedGroups: ["P3", "P4"], premiumByPlan: planPremiumMap({ P3WWE: 6036, P4WWE: 6036, P4WW: 6036 }) },
      { code: "d10000no", label: "牙科 10,000元（不含正畸） / Dental CNY 10,000 excl. orthodontics", allowedGroups: ["P3", "P4"], premiumByPlan: planPremiumMap({ P3WWE: 4080, P4WWE: 4080, P4WW: 4080 }) },
    ],
    vision: [
      { code: "none", label: "不选眼科 / No vision", premiumByPlan: planPremiumMap({}) },
      { code: "v1000", label: "眼科 1,000元 / Vision CNY 1,000", allowedGroups: ["P1", "P2", "P3", "P4"], premiumByPlan: planPremiumMap({ P101: 960, P102: 960, P103: 960, P201: 960, P202: 960, P203: 960, P3WWE: 960, P4WWE: 960, P4WW: 960 }) },
    ],
  });

  const HCP = Object.freeze([
    "中国大陆 Mainland China",
    "和睦家医院和诊所（深圳和上海地区、北京地区的北京和睦家京北妇儿医院、北京和睦家中西医结合医院及北京地区卫星诊所不列入）\nUnited Family Hospitals and Clinics in all cities (excluding Shenzhen and Shanghai, Beijing United Family Women's and Children's Hospital, Beijing United Family Hospital of Integrative Medicine and satellite clinics in Beijing)",
    "莱佛士医疗北京/深圳/天津/天津泰达/南京/大连诊所（南京、天津、天津泰达、深圳国际（SOS）紧急救援诊所；北京国际（SOS）救援中心、大连安慎诊所）\nRaffles Medical Beijing/Shenzhen/Tianjin/Tianjin Taida/Nanjing/Dalian Clinics (International SOS Clinics in Nanjing, Tianjin, Tianjin Taida, Shenzhen, Beijing and Dalian)",
    "百汇医疗集团旗下医疗机构（除香港外的其它城市；除百汇馨康品牌旗下的医疗机构）\nAll the medical centers belong to Parkway Health Medical Centers in mainland China (except Hong Kong and all Shenton Health Clinics)",
    "上海全康医疗中心/上海众康门诊部\nAll Global HealthCare Clinics",
    "上海东方联合医院\nShanghai East International Medical Center",
    "上海红枫国际妇儿医院\nShanghai Redleaf International Women's Hospital",
    "北京善方医院\nSanfine International Hospital",
    "北京新世纪儿童医院\nBeijing New Century International Children's Hospital",
    "维世达诊所（北京）\nVista Clinic (Beijing)",
    "上海国际医学中心\nShanghai International Medical Center",
    "国际外科手术中心（广州或者其他城市）\nInstitute for Western Surgery (Guangzhou and other cities if any)",
    "香港 Hong Kong",
    "港安医院\nAll Adventist clinics and Medical Centers",
    "香港明德医院\nMatilda Hospital",
    "香港养和医院\nSanatorium Hospital",
    "港怡医院（香港）\nGleneagles Hospital Hong Kong",
    "新加坡 Singapore",
    "伊丽莎白医院（新加坡）\nMount Elizabeth Hospital (Singapore)",
    "伊丽莎白诺维娜医院（新加坡）\nMount Elizabeth Novena Hospital",
    "鹰阁医院（新加坡）\nGleneagles Hospital (Singapore)",
  ]);

  const PREAUTH_ITEMS = Object.freeze([
    "住院治疗（包括生育/分娩的住院）\nHospitalization, including baby deliveries.",
    "需全身麻醉的门诊手术、化学治疗、放射治疗、血液或者腹膜透析。\nOutpatient surgery requiring general anesthesia, chemotherapy, radiation therapy, blood or peritoneal dialysis.",
    "购买或者租用非一次性耐用医疗设备，包括但不限于胰岛素泵及其配套器械。\nPurchase or rental of Durable Medical Equipment (DME), including but not limited to insulin pumps and supplies.",
    "紧急医疗转运。\nEmergency Medical Evacuation.",
    "牙科意外伤害修补治疗。\nEmergency Dental Treatment.",
    "每剂超过人民币8,000元的药剂或者疫苗。\nMedications or Immunizations priced in excess of CNY 8,000 per refill.",
    "单价人民币8,000元以上的检查项目。\nExaminations of which the unit cost is CNY 8,000 or above.",
    "临终关怀。\nHospice care.",
    "专业护士家庭护理及专业护理。\nHome health nursing and skilled nursing care.",
  ]);

  const PEC = "重大疾病/症状列表 Catastrophic Disease/Condition List\n恶性肿瘤、癫痫、心脏病（心衰NYHA分级Ⅱ级以上）、三级高血压、心肌梗塞、重症肝炎、脑卒中、Ⅰ型糖尿病、系统性红斑狼疮、帕金森氏病、慢性肾脏病3级及以上、白血病、再生障碍性贫血、艾滋病、良性脑肿瘤（包含实体中瘤、垂体瘤、脑膜瘤、神经肿瘤、脑动脉瘤等其他源性的颅内肿瘤）、阿尔茨海默病、肺动脉高压、周围神经系统疾病、主动脉夹层、主动脉瘤、心肌病、脱髓鞘疾病、溃疡性结肠炎、急性坏死性胰腺炎、银屑病、强直性脊柱炎、克罗恩病、贝赫切特病、器官/主要肢体缺失或功能缺损、器官衰竭或移植、造血干细胞移植、冠心病、脊髓疾病。\n\nMalignant tumor, epilepsy, heart disease (heart failure NYHA class II or above), stage 3 hypertension, myocardial infarction, severe hepatitis, stroke, type 1 diabetes mellitus, systemic lupus erythematosus, Parkinson disease, chronic kidney disease stage 3 and above, leukemia, aplastic anemia, AIDS, benign intracranial tumors, Alzheimer disease, pulmonary hypertension, peripheral nervous system disorders, aortic dissection, aortic aneurysms, cardiomyopathies, demyelinating disorders, ulcerative colitis, acute necrotizing pancreatitis, psoriasis, ankylosing spondylitis, Crohn disease, Behcet disease, organ/major limb loss or functional impairment, organ failure or transplantation, hematopoietic stem cell transplantation, coronary artery disease, spinal cord disorders.";

  const SECTION_BY_BENEFIT = new Map(BENEFIT_DATA.map(item => [item.benefitId, item.section]));
  const OPTIONAL_SECTION_TYPES = Object.freeze({ maternity: "maternity", wellness: "wellness", dental: "dental", vision: "vision" });

  function getPlan(planOrCode) {
    if (!planOrCode) return null;
    return typeof planOrCode === "string" ? PLAN_BY_CODE.get(planOrCode) || null : PLAN_BY_CODE.get(planOrCode.code) || planOrCode;
  }

  function personAge(person) {
    if (!person || person.age === null || person.age === undefined || String(person.age).trim() === "") return null;
    const age = Number(person.age);
    return Number.isInteger(age) && age >= 0 && age <= 120 ? age : null;
  }

  function rateBandFor(age) {
    return RATE_BANDS.find(band => age >= band.min && age <= band.max) || null;
  }

  function rateFor(age, planOrCode) {
    const plan = getPlan(planOrCode);
    const band = Number.isInteger(age) ? rateBandFor(age) : null;
    if (!plan || !plan.rateColumn || !band) return null;
    return Object.prototype.hasOwnProperty.call(band.rates, plan.rateColumn) ? band.rates[plan.rateColumn] : null;
  }

  function numericManualRate(person) {
    if (!person || person.manualMedicalPremium === null || person.manualMedicalPremium === undefined || String(person.manualMedicalPremium).trim() === "") return null;
    const value = Number(person.manualMedicalPremium);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function isChild(person) { return person?.type === "child"; }
  function isAdult(person) { return person?.type === "employee" || person?.type === "spouse"; }

  function medicalPremiumFor(person, planOrCode) {
    const plan = getPlan(planOrCode);
    const age = personAge(person);
    const explicitStatus = Object.values(QUOTE_STATUSES).includes(person?.quoteStatus) ? person.quoteStatus : null;
    const manualRate = numericManualRate(person);
    if (!plan) return { status: QUOTE_STATUSES.PENDING_UW, premium: 0, reason: "UNKNOWN_PLAN", rateSource: null };
    if (isChild(person) && age !== null && age > 25) return { status: QUOTE_STATUSES.INELIGIBLE, premium: 0, reason: "CHILD_OVER_25", rateSource: null };
    if (explicitStatus === QUOTE_STATUSES.INELIGIBLE) return { status: QUOTE_STATUSES.INELIGIBLE, premium: 0, reason: "USER_MARKED_INELIGIBLE", rateSource: null };
    if (explicitStatus === QUOTE_STATUSES.MANUAL_RATE || manualRate !== null) {
      if (manualRate !== null) return { status: QUOTE_STATUSES.MANUAL_RATE, premium: manualRate, reason: "MANUAL_RATE", rateSource: "manualMedicalPremium" };
      return { status: QUOTE_STATUSES.PENDING_UW, premium: 0, reason: "MANUAL_RATE_MISSING", rateSource: null };
    }
    if (explicitStatus === QUOTE_STATUSES.PENDING_UW) return { status: QUOTE_STATUSES.PENDING_UW, premium: 0, reason: "USER_MARKED_PENDING", rateSource: null };
    if (age === null) return { status: QUOTE_STATUSES.PENDING_UW, premium: 0, reason: "MISSING_AGE", rateSource: null };
    const automaticRate = rateFor(age, plan);
    if (automaticRate === null) {
      return { status: QUOTE_STATUSES.PENDING_UW, premium: 0, reason: plan.rateColumn ? "AGE_OUT_OF_AUTOMATIC_RANGE" : "RATE_COLUMN_MISSING", rateSource: plan.rateColumn || null };
    }
    return { status: QUOTE_STATUSES.AUTO_QUOTABLE, premium: automaticRate, reason: "RATE_TABLE", rateSource: plan.rateColumn };
  }

  function getOptional(type, code) {
    return (OPTIONALS[type] || []).find(option => option.code === (code || "none")) || null;
  }

  function optionalPremiumFor(variant = {}, planOrCode) {
    const plan = getPlan(planOrCode);
    if (!plan) return { premium: 0, pending: true, invalid: true, details: [] };
    const details = [];
    let premium = 0;
    let pending = false;
    let invalid = false;
    Object.keys(OPTIONAL_SECTION_TYPES).forEach(type => {
      const code = variant[type] || "none";
      if (code === "none") return;
      const option = getOptional(type, code);
      if (!option) { invalid = true; details.push({ type, code, label: "未知可选福利 / Unknown option", premium: null }); return; }
      if (option.allowedGroups && !option.allowedGroups.includes(plan.group)) { invalid = true; details.push({ type, code, label: option.label, premium: null, reason: "NOT_AVAILABLE" }); return; }
      const value = Object.prototype.hasOwnProperty.call(option.premiumByPlan, plan.code) ? option.premiumByPlan[plan.code] : null;
      if (value === null || value === undefined) pending = true;
      else premium += value;
      details.push({ type, code, label: option.label, premium: value });
    });
    return { premium, pending, invalid, details };
  }

  function optionalPremium(variant, planOrCode) {
    return optionalPremiumFor(variant, planOrCode).premium;
  }

  function medicalDiscountRate(variant = {}, options = {}) {
    return (variant.preExisting === "fmu" ? 0.05 : 0) + (options.pcpDirectBilling ? 0.03 : 0);
  }

  function premiumBreakdown(person, variant, state = {}) {
    const plan = getPlan(variant?.planCode);
    const medical = medicalPremiumFor(person, plan);
    const optional = medical.status === QUOTE_STATUSES.AUTO_QUOTABLE || medical.status === QUOTE_STATUSES.MANUAL_RATE
      ? optionalPremiumFor(variant, plan)
      : { premium: 0, pending: false, invalid: false, details: [] };
    const discount = medical.premium * medicalDiscountRate(variant, state);
    return {
      baseMedical: medical.premium,
      discount,
      optional: optional.premium,
      total: medical.premium - discount + optional.premium,
      status: medical.status,
      reason: medical.reason,
      optionalPending: optional.pending,
      optionalInvalid: optional.invalid,
      optionalDetails: optional.details,
    };
  }

  function personPremium(person, variant, state = {}) { return premiumBreakdown(person, variant, state).total; }

  function variantForPerson(person, state = {}) {
    if (!person) return "";
    if (state.mode === "compare") return "";
    if (person.type !== "employee" && person.relatedEmployeeId) {
      const employee = (state.people || []).find(item => item.type === "employee" && item.employeeId === person.relatedEmployeeId);
      if (employee) {
        const inherited = employee.assignment || employee.plan || "";
        const assignedVariant = (state.variants || []).find(variant => variant.id === inherited || variant.planCode === inherited);
        return assignedVariant?.id || inherited;
      }
    }
    if (person.assignment) {
      const assignedVariant = (state.variants || []).find(variant => variant.id === person.assignment || variant.planCode === person.assignment);
      if (assignedVariant) return assignedVariant.id;
    }
    if (person.plan) return (state.variants || []).find(variant => variant.planCode === person.plan)?.id || person.plan;
    return person.assignment || "";
  }

  function membersForVariant(state = {}, variant) {
    const people = Array.isArray(state.people) ? state.people : [];
    if (state.mode === "compare") return people;
    return people.filter(person => variantForPerson(person, state) === variant.id);
  }

  function relevantMembers(state, variant) {
    return membersForVariant(state, variant);
  }

  function addMessage(messages, level, code, message, extra = {}) {
    messages.push({ level, code, message, ...extra });
  }

  function validate(state = {}) {
    const messages = [];
    const people = Array.isArray(state.people) ? state.people : [];
    const variants = Array.isArray(state.variants) ? state.variants : [];
    const employees = people.filter(person => person.type === "employee");
    if (people.length < 3) addMessage(messages, VALIDATION_LEVELS.ERROR, "MIN_MEMBERS", "被保险人至少 3 人 / At least 3 insured members are required.");
    if (employees.length < 2) addMessage(messages, VALIDATION_LEVELS.ERROR, "MIN_EMPLOYEES", "员工至少 2 人 / At least 2 employees are required.");
    if (!variants.length) addMessage(messages, VALIDATION_LEVELS.ERROR, "NO_VARIANTS", "至少建立一个报价方案 / Create at least one quotation variant.");

    people.forEach(person => {
      const age = personAge(person);
      if (age === null) addMessage(messages, VALIDATION_LEVELS.ERROR, "MISSING_AGE", `${person.name || person.id || "人员"} 缺少有效年龄 / valid age is required.`, { personId: person.id });
      if (isChild(person) && age !== null && age > 25) addMessage(messages, VALIDATION_LEVELS.ERROR, "CHILD_OVER_25", `${person.name || person.id || "子女"} 超过 25 岁，不符合本次报价条件 / child age is above 25.`, { personId: person.id });
      if (person.manualMedicalPremium !== null && person.manualMedicalPremium !== undefined && String(person.manualMedicalPremium).trim() !== "" && numericManualRate(person) === null) {
        addMessage(messages, VALIDATION_LEVELS.ERROR, "INVALID_MANUAL_RATE", `${person.name || person.id || "人员"} 的人工医疗费率必须为正数 / manual medical premium must be positive.`, { personId: person.id });
      }
    });
    const adultAges = people.filter(isAdult).map(personAge);
    if (adultAges.length && adultAges.every(age => age !== null)) {
      const average = adultAges.reduce((sum, age) => sum + age, 0) / adultAges.length;
      if (average >= 55) addMessage(messages, VALIDATION_LEVELS.ERROR, "AVERAGE_ADULT_AGE", "成人被保险人平均年龄必须低于 55 岁 / average adult age must be below 55.");
    }

    const planCodes = new Set(variants.map(variant => variant.planCode).filter(Boolean));
    if (state.mode !== "compare" && variants.length) {
      const maxPlans = employees.length <= 5 ? 1 : 2;
      if (planCodes.size > maxPlans) addMessage(messages, VALIDATION_LEVELS.ERROR, "GROUP_PLAN_LIMIT", `分组模式下当前有 ${planCodes.size} 个唯一 Plan，员工人数允许最多 ${maxPlans} 个 / Group mode allows at most ${maxPlans} unique Plans.`);
      employees.forEach(person => {
        if (!variantForPerson(person, state)) addMessage(messages, VALIDATION_LEVELS.ERROR, "EMPLOYEE_ASSIGNMENT", `${person.name || person.id || "员工"} 尚未分配报价方案 / employee assignment is required.`, { personId: person.id });
      });
    }
    variants.forEach(variant => {
      if (!getPlan(variant.planCode)) addMessage(messages, VALIDATION_LEVELS.ERROR, "UNKNOWN_PLAN", `报价方案 ${variant.name || variant.id || "未命名"} 使用了未知 Plan / unknown Plan.`, { variantId: variant.id });
    });

    const seenManual = new Set();
    variants.forEach(variant => {
      const plan = getPlan(variant.planCode);
      if (!plan) return;
      relevantMembers(state, variant).forEach(person => {
        const medical = medicalPremiumFor(person, plan);
        const key = `${person.id || person.name || "person"}:${variant.id || variant.planCode}`;
        if (medical.status === QUOTE_STATUSES.INELIGIBLE) {
          addMessage(messages, VALIDATION_LEVELS.ERROR, "INELIGIBLE_MEMBER", `${person.name || person.id || "人员"} 不符合 ${plan.code} 报价条件 / member is ineligible for this Plan.`, { personId: person.id, variantId: variant.id });
        } else if (medical.status === QUOTE_STATUSES.PENDING_UW && ["AGE_OUT_OF_AUTOMATIC_RANGE", "RATE_COLUMN_MISSING", "MANUAL_RATE_MISSING", "USER_MARKED_PENDING"].includes(medical.reason)) {
          if (!seenManual.has(key)) {
            addMessage(messages, VALIDATION_LEVELS.MANUAL_REVIEW, "MANUAL_RATE_REQUIRED", `${person.name || person.id || "人员"}：单独核保 / 待人工费率；该人员不计入自动医疗总保费 / separate underwriting; pending manual rate.`, { personId: person.id, variantId: variant.id });
            seenManual.add(key);
          }
        } else if (medical.status === QUOTE_STATUSES.MANUAL_RATE && !seenManual.has(key)) {
          addMessage(messages, VALIDATION_LEVELS.MANUAL_REVIEW, "MANUAL_RATE_USED", `${person.name || person.id || "人员"} 使用人工医疗费率，需人工复核 / manual medical rate used; review required.`, { personId: person.id, variantId: variant.id });
          seenManual.add(key);
        }
      });
    });

    const maternityVariants = variants.filter(variant => (variant.maternity || "none") !== "none");
    if (maternityVariants.length) {
      if (employees.length < 5) addMessage(messages, VALIDATION_LEVELS.ERROR, "MATERNITY_MIN_EMPLOYEES", "选择生育福利时员工至少 5 人 / maternity requires at least 5 employees.");
      if (variants.some(variant => (variant.maternity || "none") === "none")) addMessage(messages, VALIDATION_LEVELS.ERROR, "MATERNITY_ALL_VARIANTS", "有一个方案选择生育时，所有已选方案必须包含生育 / all selected variants must include maternity when one does.");
      addMessage(messages, VALIDATION_LEVELS.WARNING, "MATERNITY_THREE_YEAR", "生育福利 3 年内不可变更；当前报价器没有历史保单数据，仅作提示，不伪造历史校验 / maternity cannot change for 3 years; no historical policy data is available, so this is a warning only.");
    }
    variants.forEach(variant => {
      const plan = getPlan(variant.planCode);
      if (!plan) return;
      Object.keys(OPTIONAL_SECTION_TYPES).forEach(type => {
        const code = variant[type] || "none";
        if (code === "none") return;
        const option = getOptional(type, code);
        if (!option) return;
        if (option.allowedGroups && !option.allowedGroups.includes(plan.group)) addMessage(messages, VALIDATION_LEVELS.ERROR, "OPTIONAL_NOT_AVAILABLE", `${plan.code} 不支持所选${type}福利 / selected ${type} benefit is not available.`, { variantId: variant.id });
        if (!Object.prototype.hasOwnProperty.call(option.premiumByPlan, plan.code)) addMessage(messages, VALIDATION_LEVELS.MANUAL_REVIEW, "OPTIONAL_RATE_REQUIRED", `${plan.code} 的${type}费率在原始表中未确认 / ${type} premium is not confirmed for this Plan.`, { variantId: variant.id });
      });
    });
    return messages;
  }

  function variantLabel(variant, index = 0) {
    const plan = getPlan(variant?.planCode);
    return `方案 ${index + 1}\n${plan?.code || variant?.planCode || "未知 Plan"} · ${variant?.name || "未命名方案"}`;
  }

  function columnName(index) {
    let value = index + 1;
    let name = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value));
  }

  function displayStatus(status) {
    return {
      [QUOTE_STATUSES.AUTO_QUOTABLE]: "可自动报价 / AUTO_QUOTABLE",
      [QUOTE_STATUSES.MANUAL_RATE]: "人工费率 / MANUAL_RATE",
      [QUOTE_STATUSES.PENDING_UW]: "单独核保 / 待人工费率 / PENDING_UW",
      [QUOTE_STATUSES.INELIGIBLE]: "不符合条件 / INELIGIBLE",
    }[status] || status || "待确认 / PENDING";
  }

  function displayMemberPremium(breakdown) {
    if (breakdown.status === QUOTE_STATUSES.INELIGIBLE) return "不符合条件 / Ineligible";
    if (breakdown.status === QUOTE_STATUSES.PENDING_UW) return "单独核保 / 待人工费率";
    return money(breakdown.total);
  }

  function totalsForVariant(state, variant) {
    return membersForVariant(state, variant).reduce((total, person) => {
      const breakdown = premiumBreakdown(person, variant, state);
      total.baseMedical += breakdown.baseMedical;
      total.discount += breakdown.discount;
      total.optional += breakdown.optional;
      total.total += breakdown.total;
      if (breakdown.status === QUOTE_STATUSES.PENDING_UW) total.pending += 1;
      if (breakdown.status === QUOTE_STATUSES.INELIGIBLE) total.ineligible += 1;
      return total;
    }, { baseMedical: 0, discount: 0, optional: 0, total: 0, pending: 0, ineligible: 0 });
  }

  function benefitDisplayName(item) {
    const description = item.cnDescription !== item.cnName || item.enDescription !== item.enName
      ? `\n\n${item.cnDescription}\n${item.enDescription}`
      : "";
    return `${item.cnName}\n${item.enName}${description}`;
  }

  function selectedOptionLabel(variant, type) {
    return getOptional(type, variant?.[type] || "none")?.label || "未选择 / Not selected";
  }

  function isOptionalSelected(variant, item) {
    const type = item.section;
    return (variant?.[type] || "none") !== "none";
  }

  function buildTobSheet(variant, index) {
    const plan = getPlan(variant?.planCode);
    const rows = [
      [`${variantLabel(variant, index)}\nTable of Benefits`],
      ["Plan / 计划", plan ? `${plan.code} · ${plan.name}${plan.option ? ` ${plan.option}` : ""}` : "未知 Plan", "区域 / Area", plan?.area || ""],
      ["所选可选福利 / Selected Options", `生育：${selectedOptionLabel(variant, "maternity")}\n体检：${selectedOptionLabel(variant, "wellness")}\n牙科：${selectedOptionLabel(variant, "dental")}\n眼科：${selectedOptionLabel(variant, "vision")}`, "Source", SOURCE_WORKBOOK],
      ["福利责任 Benefit", "赔付限额/责任 Coverage and Limit", "共享责任组 Shared Group", "来源 Source"],
    ];
    const rowStyles = ["title", "meta", "meta", "header"];
    let previousSection = null;
    BENEFIT_DATA.forEach(item => {
      if (item.section !== previousSection) {
        rows.push([SOURCE_SECTIONS[item.section], "", "", `福利表!A${item.sourceRow}`]);
        rowStyles.push("section");
        previousSection = item.section;
      }
      const selected = isOptionalSelected(variant, item);
      let coverage = selected || !["maternity", "wellness", "dental", "vision"].includes(item.section)
        ? item.planValues[plan?.code] ?? null
        : "未选择 / Not selected";
      if (coverage === null) {
        coverage = item.sharedGroup
          ? "与共享责任组共用同一限额；本行不重复计入\nShared limit; not duplicated on this row"
          : "福利表该计划未列明\nNot listed for this Plan";
      }
      rows.push([benefitDisplayName(item), coverage, item.sharedGroup || "—", `${item.sourceSheet}!A${item.sourceRow}`]);
      rowStyles.push("body");
    });
    return { name: `方案${index + 1} TOB`, rows, rowStyles, widths: [52, 58, 28, 24], merges: ["A1:D1"] };
  }

  function buildQuotationSheet(state, variants) {
    const rows = [
      ["Prosper × Marsh SME 团体医疗保险报价表 Group Medical Insurance Quotation"],
      ["文件版本 File Version", "Core Reliability v4 · Source: " + SOURCE_WORKBOOK],
      ["团体中文名称 Company Name (Chinese)", state.companyCn || ""],
      ["团体英文名称 Company Name (English)", state.companyEn || ""],
      ["保障期限 Policy Period", `${state.startDate || ""} 至 / to ${state.endDate || ""}`],
      ["支付条件 Payment Condition", state.pcpDirectBilling ? "PCP 首诊直付服务（急诊除外）；医疗保费下调3%\nPCP direct billing; 3% medical discount" : "未选择 PCP 首诊直付服务\nPCP direct billing not selected"],
      ["报价模式 Quotation Mode", state.mode === "compare" ? "同一批人员多方案比价 / Compare" : "按人员分配不同方案 / Group"],
      ["保费汇总 Premium Summary", ...variants.map(variantLabel)],
      ["参保人数 Insured Members", ...variants.map(variant => `${membersForVariant(state, variant).length} 人 / members`)],
      ["基础医疗保费 Base Medical Premium", ...variants.map(variant => totalsForVariant(state, variant).baseMedical)],
      ["医疗保费优惠 Medical Discount", ...variants.map(variant => totalsForVariant(state, variant).discount)],
      ["可选福利保费 Optional Benefits Premium", ...variants.map(variant => totalsForVariant(state, variant).optional)],
      ["最终保费 Total Premium", ...variants.map(variant => totalsForVariant(state, variant).total)],
      ["人员保费明细 Member Premium Details", ...variants.map(variant => `${variant.planCode} · ${variant.name || "未命名方案"}`)],
      ["序号 No.", "姓名/编号 Name", "人员类型 Type", "年龄 Age", ...variants.flatMap(variant => [`${variant.planCode}\n状态 / Status`, `${variant.planCode}\n人工医疗费率 / Manual Rate`, `${variant.planCode}\n个人最终保费 / Individual Total`])],
    ];
    const rowStyles = ["title", "meta", "meta", "meta", "meta", "meta", "meta", "section", "body", "body", "body", "body", "header", "section", "header"];
    const typeLabel = { employee: "员工\nEmployee", spouse: "配偶\nSpouse", child: "子女\nChild" };
    state.people.forEach((person, index) => {
      const cells = [index + 1, person.name || person.id || "", typeLabel[person.type] || person.type || "", personAge(person) ?? ""];
      variants.forEach(variant => {
        const isMember = membersForVariant(state, variant).includes(person);
        if (!isMember) { cells.push("—", "—", "—"); return; }
        const breakdown = premiumBreakdown(person, variant, state);
        const medical = medicalPremiumFor(person, getPlan(variant.planCode));
        cells.push(displayStatus(breakdown.status), medical.status === QUOTE_STATUSES.MANUAL_RATE ? medical.premium : "—", displayMemberPremium(breakdown));
      });
      rows.push(cells);
      rowStyles.push("body");
    });
    const widths = [8, 24, 18, 10, ...variants.flatMap(() => [27, 22, 24])];
    return { name: "报价 Quotation", rows, rowStyles, widths, merges: [`A1:${columnName(widths.length - 1)}1`] };
  }

  function buildPremiumSheet(state, variants) {
    const rows = [
      ["费率表 Premium"],
      ["来源 Source", SOURCE_WORKBOOK, "费率工作表 / Rate Sheet", SOURCE_SHEET_RATES],
      ["计划 / Plan", ...variants.map(variantLabel)],
      ["区域 / Area", ...variants.map(variant => getPlan(variant.planCode)?.area || "")],
      ["费率列 / Rate Column", ...variants.map(variant => getPlan(variant.planCode)?.rateColumn || "NEEDS_CONFIRMATION")],
      ["年龄段 / Age Band", ...variants.map(variant => `${variant.planCode}\n每人医疗费率 / Medical Rate`)],
    ];
    const rowStyles = ["title", "meta", "header", "meta", "meta", "header"];
    RATE_BANDS.forEach(band => {
      rows.push([band.label, ...variants.map(variant => {
        const plan = getPlan(variant.planCode);
        const rate = rateFor(band.min, plan);
        return rate === null ? "单独核保 / 待人工费率" : rate;
      })]);
      rowStyles.push("body");
    });
    rows.push(["70-75*", ...variants.map(() => "单独核保 / 待人工费率")]);
    rowStyles.push("section");
    rows.push(["可选福利 / Optional Benefits", ...variants.map(variant => Object.keys(OPTIONAL_SECTION_TYPES).map(type => selectedOptionLabel(variant, type)).join("\n"))]);
    rowStyles.push("section");
    rows.push(["可选福利保费 / Optional Premium", ...variants.map(variant => {
      const plan = getPlan(variant.planCode);
      const optional = optionalPremiumFor(variant, plan);
      return optional.pending ? "单独核保 / 待人工费率" : optional.premium;
    })]);
    rowStyles.push("body");
    const widths = [24, ...variants.map(() => 32)];
    return { name: "费率 Premium", rows, rowStyles, widths, merges: [`A1:${columnName(widths.length - 1)}1`] };
  }

  function buildListSheet(name, title, values, widths = [8, 110]) {
    const rows = [[title], ...values.map((value, index) => [index + 1, value])];
    return { name, rows, rowStyles: ["title", ...values.map(() => "body")], widths, merges: ["A1:B1"] };
  }

  function buildEligibilitySheet() {
    const values = [
      "最低投保人数：被保险人≥3人，员工≥2人。\nMinimum participation: at least 3 insured persons, including at least 2 employees.",
      "本轮为新业务报价；65-69岁有自动费率并可报价，70岁及以上或原始表缺少自动费率时进入单独核保。\nThis is new business; ages 65-69 are auto-quotable, while age 70+ or a missing source rate requires separate underwriting.",
      "子女最大年龄为25岁；22-25岁不额外触发人工核保，超过25岁为不符合条件。\nChildren are eligible through age 25; ages 22-25 do not trigger extra underwriting, and above 25 is ineligible.",
      "成人被保险人平均年龄必须低于55岁。\nAverage adult insured age must be below 55.",
      "员工≤5人最多1个唯一Plan；员工>5人最多2个唯一Plan。重复同一Plan的变体不重复计数。\nGroup mode allows at most 1 unique Plan for up to 5 employees and 2 for more than 5; repeated variants of one Plan count once.",
      "Compare模式使用同一批人员跨所有变体比较，不按员工人数限制Plan数量。\nCompare mode uses the same people across variants and does not impose the Group Plan-count limit.",
      "核保状态：AUTO_QUOTABLE、MANUAL_RATE、PENDING_UW、INELIGIBLE；待人工费率不计入自动医疗总保费，也不以0冒充。\nQuote statuses are AUTO_QUOTABLE, MANUAL_RATE, PENDING_UW and INELIGIBLE; pending rates are excluded from automatic medical totals and never represented as a silent zero.",
      "选择生育需要员工≥5人，且所有已选方案均包含生育；生育3年内不可变更仅作提示，当前无历史数据不执行伪造校验。\nMaternity requires at least 5 employees and inclusion in every selected variant; the three-year rule is warning-only because no policy history is available.",
      "妊娠并发症不与孕产费共享，按福利表独立责任呈现；HCP列表始终完整输出。\nPregnancy complications are independent from maternity childbirth and are rendered from their own source row; the HCP list is always complete.",
    ];
    return buildListSheet("参保条件 Eligibility", "参保条件 / Participation Conditions", values, [8, 120]);
  }

  function buildPreauthSheet() {
    const rows = [["事先授权说明 / Pre-authorization"]];
    const rowStyles = ["title"];
    rows.push(["接受下列治疗前，被保险人须在预定开始治疗日期前至少两个工作日向医疗服务供应商提交事先授权申请表（附有关病历、诊断报告等）。\nMember must submit the Pre-authorization request with related medical documents and diagnostic reports at least two working days before the scheduled treatment."]);
    rowStyles.push("section");
    PREAUTH_ITEMS.forEach((item, index) => { rows.push([index + 1, item]); rowStyles.push("body"); });
    rows.push(["注意 / Note", "紧急情况下须在开始接受治疗后48小时内通知；未获授权或未及时通知的，按合同计算金额的60%给付。\nFor emergency situations, notify us within 48 hours. If pre-authorization is not obtained or notice is late, only 60% of the amount calculated under the contract is payable."]);
    rowStyles.push("section");
    return { name: "预授权 Pre-auth", rows, rowStyles, widths: [10, 120], merges: ["A1:B1"] };
  }

  function buildWorkbookModel(state = {}) {
    const variants = Array.isArray(state.variants) ? state.variants : [];
    const sheets = [buildQuotationSheet(state, variants), buildPremiumSheet(state, variants), ...variants.map(buildTobSheet), buildListSheet("昂贵医院 List of HCPs", "昂贵医疗机构列表 / List of High Cost Providers", HCP), buildEligibilitySheet(), buildPreauthSheet(), buildListSheet("重大既往症 Catastrophic PEC", "重大既往症列表 / Catastrophic Pre-existing Condition List", [PEC], [8, 120])];
    return {
      metadata: { sourceWorkbook: SOURCE_WORKBOOK, sourceSheets: [SOURCE_SHEET_BENEFITS, SOURCE_SHEET_RATES, "昂贵医院List of HCPs", "事先授权 Pre-authorization request", "重大既往症列表"], generatedBy: "PP & Prosper SME Core Reliability v4" },
      sheets,
    };
  }

  return {
    SOURCE_WORKBOOK,
    RATE_COLUMNS,
    RATE_BANDS,
    PLANS,
    OPTIONALS,
    BENEFIT_DATA,
    SOURCE_SECTIONS,
    HCP,
    PREAUTH_ITEMS,
    PEC,
    QUOTE_STATUSES,
    VALIDATION_LEVELS,
    getPlan,
    getOptional,
    personAge,
    rateFor,
    medicalPremiumFor,
    optionalPremiumFor,
    optionalPremium,
    medicalDiscountRate,
    premiumBreakdown,
    personPremium,
    variantForPerson,
    membersForVariant,
    validate,
    variantLabel,
    columnName,
    displayStatus,
    money,
    totalsForVariant,
    buildTobSheet,
    buildWorkbookModel,
  };
}));
