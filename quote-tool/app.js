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
      preExisting: source.preExisting || "standard",
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
      people = Array.isArray(state.people) ? state.people.map(normalizePerson) : [];
      selectedPlanCodes = Array.isArray(state.selectedPlanCodes) ? state.selectedPlanCodes.filter(code => core.getPlan(code)) : [];
      quoteVariants = Array.isArray(state.variants || state.quoteVariants)
        ? (state.variants || state.quoteVariants).filter(variant => core.getPlan(variant.planCode)).map(variant => makeVariant(variant.planCode, variant))
        : [];
      quoteMode = state.mode === "compare" || state.quoteMode === "compare" ? "compare" : "group";
      $("companyCn").value = typeof state.companyCn === "string" ? state.companyCn : "";
      $("companyEn").value = typeof state.companyEn === "string" ? state.companyEn : "";
      $("startDate").value = typeof state.startDate === "string" && state.startDate ? state.startDate : todayString();
      $("pcpDirectBilling").checked = state.pcpDirectBilling === true;
      selectedPlanCodes.forEach(code => { if (!quoteVariants.some(variant => variant.planCode === code)) quoteVariants.push(makeVariant(code)); });
      quoteVariants.forEach(variant => { if (!selectedPlanCodes.includes(variant.planCode)) selectedPlanCodes.push(variant.planCode); });
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
      appendText(text, "small", `${plan.area}${plan.rateColumn ? ` · 费率列 ${plan.rateColumn}` : " · 原始费率列待确认"}`);
      if (plan.source.status === "NEEDS_CONFIRMATION") appendText(text, "small", plan.source.note, "plan-warning");
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
        const underLabel = document.createElement("label");
        underLabel.className = "option-row";
        appendText(underLabel, "span", "既往症安排");
        const underSelect = document.createElement("select");
        [["standard", "标准承保 / Standard"], ["fmu", "FMU（医疗保费 -5%）"]].forEach(([value, text]) => { const option = appendText(underSelect, "option", text); option.value = value; option.selected = variant.preExisting === value; });
        underSelect.addEventListener("change", () => { variant.preExisting = underSelect.value; saveState(); update(); });
        underLabel.append(underSelect); panel.append(underLabel);
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
    people = []; quoteVariants = []; selectedPlanCodes = []; quoteMode = "group";
    $("companyCn").value = ""; $("companyEn").value = ""; $("pcpDirectBilling").checked = false; $("startDate").value = todayString(); updateEndDate();
    try { localStorage.removeItem(STORAGE_KEY); LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key)); } catch { /* ignore */ }
    update();
  }

  function rowHeight(row) {
    const lines = row.reduce((max, value) => Math.max(max, String(value ?? "").split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / 45)), 0)), 1);
    return Math.min(360, Math.max(22, 16 * lines + 8));
  }

  function applyWorkbookLayout(worksheet, sheet) {
    worksheet["!merges"] = (sheet.merges || []).map(ref => XLSX.utils.decode_range(ref));
    worksheet["!cols"] = (sheet.widths || []).map(width => ({ wch: width }));
    worksheet["!rows"] = sheet.rows.map(row => ({ hpt: rowHeight(row) }));
    Object.keys(worksheet).filter(address => address.charAt(0) !== "!").forEach(address => {
      const cell = worksheet[address];
      cell.s = { alignment: { vertical: "top", wrapText: true } };
    });
  }

  function exportExcel() {
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
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
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
