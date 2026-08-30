# PP SME Bug Governance v1

本文件只定义轻量 Bug 闭环，不记录具体 Bug。GitHub Issues 是唯一正式 Bug Registry；不建立 Bug Excel、Bug JSON、Bug Database 或第二套 Markdown Bug Library。

## 1. 正式事实源与范围

- 唯一仓库：<https://github.com/shtxy1115-prog/PP-SME->
- GitHub 负责保存 Source Code、Bug Issue、Regression Test、Fix Commit 和 Version History。
- 报价业务规则、费率、TOB、Excel 样式和产品架构不因本治理建设而改变。
- 本治理建立前基线：`main` @ `c1ff9f6f8d459afb71fbcc5312e907198b74bfff`；当前 standalone 为 `PP_Prosper_SME_报价器_Core_Reliability_v4.html`。

## 2. 角色分工

### ChatGPT

- 接收用户报错，判断 `BUG` 或 `BUSINESS_RULE_NEEDS_CONFIRMATION`。
- 对 Bug 进行 P0 / P1 / P2 分级，明确 Expected / Actual、Root Cause、最小 Fix Scope 和 Regression Test。
- 基于 GitHub 当前正式版本进行远程修复或修复审核，返回 Issue、commit 和 Validation 结果。
- 业务事实不明确时不猜测，Issue 标记 `NEEDS_BUSINESS_CONFIRMATION`，等待确认后再编码。

### GitHub

- 作为唯一正式事实源和 Bug Registry。
- 每个 Bug 使用一个 Issue，关联回归测试、修复 commit 和验证证据。

### Codex

- ChatGPT / GitHub 完成修复后，默认只执行本地同步、回归和交付验证：`git status`、`git pull`、Regression、浏览器验证、standalone build，并复制正式 HTML 到 Downloads。
- Codex 不重新独立设计另一套 Fix。只有本地验证发现新的真实问题时，才更新原 Issue；若是不同问题，创建下一个 `BUG-SME` Issue。
- 本地验证失败前不得宣称 `VERIFIED`；需要修改代码时，必须先形成或更新 GitHub Issue 记录。

## 3. Bug ID 与 Issue 模板

- Bug ID 统一为连续且唯一的 `BUG-SME-001`、`BUG-SME-002`、`BUG-SME-003`……
- 分配新 ID 前检查 GitHub Issues 的全部历史（包括已关闭 Issue），取最大编号加一；不得在本地另建编号表。
- Issue 标题统一为：`[BUG-SME-001] 简短问题描述`。
- 模板路径：`.github/ISSUE_TEMPLATE/bug_report.md`。
- Issue 至少记录：Bug ID、Severity、Version / Commit、Problem、Reproduction、Expected、Actual、Business Impact、Root Cause、Fix Scope、Out of Scope、Regression Test、Fix Commit、Validation、Status。

## 4. Severity

- **P0 — Core Correctness**：错误保费、保险责任、核保判断、TOB、Excel、数据或业务输出；必须优先处理。
- **P1 — Usability**：不影响核心正确性，但导致无法录入、删除、缓存、导出或严重阻塞使用流程。
- **P2 — Experience**：不影响报价正确性的 UI、文案、间距、列宽、视觉层级或非关键体验问题。
- 若当前存在 P0 / P1，P2 延后，不抢占核心修复。

## 5. 状态

- `OPEN`：已确认问题存在。
- `FIXED`：代码已修改并提交 GitHub。
- `VERIFIED`：Regression 与本地运行 / 导出验证通过。
- `CLOSED`：正式版本已同步，用户确认问题解决。
- `NEEDS_INFO`：无法复现或信息不足；不得直接关闭。
- `NEEDS_BUSINESS_CONFIRMATION`：业务事实不明确；不得猜测或编码。

## 6. 固定闭环

```text
用户报错
  ↓
ChatGPT Triage：BUG / BUSINESS_RULE_NEEDS_CONFIRMATION、Severity、Expected / Actual
  ↓
创建或更新 GitHub Issue，记录当前 main commit
  ↓
Reproduce → Root Cause → 最小 Fix Scope
  ↓
P0 / P1 必须先加入 Regression Test，再 Fix
  ↓
Commit / Push
  ↓
Codex git pull → 本地 Regression → Browser / XLSX / standalone 验证
  ↓
复制最新 HTML 至 Downloads → Issue 标记 VERIFIED
  ↓
用户实际确认 → CLOSED
```

每次修复前必须回答：

1. 是否 P0 / P1？
2. 是否影响实际可用？
3. 是否能以最小范围一次完成？

禁止借单个 Bug 重构报价器、改变产品架构、进行大面积 UI 重做、修改无关业务规则或建立第二套数据模型。

## 7. Codex 本地同步规则

```text
git status
git pull --ff-only origin main
运行 quote-tool/tests/ 中现有 Regression
本地浏览器验证
node quote-tool/build-standalone.mjs
复制最新 standalone HTML 至 Downloads
记录测试结果、standalone hash 和工作区状态
```

若本地验证失败：停止 `VERIFIED`，回到原 Issue 分析；确认属于不同问题时，按 Bug ID 规则创建新的 Issue。未完成上述验证，不得把 `FIXED` 宣称为 `VERIFIED`。
