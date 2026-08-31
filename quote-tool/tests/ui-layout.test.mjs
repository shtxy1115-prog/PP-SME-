import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const app = readFileSync(new URL("app.js", root), "utf8");

test("核心条件控件位于第一部分并在医疗计划渲染后更新", () => {
  const firstSection = html.match(/<section class="card">[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(firstSection, /id="pcpDirectBilling"/);
  assert.match(firstSection, /id="coreConditions"/);
  assert.ok(firstSection.indexOf("id=\"coreConditions\"") > firstSection.indexOf("id=\"pcpDirectBilling\""));

  const renderCoreConditionsIndex = app.indexOf("function renderCoreConditions()");
  const renderOptionsIndex = app.indexOf("function renderOptions()");
  const updateIndex = app.indexOf("function update()");
  const updateBody = app.slice(updateIndex, app.indexOf("function addPerson()", updateIndex));
  assert.ok(renderCoreConditionsIndex >= 0);
  assert.ok(renderCoreConditionsIndex < renderOptionsIndex);
  assert.match(updateBody, /renderCoreConditions\(\);\s*renderOptions\(\);/);
});

test("第二部分不再重复渲染既往症和自付比例控件", () => {
  const renderOptionsStart = app.indexOf("function renderOptions()");
  const renderOptionsEnd = app.indexOf("function addSummaryMetric", renderOptionsStart);
  const renderOptions = app.slice(renderOptionsStart, renderOptionsEnd);
  assert.doesNotMatch(renderOptions, /core\.PRE_EXISTING_OPTIONS/);
  assert.doesNotMatch(renderOptions, /core\.COPAY_OPTIONS/);
});
