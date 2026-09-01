# PP & Prosper SME 报价器 Core Reliability Audit v1

审计日期：2026-08-30（Asia/Shanghai）
审计范围：`PP & Prosper SME 报价器 Core Reliability Repair v1` 任务要求、现有 v3 源码、业务方案与费率 XLSX、现有实际导出 XLSX 的结构性证据。

## 1. Git / 来源基线

| 项目 | 只读确认结果 |
|---|---|
| 唯一官方仓库 | `https://github.com/shtxy1115-prog/PP-SME-` |
| 仓库状态 | GitHub API 返回公开、非归档、`size: 0` 的空仓库 |
| 默认分支 | GitHub 元数据为 `main`；远端当前没有可解析的 branch/ref |
| 最新 commit | 无；`git ls-remote` 无输出 |
| 当前正式工作目录 | 本仓库下的 `PP-SME-/`；因为 ChatGPT 项目镜像根目录的 `.git` 受平台保护，未触碰其元数据 |
| v3 基线 | `/Users/doristao/Downloads/PP_Prosper_SME_报价器_版式修复_v3.html`，SHA-256 `c45e3de1ae5e004cf743d58a1916369055aee17bc720379ff36fb8afc95e5434` |
| 可维护源码基线 | `/Users/doristao/Documents/AI/Github/copilot-worktrees/-AI-/shtxy1115-prog-fluffy-sniffle/quote-tool/`，与 Downloads v3 standalone 内容一致；该参考 worktree 的 `quote-tool/` 当时仍为未跟踪目录 |
| 业务 SoT | `/Users/doristao/Documents/PP SME/PP & Prosper SME 方案整理表 20260814 v2.xlsx`，已读取 `福利表`、`Quotation`、HCP、Pre-auth、Catastrophic PEC 等真实工作表 |
| 当前正式仓库变更 | 审计写入前无 commit；随后仅导入 v3 的四个可维护源码文件并写入本审计，不导入原始业务 XLSX 或实际客户导出文件 |

其他本地 `-AI-` 仓库及其 dirty worktree 与本项目无关，本轮不修改、不合并、不复制其业务数据。

## 2. 原始规则与当前实现对照

| 领域 | 原始规则 / SoT 证据 | 当前 v3 实现 | 判定 |
|---|---|---|---|
| 计划与区域 | 正式业务规则：Plan 3 只有 WWE=全球除美；Plan 4 支持 WWE=全球除美与 WW=全球 | 计划/区域元数据不完整，且 `P4WWE` 区域文案错误 | P0 |
| 费率 | `Quotation` 工作表给出 P1O1-P1O3、P2O1-P2O3、P3WWE、P4WW、P4WWE 九列；65-69 有真实数字，70-75 为个案核保 | 65+ 被校验拦截；`rateFor(...) || 0` 把无费率变成 0 保费 | P0 |
| 计划组合更正 | 正式业务规则不包含 Plan 3 的全球变体 | v3 计划模型需按正式规则收敛，Plan 4 的 WW/WWE 仍需分别保留 | 本轮更正 |
| 年龄 / 核保 | 新业务；65-69 自动报价；儿童最大 25 岁；70+ 或缺费率需单独核保 | 成人 `>=65` 直接报错；儿童 `>21` 报错；70+ 直接报错；无状态/人工费率字段 | P0 |
| 核保状态 | `AUTO_QUOTABLE`、`MANUAL_RATE`、`PENDING_UW`、`INELIGIBLE`；待人工不计 0；页面与 XLSX 要写清楚 | 仅有数字保费，无状态分层；缺费率通过 0 进入总额 | P0 |
| TOB 来源 | 原始 `福利表` 应转为带 benefitId、section、双语名称/描述、planValues、sharedGroup、sourceSheet/sourceRow 的结构化 Benefit Data | `BENEFIT_DETAILS`、`benefitRows`、`planTobRows` 为手工常量，使用 `startsWith` 与固定行偏移 | P0 |
| 共享责任 | 理疗/中医/中草药、wellness/免疫、牙科等由 sharedGroup 驱动；不能靠合并单元格表达业务含义 | 依赖字符串前缀、`B@:B@+2` 和行序；将部分限额用合并表达 | P0 |
| 妊娠并发症 | 不与生育责任共享；单独按年度最高保额 | 当前把 P1/P2 生育行与并发症空白/合并处理，未形成独立结构化责任 | P0 |
| HCP | 始终输出完整 HCP 列表 | 当前有手工 HCP 常量，但未与原始 HCP 工作表形成结构化源数据链 | P1，随结构化导出修复 |
| Compare / Group | Compare 同一批人跨变体，不按员工人数限制；Group 按唯一 Plan：<=5 最多 1 个，>5 最多 2 个 | Compare 逻辑基本不按计划数限制；Group 直接按选择数量计数，重复同一 Plan 的变体会误报 | P0 |
| 生育条件 | 员工数至少 5；有一个方案选生育时所有已选方案都要有；3 年不可变但当前无历史，只能提示 | 只有员工数和 P1/P2 局部限制；没有全方案一致性；没有 3 年 warning | P0 |
| 校验等级 | `ERROR`、`WARNING`、`MANUAL_REVIEW`；人工核保不得阻断其他计算 | 只有一个错误数组，导出遇到任何提示都阻断 | P0 |
| XLSX | 离线单 HTML；8 类必需 sheet；双语换行、TOB 层级、福利/限额分列、共享限额不重复 | 已有手写 ZIP/OpenXML；存在无 default style 警告；内容来自手工 TOB 常量；所有 validation 提示都会阻止导出 | P0 |

## 3. 已确认的真实 P0 根因

1. `PLANS` 不是从费率表和方案表完整建模：错误建立了 Plan 3 全球变体，并且计划区域/费率列映射不完整。
2. 年龄与费率路径把“没有自动费率”“待人工核保”“不符合条件”混成数字 0 或硬错误，导致 65-69 被错误阻断，也会静默低报 70+ / 无自动费率人员。
3. TOB 由多套手工列表和字符串前缀驱动，不能证明每个计划/区域组合的责任来自 `福利表`；共享限额和妊娠并发症因此发生语义错误。
4. Group 的限制依据变体/选择数组而不是唯一 Plan，重复同一计划的比较变体会被错误拦截。
5. 导出器的“任意提示即阻断”与 `MANUAL_REVIEW` / `WARNING` 规则冲突；XLSX 生成链缺少成熟浏览器侧库的可靠结构输出与可解析验收。

## 4. 本轮可修复范围

- 重建计划/区域/费率列元数据，并删除错误的 Plan 3 全球变体，保留 Plan 3 WWE 与 Plan 4 WW/WWE 的正式映射。
- 增加四态报价状态、人工医疗费率与缺费率安全路径；移除所有 `rateFor(...) || 0` 语义。
- 用 `福利表` 的结构化 Benefit Data 驱动 TOB，包括 sharedGroup、双语责任与来源行；妊娠并发症独立按年度最高保额。
- 修复 Compare/Group 唯一 Plan 计数、生育一致性、年龄边界和分级校验；人工复核不阻断其它计算。
- 将 XLSX 改为浏览器侧成熟 XLSX 库的离线内嵌用法，保留 8 类必需 sheet，写入双语换行、来源/共享责任元数据和可靠的 merges/columns/rows。
- 建立固定五类回归测试、浏览器实际交互导出、ZIP/工作簿结构/关键单元格解析验收。

## 5. 当前没有业务依据、不得臆补的事项

- 正式业务规则确认 Plan 3 只保留 WWE，Plan 4 才同时有 WW/WWE；不存在的 Plan 3 全球变体不得加入计划模型、UI、TOB 或报价状态路径。
- 当前任务没有提供历史保单/上次生育选项记录，因此不能伪造“生育 3 年不可变”的历史校验，只能显示 warning / prompt。
- 原始 `福利表` 的部分空白责任行（例如中医/中草药）不能被当作新的独立数字限额；只依据源表与已确认 sharedGroup 关系呈现共享责任，不补写缺失金额。
- 原始工作簿没有 Microsoft Excel/WPS 的人工打开结果；自动结构验收完成后，必须明确标注“未完成 Microsoft Excel/WPS 人工打开验收”。

## 6. 精确写入范围

正式仓库仅允许写入：

- `quote-tool/index.html`
- `quote-tool/styles.css`
- `quote-tool/core.js`（纯业务规则、费率、结构化 Benefit Data 与校验模型）
- `quote-tool/app.js`
- `quote-tool/build-standalone.mjs`
- `quote-tool/vendor/`（离线内嵌的成熟 XLSX 浏览器库及必要许可证信息）
- `quote-tool/tests/`（固定回归与 XLSX 结构验收脚本，不含客户数据）
- `quote-tool/docs/SME_Quotation_Core_Reliability_Audit_v1.md`
- `quote-tool/docs/SME_Quotation_Core_Reliability_Validation_v1.md`
- `quote-tool/dist/PP_Prosper_SME_报价器_Core_Reliability_v4.html`

不写入原始业务 XLSX、实际客户导出 XLSX、客户姓名/联系方式、绝对路径依赖、服务器/数据库/登录/角色/花名册导入、无关 README 或第二知识库。

## 7. 审计结论

当前 v3 不能作为可信报价基线发布：至少存在计划/费率映射缺口、65-69 错误拦截、无费率静默按 0、TOB 来源与共享责任不可审计、Group 唯一 Plan 误判、分级校验缺失和 XLSX 生成可靠性不足等真实 P0。

本审计之后已根据正式业务规则删除错误的 Plan 3 全球变体，并保留 Plan 3 WWE、Plan 4 WW/WWE 的来源映射。其余可靠性修复以回归结果、浏览器加载和解析后的 XLSX 结构证据完成验证。

## 8. 业务规则更正记录

2026-08-30：业务方确认 Plan 3 只有 WWE（全球除美）；Plan 4 同时存在 WW（全球）和 WWE（全球除美）。该次计划组合更正仅收敛计划模型及其下游引用，不修改 Excel 样式，不扩展 Scope。

2026-08-31：在后续业务规则补充中，增加 FMU、柏盛 PCP 首诊直付和门诊第 6 次起自付 20%选项，并按个人费率对 Medical 折扣取整；同时对用户提供的报价表另存美化版。该后续变更不改变原始费率、计划组合或报价器其他业务范围。

2026-09-01：确认 `费率 Premium` 页未同步显示已选 Medical 折扣；修正为主列输出调整后每人医疗费率，并保留正式源费率对照列。另按业务方最新明确规则将柏盛 PCP 首诊直付的 Medical 折扣更正为 6%。该修正复用既有 `medicalDiscountRate` 和整元规则，不改变原始费率、计划组合、TOB 或可选福利费率。

2026-09-01：最终复核确认，单独修正 worksheet 的 `pageMargins/pageSetup` 顺序不足以消除 Excel 恢复提示；旧 `_修复版.xlsx` 仍会失败。Microsoft Excel 恢复日志显示 `/xl/styles.xml` 被删除，最终根因是 border 子节点使用 `top/bottom/left/right/diagonal`，不符合 OOXML 的 `left/right/top/bottom/diagonal` 顺序。现已修正样式 XML，统一 Excel 与页面预览的深蓝/品牌蓝视觉并隐藏网格线；最终文件已在 Microsoft Excel 中无内容修复弹窗打开，7 个工作表、样式、17% Medical 折扣及调整后/源费率均通过验证。
