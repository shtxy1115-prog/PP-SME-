import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const app = readFileSync(new URL("app.js", root), "utf8");

test("第一部分只提供全局核心选项，不展开报价方案卡片", () => {
  const firstSection = html.match(/<section class="card">[\s\S]*?<\/section>/)?.[0] || "";
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

test("第二部分不再重复渲染既往症和自付比例控件", () => {
  const renderOptionsStart = app.indexOf("function renderOptions()");
  const renderOptionsEnd = app.indexOf("function addSummaryMetric", renderOptionsStart);
  const renderOptions = app.slice(renderOptionsStart, renderOptionsEnd);
  assert.doesNotMatch(renderOptions, /core\.PRE_EXISTING_OPTIONS/);
  assert.doesNotMatch(renderOptions, /core\.COPAY_OPTIONS/);
});
