/* Browser UI for the pure Core Reliability v4 quotation model. */
(function startQuotationApp() {
  "use strict";

  const core = window.QuoteCore;
  const XLSX = window.XLSX;
  if (!core) throw new Error("QuoteCore is required before app.js");

  const $ = id => document.getElementById(id);
  const OPTIONAL_TYPES = ["maternity", "wellness", "dental", "vision"];
  const STATUS_OPTIONS = [
    [core.QUOTE_STATUSES.AUTO_QUOTABLE, "自动报价"],
    [core.QUOTE_STATUSES.MANUAL_RATE, "人工费率"],
    [core.QUOTE_STATUSES.PENDING_UW, "单独核保 / 待人工费率"],
    [core.QUOTE_STATUSES.INELIGIBLE, "不符合条件"],
  ];
  const STORAGE_KEY = "pp_prosper_sme_quote_state_v4";
  const LEGACY_STORAGE_KEYS = ["pp_prosper_sme_quote_state_v1", "pp_prosper_sme_quote_state_v2", "pp_prosper_sme_quote_state_v3"];
  const TYPE_LABEL = { employee: "员工", spouse: "配偶", child: "子女" };

  let people = [];
  let selectedPlanCodes = [];
  let quoteVariants = [];
  let quoteMode = "group";
  let copayOption = "none";
  let preExistingOption = "standard";

  function todayString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function makeId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function makeVariant(planCode, source = {}) {
    const samePlan = quoteVariants.filter(variant => variant.planCode === planCode).length + 1;
    return {
      id: source.id || makeId(planCode),
      planCode,
      name: source.name || `报价方案 ${samePlan}`,
      maternity: source.maternity || "none",
      wellness: source.wellness || "none",
      dental: source.dental || "none",
      vision: source.vision || "none",
      copay: source.copay || copayOption,
      preExisting: source.preExisting || preExistingOption,
    };
  }

  function normalizePerson(person = {}, index = 0) {
    return {
      id: person.id || makeId(`person-${index + 1}`),
      name: person.name || "",
      type: person.type || "employee",
      employeeId: person.employeeId || "",
      relatedEmployeeId: person.relatedEmployeeId || "",
      gender: person.gender || "",
      dob: person.dob || "",
      age: person.age ?? "",
      assignment: person.assignment || "",
      plan: person.plan || "",
      quoteStatus: person.quoteStatus || "",
      manualMedicalPremium: person.manualMedicalPremium ?? "",
      nature: "new",
    };
  }

  function coreState() {
    return {
      companyCn: $("companyCn").value,
      companyEn: $("companyEn").value,
      startDate: $("startDate").value,
      endDate: $("endDate").value,
      pcpDirectBilling: $("pcpDirectBilling").checked,
      preExistingOption,
      copayOption,
      mode: quoteMode,
      people,
      variants: quoteVariants,
      selectedPlanCodes,
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(coreState()));
    } catch {
      // File URLs may disallow localStorage; the in-memory quote remains usable.
    }
  }

  function loadState() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
    if (!raw) return false;
    try {
      const state = JSON.parse(raw);
      const storedVariants = Array.isArray(state.variants || state.quoteVariants) ? (state.variants || state.quoteVariants) : [];
      const storedCopay = typeof state.copayOption === "string" ? core.getCopay(state.copayOption) : null;
      const storedPreExisting = typeof state.preExistingOption === "string" ? core.getPreExisting(state.preExistingOption) : null;
      copayOption = storedCopay?.code || (storedVariants.some(variant => variant.copay === "outpatient_from_sixth_20") ? "outpatient_from_sixth_20" : "none");
      preExistingOption = storedPreExisting?.code || (storedVariants.some(variant => variant.preExisting === "fmu") ? "fmu" : "standard");
      people = Array.isArray(state.people) ? state.people.map(normalizePerson) : [];
      selectedPlanCodes = Array.isArray(state.selectedPlanCodes) ? state.selectedPlanCodes.filter(code => core.getPlan(code)) : [];
      quoteVariants = storedVariants
        .filter(variant => core.getPlan(variant.planCode))
        .map(variant => makeVariant(variant.planCode, { ...variant, copay: copayOption, preExisting: preExistingOption }));
      quoteMode = state.mode === "compare" || state.quoteMode === "compare" ? "compare" : "group";
      $("companyCn").value = typeof state.companyCn === "string" ? state.companyCn : "";
      $("companyEn").value = typeof state.companyEn === "string" ? state.companyEn : "";
      $("startDate").value = typeof state.startDate === "string" && state.startDate ? state.startDate : todayString();
      $("pcpDirectBilling").checked = state.pcpDirectBilling === true;
      selectedPlanCodes.forEach(code => { if (!quoteVariants.some(variant => variant.planCode === code)) quoteVariants.push(makeVariant(code)); });
      quoteVariants.forEach(variant => { if (!selectedPlanCodes.includes(variant.planCode)) selectedPlanCodes.push(variant.planCode); });
      applyGlobalCoreOptions();
      return true;
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return false;
    }
  }

  function ageAtStart(dob) {
    if (!dob) return null;
    const startValue = $("startDate").value || todayString();
    const start = new Date(`${startValue}T00:00:00`);
    const born = new Date(`${dob}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(born.getTime())) return null;
    let age = start.getFullYear() - born.getFullYear();
    const birthdayNotReached = start.getMonth() < born.getMonth() || (start.getMonth() === born.getMonth() && start.getDate() < born.getDate());
    if (birthdayNotReached) age -= 1;
    return age >= 0 ? age : null;
  }

  function updateEndDate() {
    const startValue = $("startDate").value;
    if (!startValue) { $("endDate").value = ""; return; }
    const start = new Date(`${startValue}T00:00:00`);
    if (Number.isNaN(start.getTime())) return;
    start.setDate(start.getDate() + 364);
    $("endDate").value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  }

  function selectedPlans() { return selectedPlanCodes.map(code => core.getPlan(code)).filter(Boolean); }
  function selectedVariantsForPlan(planCode) { return quoteVariants.filter(variant => variant.planCode === planCode); }

  function applyGlobalCoreOptions() {
    quoteVariants.forEach(variant => {
      variant.copay = copayOption;
      variant.preExisting = preExistingOption;
    });
  }

  function personPlan(person) {
    if (quoteMode === "compare") return selectedPlans()[0] || null;
    const variantId = core.variantForPerson(person, coreState());
    const variant = quoteVariants.find(item => item.id === variantId) || quoteVariants.find(item => item.planCode === variantId);
    return variant ? core.getPlan(variant.planCode) : null;
  }

  function calculatedStatus(person) {
    const plan = personPlan(person);
    return core.medicalPremiumFor(person, plan)?.status || core.QUOTE_STATUSES.AUTO_QUOTABLE;
  }

  function rowClass(status) {
    return {
      [core.QUOTE_STATUSES.AUTO_QUOTABLE]: "row-auto",
      [core.QUOTE_STATUSES.MANUAL_RATE]: "row-manual",
      [core.QUOTE_STATUSES.PENDING_UW]: "row-pending",
      [core.QUOTE_STATUSES.INELIGIBLE]: "row-ineligible",
    }[status] || "row-auto";
  }

  function appendText(parent, tag, text, className = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function setPersonField(person, field, value) {
    if (field === "age") person.age = value === "" ? "" : Number(value);
    else if (field === "manualMedicalPremium") {
      person.manualMedicalPremium = value === "" ? "" : Number(value);
      person.quoteStatus = value === "" ? "" : core.QUOTE_STATUSES.MANUAL_RATE;
    } else if (field === "quoteStatus") {
      person.quoteStatus = value;
      if (value !== core.QUOTE_STATUSES.MANUAL_RATE) person.manualMedicalPremium = "";
    } else person[field] = value;
    if (field === "dob") person.age = ageAtStart(person.dob) ?? "";
    if (field === "type" && person.type === "employee") person.relatedEmployeeId = "";
    if (field === "type" && person.type !== "employee") person.employeeId = "";
  }

  function renderPeople() {
    const tbody = $("peopleTable").tBodies[0];
    tbody.replaceChildren();
    const state = coreState();
    people.forEach((person, index) => {
      const row = $("personRowTemplate").content.firstElementChild.cloneNode(true);
      row.dataset.personId = person.id;
      const statusElement = row.querySelector('[data-field="quoteStatus"]');
      const computedStatus = calculatedStatus(person);
      const status = person.quoteStatus && person.quoteStatus !== core.QUOTE_STATUSES.AUTO_QUOTABLE ? person.quoteStatus : computedStatus;
      row.className = rowClass(status);
      row.querySelectorAll("[data-field]").forEach(element => {
        const field = element.dataset.field;
        if (field === "assignment" || field === "quoteStatus") return;
        element.value = person[field] ?? "";
        element.addEventListener("input", () => { setPersonField(person, field, element.value); saveState(); });
        element.addEventListener("change", () => { setPersonField(person, field, element.value); saveState(); update(); });
        if (field === "age" || field === "manualMedicalPremium") element.addEventListener("blur", () => { setPersonField(person, field, element.value); saveState(); update(); });
        if (field === "employeeId") {
          element.disabled = person.type !== "employee";
          element.placeholder = person.type === "employee" ? "员工编号" : "家属无需填写";
        }
        if (field === "relatedEmployeeId") {
          element.disabled = person.type === "employee";
          element.placeholder = person.type === "employee" ? "员工无需填写" : "关联员工编号";
        }
      });
      statusElement.value = status;
      statusElement.addEventListener("change", () => { setPersonField(person, "quoteStatus", statusElement.value); saveState(); update(); });
      const manualRate = row.querySelector('[data-field="manualMedicalPremium"]');
      manualRate.value = person.manualMedicalPremium ?? "";

      const assignment = row.querySelector('[data-field="assignment"]');
      assignment.replaceChildren();
      if (quoteMode === "compare") {
        appendText(assignment, "option", "比价模式：自动纳入全部方案");
        assignment.disabled = true;
      } else {
        appendText(assignment, "option", "请选择方案").value = "";
        quoteVariants.forEach(variant => {
          const plan = core.getPlan(variant.planCode);
          const option = appendText(assignment, "option", `${plan.code} · ${variant.name}`);
          option.value = variant.id;
          option.selected = core.variantForPerson(person, state) === variant.id;
        });
        assignment.disabled = person.type !== "employee";
        assignment.title = person.type !== "employee" ? "家属自动继承关联员工方案" : "每名员工只能分配一个报价方案";
        assignment.addEventListener("change", () => { person.assignment = assignment.value; person.plan = ""; saveState(); update(); });
      }
      row.querySelector(".remove-button").addEventListener("click", () => { people.splice(index, 1); saveState(); update(); });
      tbody.append(row);
    });
    $("peopleHint").textContent = quoteMode === "compare"
      ? "比价模式：人员只需录入一次，每个报价方案都会对整批人员分别计算保费。"
      : "分组模式：员工需分配一个报价方案；配偶及子女只需填写关联员工编号，自动继承关联员工方案。";
  }

  function renderMedicalPlans() {
    const root = $("medicalPlans");
    root.replaceChildren();
    core.PLANS.forEach(plan => {
      const label = document.createElement("label");
      label.className = "medical-plan";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = plan.code;
      checkbox.checked = selectedPlanCodes.includes(plan.code);
      const text = document.createElement("span");
      appendText(text, "strong", `${plan.code} · ${plan.name}${plan.option ? ` ${plan.option}` : ""}`);
      appendText(text, "small", `${plan.area} · 费率列 ${plan.rateColumn}`);
      label.append(checkbox, text);
      checkbox.addEventListener("change", event => {
        if (event.target.checked) {
          if (!selectedPlanCodes.includes(plan.code)) selectedPlanCodes.push(plan.code);
          if (!selectedVariantsForPlan(plan.code).length) quoteVariants.push(makeVariant(plan.code));
        } else {
          selectedPlanCodes = selectedPlanCodes.filter(code => code !== plan.code);
          quoteVariants = quoteVariants.filter(variant => variant.planCode !== plan.code);
          people.forEach(person => { if (person.plan === plan.code) person.plan = ""; if (person.assignment && !quoteVariants.some(variant => variant.id === person.assignment)) person.assignment = ""; });
        }
        saveState(); update();
      });
      root.append(label);
    });
  }

  function optionPriceText(option, plan) {
    if (option.code === "none") return "不计费 / no premium";
    if (!Object.prototype.hasOwnProperty.call(option.premiumByPlan, plan.code)) return "待人工确认 / manual confirmation required";
    return core.money(option.premiumByPlan[plan.code]);
  }

  function renderCoreOptions() {
    const root = $("coreOptions");
    root.replaceChildren();
    const options = [
      {
        key: "copay",
        id: "outpatientFromSixth20",
        checked: copayOption === "outpatient_from_sixth_20",
        title: "门诊第 6 次起就诊自付 20%",
        description: "通过 PCP 就诊、互联网问诊、慢病送药不计入门诊次数；可与柏盛 PCP 首诊直付同时选择，Medical 保费下调 6%。",
      },
      {
        key: "preExisting",
        id: "fmuPreExisting",
        checked: preExistingOption === "fmu",
        title: "最高等级 FMU（11EE 以下）",
        description: "FMU 需全员提供个人健康告知，不承担一切既往症；Medical 保费下调 5%。",
      },
    ];
    options.forEach(option => {
      const label = document.createElement("label");
      label.className = "payment-condition";
      const checkbox = document.createElement("input");
      checkbox.id = option.id;
      checkbox.type = "checkbox";
      checkbox.checked = option.checked;
      checkbox.addEventListener("change", () => {
        if (option.key === "copay") copayOption = checkbox.checked ? "outpatient_from_sixth_20" : "none";
        if (option.key === "preExisting") preExistingOption = checkbox.checked ? "fmu" : "standard";
        applyGlobalCoreOptions();
        saveState();
        update();
      });
      const text = document.createElement("span");
      appendText(text, "strong", option.title);
      appendText(text, "small", option.description);
      label.append(checkbox, text);
      root.append(label);
    });
  }

  function renderOptions() {
    const root = $("benefitOptions");
    root.replaceChildren();
    const plans = selectedPlans();
    if (!plans.length) { appendText(root, "p", "添加人员并选择计划后，在此配置该计划的可选福利。", "hint"); return; }
    plans.forEach(plan => {
      selectedVariantsForPlan(plan.code).forEach(variant => {
        const panel = document.createElement("div");
        panel.className = "option-panel";
        appendText(panel, "h3", `${plan.code} · ${variant.name}`);
        const nameLabel = document.createElement("label");
        nameLabel.className = "option-row";
        appendText(nameLabel, "span", "报价方案名称");
        const nameInput = document.createElement("input");
        nameInput.value = variant.name;
        nameInput.addEventListener("change", () => { variant.name = nameInput.value.trim() || "未命名方案"; saveState(); update(); });
        nameLabel.append(nameInput);
        panel.append(nameLabel);
        OPTIONAL_TYPES.forEach(type => {
          const row = document.createElement("label");
          row.className = "option-row";
          appendText(row, "span", { maternity: "生育福利", wellness: "体检/疫苗", dental: "牙科福利", vision: "眼科福利" }[type]);
          const select = document.createElement("select");
          core.OPTIONALS[type].forEach(item => {
            const option = appendText(select, "option", item.label);
            option.value = item.code;
            option.selected = (variant[type] || "none") === item.code;
            option.disabled = item.allowedGroups && !item.allowedGroups.includes(plan.group);
            const price = document.createElement("small");
            price.className = "option-price";
            price.textContent = optionPriceText(item, plan);
            if (item.code !== "none" && !Object.prototype.hasOwnProperty.call(item.premiumByPlan, plan.code)) option.className = "needs-confirmation";
            // The explanatory line sits below the select, not inside the native option list.
          });
          select.addEventListener("change", () => { variant[type] = select.value; saveState(); update(); });
          row.append(select);
          const current = core.getOptional ? core.getOptional(type, variant[type]) : null;
          if (current && current.code !== "none") appendText(row, "small", optionPriceText(current, plan), "option-price");
          panel.append(row);
        });
        const actions = document.createElement("div");
        actions.className = "option-actions";
        const addButton = document.createElement("button");
        addButton.type = "button"; addButton.className = "text-button"; addButton.textContent = "+ 新增同一 Plan 变体";
        addButton.addEventListener("click", () => { quoteVariants.push(makeVariant(plan.code)); saveState(); update(); });
        actions.append(addButton);
        if (selectedVariantsForPlan(plan.code).length > 1) {
          const removeButton = document.createElement("button");
          removeButton.type = "button"; removeButton.className = "text-button danger"; removeButton.textContent = "删除此变体";
          removeButton.addEventListener("click", () => { quoteVariants = quoteVariants.filter(item => item.id !== variant.id); people.forEach(person => { if (person.assignment === variant.id) person.assignment = ""; }); saveState(); update(); });
          actions.append(removeButton);
        }
        panel.append(actions);
        root.append(panel);
      });
    });
  }

  function addSummaryMetric(dl, label, value) {
    appendText(dl, "dt", label);
    appendText(dl, "dd", value);
  }

  function renderSummary() {
    const root = $("summary"); root.replaceChildren();
    const state = coreState();
    let grandTotal = 0;
    quoteVariants.forEach((variant, index) => {
      const totals = core.totalsForVariant(state, variant);
      const card = document.createElement("article"); card.className = "summary-card";
      appendText(card, "h3", core.variantLabel(variant, index));
      appendText(card, "div", core.money(totals.total), "total");
      const dl = document.createElement("dl");
      addSummaryMetric(dl, "基础医疗", core.money(totals.baseMedical));
      addSummaryMetric(dl, "医疗优惠", core.money(totals.discount));
      addSummaryMetric(dl, "可选福利", core.money(totals.optional));
      addSummaryMetric(dl, "计费人数", `${core.membersForVariant(state, variant).length} 人`);
      card.append(dl);
      if (totals.pending || totals.ineligible) appendText(card, "p", `待人工/单独核保 ${totals.pending} 人；不符合条件 ${totals.ineligible} 人。待人工人员不计入自动医疗总额。`, "review");
      root.append(card);
      grandTotal += totals.total;
    });
    $("totalPremium").textContent = core.money(grandTotal);
    if (!quoteVariants.length) appendText(root, "p", "选择医疗计划后显示每个报价方案的保费汇总。", "hint");
  }

  function renderValidation() {
    const root = $("validation"); root.replaceChildren();
    const messages = core.validate(coreState());
    const groups = [[core.VALIDATION_LEVELS.ERROR, "error", "必须修正 / Errors"], [core.VALIDATION_LEVELS.MANUAL_REVIEW, "manual", "人工复核 / Manual Review"], [core.VALIDATION_LEVELS.WARNING, "warning", "提示 / Warnings"]];
    if (!messages.length) { appendText(root, "div", "校验通过，可导出报价 Excel。", "validation-empty"); return; }
    groups.forEach(([level, className, title]) => {
      const items = messages.filter(message => message.level === level);
      if (!items.length) return;
      const box = document.createElement("div"); box.className = `validation-group ${className}`;
      appendText(box, "h3", title);
      const list = document.createElement("ul");
      items.forEach(message => appendText(list, "li", message.message));
      box.append(list); root.append(box);
    });
  }

  function update() {
    renderMedicalPlans();
    renderCoreOptions();
    renderOptions();
    renderPeople();
    renderSummary();
    renderValidation();
    document.querySelectorAll('input[name="quoteMode"]').forEach(input => { input.checked = input.value === quoteMode; });
  }

  function addPerson() {
    people.push(normalizePerson({ id: makeId("person"), name: `人员${people.length + 1}`, type: "employee", age: "" }, people.length));
    saveState(); update();
  }

  function loadDemo() {
    people = [
      { id: "E001", name: "员工001", type: "employee", employeeId: "E001", age: 33, gender: "male" },
      { id: "E002", name: "员工002", type: "employee", employeeId: "E002", age: 40, gender: "female" },
      { id: "E003", name: "员工003", type: "employee", employeeId: "E003", age: 35, gender: "female" },
      { id: "E004", name: "员工004", type: "employee", employeeId: "E004", age: 45, gender: "male" },
      { id: "E005", name: "员工005", type: "employee", employeeId: "E005", age: 32, gender: "male" },
      { id: "C001", name: "子女001", type: "child", relatedEmployeeId: "E002", age: 9, gender: "male" },
      { id: "S001", name: "配偶001", type: "spouse", relatedEmployeeId: "E004", age: 41, gender: "female" },
    ].map(normalizePerson);
    selectedPlanCodes = ["P201"];
    quoteVariants = [makeVariant("P201", { name: "标准方案", maternity: "m30" })];
    people.forEach(person => { if (person.type === "employee") person.assignment = quoteVariants[0].id; });
    quoteMode = "group";
    saveState(); update();
  }

  function clearAllData() {
    if (!window.confirm("确定清空全部报价数据吗？团体资料、计划、福利组合和人员清单都将被删除。")) return;
    people = []; quoteVariants = []; selectedPlanCodes = []; quoteMode = "group"; copayOption = "none"; preExistingOption = "standard";
    $("companyCn").value = ""; $("companyEn").value = ""; $("pcpDirectBilling").checked = false; $("startDate").value = todayString(); updateEndDate();
    try { localStorage.removeItem(STORAGE_KEY); LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key)); } catch { /* ignore */ }
    update();
  }

  function mergedColumnWidth(sheet, rowIndex, columnIndex) {
    const widths = sheet.widths || [];
    const merge = (sheet.merges || []).find(ref => {
      const match = String(ref).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match || Number(match[2]) !== rowIndex + 1 || Number(match[4]) !== rowIndex + 1) return false;
      const start = columnIndexFromName(match[1]);
      const end = columnIndexFromName(match[3]);
      return columnIndex >= start && columnIndex <= end;
    });
    if (!merge) return widths[columnIndex] || 24;
    const match = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const start = columnIndexFromName(match[1]);
    const end = columnIndexFromName(match[3]);
    return widths.slice(start, end + 1).reduce((sum, width) => sum + (width || 24), 0);
  }

  function rowHeight(row, sheet, rowIndex) {
    const lines = row.reduce((max, value, columnIndex) => {
      const width = mergedColumnWidth(sheet, rowIndex, columnIndex);
      const lineCount = String(value ?? "").split("\n").reduce((count, line) => {
        const displayWidth = Array.from(line).reduce((sum, character) => sum + (/[^\u0000-\u00ff]/.test(character) ? 1 : 0.55), 0);
        return count + Math.max(1, Math.ceil(displayWidth / Math.max(10, width * 0.9)));
      }, 0);
      return Math.max(max, lineCount);
    }, 1);
    return Math.min(300, Math.max(22, 15 * lines + 8));
  }

  const WORKBOOK_COLORS = Object.freeze({
    navy: "173C79",
    blue: "1E4C91",
    ink: "17233D",
    muted: "68738A",
    line: "D8E1EE",
    white: "FFFFFF",
    soft: "F6F9FD",
    header: "DFEAF8",
    section: "EEF4FB",
    total: "E8F5EE",
    totalInk: "20684B",
    discount: "FFF5DE",
    discountInk: "9A5D00",
  });
  const THIN_BORDER = Object.freeze({ style: "thin", color: { rgb: WORKBOOK_COLORS.line } });
  const BODY_BORDER = Object.freeze({ bottom: THIN_BORDER });
  const GRID_BORDER = Object.freeze({ top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER });
  const CURRENCY_FORMAT = '¥#,##0;[Red]-¥#,##0;-';
  const INTEGER_FORMAT = '#,##0;[Red]-#,##0;-';

  function workbookRowKind(sheet, rowIndex) {
    const declared = sheet.rowStyles?.[rowIndex] || "body";
    const label = String(sheet.rows?.[rowIndex]?.[0] ?? "");
    if (rowIndex === 0 || declared === "title") return "title";
    if (/最终保费|Total Premium/.test(label)) return "total";
    if (/医疗保费优惠|Medical Discount/.test(label)) return "discount";
    return declared;
  }

  function isCurrencyCell(sheet, rowIndex, value, columnIndex = 0) {
    if (typeof value !== "number") return false;
    const label = String(sheet.rows?.[rowIndex]?.[0] ?? "");
    if (sheet.name === "费率 Premium" && rowIndex >= 7) return true;
    if (sheet.name === "报价 Quotation" && rowIndex >= 16 && columnIndex >= 5 && (columnIndex - 5) % 3 === 0) return true;
    return /保费|Premium|费率|Rate|优惠|Discount|总额|Total/.test(label);
  }

  function applyWorkbookLayout(worksheet, sheet) {
    worksheet["!merges"] = (sheet.merges || []).map(ref => XLSX.utils.decode_range(ref));
    worksheet["!cols"] = (sheet.widths || []).map(width => ({ wch: width }));
    worksheet["!rows"] = sheet.rows.map((row, rowIndex) => {
      const kind = workbookRowKind(sheet, rowIndex);
      const computed = rowHeight(row, sheet, rowIndex);
      if (kind === "title") return { hpt: 38 };
      if (kind === "header") return { hpt: Math.min(82, Math.max(42, computed)) };
      if (kind === "section") return { hpt: Math.min(120, Math.max(28, computed)) };
      return { hpt: Math.min(170, Math.max(kind === "meta" ? 26 : 28, computed)) };
    });
  }

  function columnIndexFromName(name) {
    return Array.from(name).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
  }

  function styleIdFor(kind, isLabel, numberFormat) {
    if (kind === "title") return 1;
    if (kind === "header") return 2;
    if (kind === "section") return 3;
    if (kind === "meta") return isLabel ? 4 : 5;
    if (kind === "total") return numberFormat === "currency" ? 11 : 10;
    if (kind === "discount") return numberFormat === "currency" ? 13 : 12;
    if (numberFormat === "currency") return 9;
    if (numberFormat === "integer") return 8;
    return isLabel ? 6 : 7;
  }

  function buildStylesXml() {
    const color = value => `FF${value}`;
    const font = (name, size, bold, rgb) => `<font><name val="${name}"/><sz val="${size}"/>${bold ? "<b/>" : ""}<color rgb="${color(rgb)}"/></font>`;
    const fill = rgb => {
      if (rgb === "none") return "<fill><patternFill patternType=\"none\"/></fill>";
      if (rgb === "gray125") return "<fill><patternFill patternType=\"gray125\"/></fill>";
      return `<fill><patternFill patternType="solid"><fgColor rgb="${color(rgb)}"/><bgColor indexed="64"/></patternFill></fill>`;
    };
    const border = (top = null, bottom = null, left = null, right = null, rgb = WORKBOOK_COLORS.line) => `<border>${top ? `<top style="${top}"><color rgb="${color(rgb)}"/></top>` : "<top/>"}${bottom ? `<bottom style="${bottom}"><color rgb="${color(rgb)}"/></bottom>` : "<bottom/>"}${left ? `<left style="${left}"><color rgb="${color(rgb)}"/></left>` : "<left/>"}${right ? `<right style="${right}"><color rgb="${color(rgb)}"/></right>` : "<right/>"}<diagonal/></border>`;
    const xf = (fontId, fillId, borderId, numFmtId = 0, horizontal = "left", vertical = "top", applyNumberFormat = false) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyAlignment="1"${applyNumberFormat ? " applyNumberFormat=\"1\"" : ""}><alignment horizontal="${horizontal}" vertical="${vertical}" wrapText="1"/></xf>`;
    const fonts = [
      font("Aptos", 10, false, WORKBOOK_COLORS.ink),
      font("Aptos Display", 15, true, WORKBOOK_COLORS.white),
      font("Aptos", 10, true, WORKBOOK_COLORS.navy),
      font("Aptos", 10, true, WORKBOOK_COLORS.blue),
      font("Aptos", 10, true, WORKBOOK_COLORS.navy),
      font("Aptos", 10, false, WORKBOOK_COLORS.ink),
      font("Aptos", 10, true, WORKBOOK_COLORS.ink),
      font("Aptos", 10, false, WORKBOOK_COLORS.ink),
      font("Aptos", 11, true, WORKBOOK_COLORS.totalInk),
      font("Aptos", 10, true, WORKBOOK_COLORS.discountInk),
    ].join("");
    const fills = ["none", "gray125", WORKBOOK_COLORS.navy, WORKBOOK_COLORS.header, WORKBOOK_COLORS.section, WORKBOOK_COLORS.soft, WORKBOOK_COLORS.total, WORKBOOK_COLORS.discount, WORKBOOK_COLORS.white].map(fill).join("");
    const borders = [
      border(),
      border(null, "thin"),
      border("thin", "thin", "thin", "thin"),
      border(null, "medium", null, null, WORKBOOK_COLORS.blue),
      border("thin", "thin"),
      border("medium", "thin", null, null, WORKBOOK_COLORS.totalInk),
    ].join("");
    const cellXfs = [
      xf(0, 0, 0),
      xf(1, 2, 3, 0, "left", "center"),
      xf(2, 3, 2, 0, "center", "center"),
      xf(3, 4, 4),
      xf(4, 5, 1),
      xf(5, 5, 1),
      xf(6, 8, 1),
      xf(7, 8, 1),
      xf(7, 8, 1, 165, "right", "top", true),
      xf(7, 8, 1, 164, "right", "top", true),
      xf(8, 6, 5, 0, "left", "top"),
      xf(8, 6, 5, 164, "right", "top", true),
      xf(9, 7, 1),
      xf(9, 7, 1, 164, "right", "top", true),
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="${CURRENCY_FORMAT}"/><numFmt numFmtId="165" formatCode="${INTEGER_FORMAT}"/></numFmts><fonts count="10">${fonts}</fonts><fills count="9">${fills}</fills><borders count="6">${borders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellXfs.match(/<xf\b/g).length}">${cellXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/></styleSheet>`;
  }

  function styleWorksheetXml(xml, sheet) {
    return xml.replace(/<c\b([^>]*?)(\/?)>/g, (opening, attributes, selfClosing) => {
      const refMatch = attributes.match(/\br="([A-Z]+)(\d+)"/);
      if (!refMatch) return opening;
      const rowIndex = Number(refMatch[2]) - 1;
      const columnIndex = columnIndexFromName(refMatch[1]);
      const value = sheet.rows?.[rowIndex]?.[columnIndex];
      const kind = workbookRowKind(sheet, rowIndex);
      const numberFormat = isCurrencyCell(sheet, rowIndex, value, columnIndex) ? "currency" : typeof value === "number" ? "integer" : "general";
      const styleId = styleIdFor(kind, columnIndex === 0, numberFormat);
      const styledAttributes = /\bs="[^\"]*"/.test(attributes)
        ? attributes.replace(/\bs="[^\"]*"/, `s="${styleId}"`)
        : `${attributes} s="${styleId}"`;
      return `<c${styledAttributes}${selfClosing}>`;
    });
  }

  async function styleWorkbookBytes(bytes, model) {
    if (!window.JSZip) return bytes;
    const zip = await window.JSZip.loadAsync(bytes);
    zip.file("xl/styles.xml", buildStylesXml());
    for (let index = 0; index < model.sheets.length; index += 1) {
      const path = `xl/worksheets/sheet${index + 1}.xml`;
      const entry = zip.file(path);
      if (!entry) continue;
      const xml = await entry.async("string");
      zip.file(path, styleWorksheetXml(xml, model.sheets[index]));
    }
    return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  async function exportExcel() {
    const messages = core.validate(coreState());
    const errors = messages.filter(message => message.level === core.VALIDATION_LEVELS.ERROR);
    if (errors.length) {
      window.alert(`仍有 ${errors.length} 项必须修正的校验错误，暂不能导出。人工复核和提示不会阻断导出。`);
      return;
    }
    if (!XLSX) { window.alert("离线 XLSX 组件未加载，无法导出。"); return; }
    const model = core.buildWorkbookModel(coreState());
    const workbook = XLSX.utils.book_new();
    workbook.Props = { Title: "PP & Prosper SME Quotation Core Reliability v4", Subject: "Offline quotation", Author: "PP & Prosper" };
    model.sheets.forEach(sheet => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
      applyWorkbookLayout(worksheet, sheet);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
    });
    const rawBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
    let bytes;
    try {
      bytes = await styleWorkbookBytes(rawBytes, model);
    } catch (error) {
      console.error("Unable to apply workbook styling", error);
      window.alert("报价数据已生成，但 Excel 样式处理失败；请重试导出。业务计算未受影响。");
      return;
    }
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const safeName = ($( "companyCn").value || "未命名团体").replace(/[\\/:*?"<>|\r\n]/g, "_");
    link.download = `${safeName}-PP & Prosper SME 报价表-${todayString()}.xlsx`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function bindEvents() {
    $("startDate").addEventListener("change", () => { updateEndDate(); people.forEach(person => { if (person.dob) person.age = ageAtStart(person.dob) ?? ""; }); saveState(); update(); });
    $("pcpDirectBilling").addEventListener("change", () => { saveState(); update(); });
    $("addPersonButton").addEventListener("click", addPerson);
    $("demoButton").addEventListener("click", loadDemo);
    $("clearButton").addEventListener("click", clearAllData);
    $("clearAllButton").addEventListener("click", clearAllData);
    $("downloadButton").addEventListener("click", exportExcel);
    document.querySelectorAll('input[name="quoteMode"]').forEach(input => input.addEventListener("change", () => { quoteMode = input.value; if (quoteMode === "compare") people.forEach(person => { person.assignment = ""; }); saveState(); update(); }));
  }

  $("startDate").value = todayString();
  const loaded = loadState();
  if (!loaded && !$("startDate").value) $("startDate").value = todayString();
  updateEndDate();
  bindEvents();
  update();
}());
