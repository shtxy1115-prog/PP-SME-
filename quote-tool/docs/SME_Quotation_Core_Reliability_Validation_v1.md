# PP & Prosper SME 报价器 Core Reliability Repair v1

## 验证结论

本轮 v4 已完成可执行的 Core Reliability 修复并通过核心规则、导出模型、XLSX 二进制和浏览器加载验证。工程层面已知的 P0 实现缺陷已清除；P3WW 在业务源表中没有对应费率列，因此被明确保留为 `NEEDS_CONFIRMATION` / `PENDING_UW`，没有复用其他计划费率。该项仍是业务确认边界，不能视为已获得费率。

本报告不把浏览器环境未暴露 Blob 下载事件记为“下载通过”；同一导出路径生成的 XLSX 已通过 SheetJS 回读、ZIP 完整性检查和 openpyxl 结构检查。

## 变更范围

- 计划模型明确区分 `P3WWE`、`P3WW`、`P4WWE`、`P4WW`，每个计划保留 `code`、`group`、`area`、`rateColumn`、`outpatientMaximum` 和源表定位信息。
- 年龄/费率路径实现 `AUTO_QUOTABLE`、`MANUAL_RATE`、`PENDING_UW`、`INELIGIBLE`；65–69 岁可自动报价，70 岁以上、缺失年龄或 P3WW 缺列进入待人工费率；人工医疗费率计入总保费，待人工费率不计入且不以静默 0 代替；子女最大年龄为 25 岁。
- 福利表被规范化为结构化 `Benefit Data`，保留双语责任、各真实计划/区域组合、共享责任组、源工作表和源行号；理疗/中医/中草药、体检/免疫、牙科共享组与生育、妊娠并发症独立责任分开表达。
- Compare 使用同一批人员跨方案比较；Group 按唯一 `Plan` 计算限制，同一 Plan 的多个福利变体不重复计数；生育三年不可变更仅作提示。
- XLSX 输出包含报价、费率、每个方案 TOB、HCP、参保条件、预授权和重大既往症工作表，不包含增值服务工作表。
- 构建脚本将 CSS、核心规则、浏览器应用和本地 SheetJS 组件内嵌为单文件；无服务端、无 CDN、无运行时网络依赖。

## 固定案例验证

| 案例 | 结果 |
|---|---|
| 65 岁、69 岁 | `AUTO_QUOTABLE`，使用源费率表中的 60–65、66–69 年龄段 |
| 70 岁 | `PENDING_UW`，显示“单独核保 / 待人工费率” |
| P3WW | `PENDING_UW`，保留缺列提示，不复用 P3WWE、P4WW 或其他费率 |
| 70 岁人工医疗费率 120,000 | `MANUAL_RATE`，120,000 计入医疗及总保费 |
| 子女 25 岁 / 26 岁 | 25 岁自动报价；26 岁 `INELIGIBLE`，不计价 |
| Group：6 名员工、三个相同 P201 变体 | 不触发计划数量错误，唯一 Plan 数为 1 |
| Group：6 名员工、P201/P101/P102 | 触发唯一 Plan 数量错误 |
| Compare：同一批人员、多方案 | 不触发 Group 计划数量限制 |
| 生育：少于 5 名员工、非所有变体包含生育 | `ERROR` |
| 生育三年不可变更 | `WARNING`，不阻断其他计算 |

## 自动化测试与结构检查

- `node --check quote-tool/core.js`：通过。
- `node --check quote-tool/app.js`：通过。
- `node --check quote-tool/build-standalone.mjs`：通过。
- `node --test quote-tool/tests/core-reliability.test.mjs`：7/7 通过。
- `node quote-tool/tests/xlsx-acceptance.mjs`：5 个固定案例及 XLSX 写入/回读通过。
- XLSX `unzip -t`：通过，无压缩包错误。
- openpyxl 回读：7 个必需工作表名称一致；关键工作表均可读取；TOB 中存在 `THERAPY_TCM_HERBAL`，并存在包含“妊娠并发症”的独立责任行。

必需工作表名称为：

1. `报价 Quotation`
2. `费率 Premium`
3. `方案1 TOB`（多方案时按方案追加）
4. `昂贵医院 List of HCPs`
5. `参保条件 Eligibility`
6. `预授权 Pre-auth`
7. `重大既往症 Catastrophic PEC`

## 浏览器与离线验证

- 通过本地回环地址加载最终单文件，页面标题为 `PP & Prosper SME 报价器 · Core Reliability v4`。
- 页面包含报价表单、计划选择、P3WW 缺列提示和“导出报价 Excel”按钮。
- 最终页面浏览器运行日志为空。
- 单文件内包含 3 个脚本块，均可独立解析；本地 CSS、核心脚本、应用脚本和 SheetJS 均已内嵌。
- 未发现脚本或样式的外部 `http(s)` 依赖。
- 浏览器工具未暴露本次 Blob 下载事件，因此不把浏览器下载事件记为通过；导出文件的二进制写入、回读、ZIP 和 openpyxl 验证已通过。

## 数据与提交前检查

- 演示数据使用合成的人员编号，不包含客户真实人员清单。
- 源 Excel、用户历史报价输出和临时验证 XLSX 均未加入仓库。
- `.gitignore` 已排除 Excel 文件、系统文件、临时文件、日志和 `node_modules`。
- 运行时代码不依赖本机绝对路径；报告中的源文件定位仅用于审计追溯。
- 未完成 Microsoft Excel/WPS 人工打开验收。

## 仍待业务确认 / 不在本轮伪造

1. **P3WW 费率列**：源 `Quotation` 表没有 P3WW 列。当前系统会保留计划、区域和缺列状态，但不会生成自动费率；需业务方补充或确认正式费率后才能转为自动报价。
2. **生育三年历史规则**：当前没有保单历史输入，系统只给出 `WARNING`，不伪造历史校验结果。
3. **Excel/WPS 人工打开**：当前环境没有完成 Microsoft Excel/WPS 人工打开、分页和打印效果验收。

## 最终 P0 判断

工程 P0 修复项已完成：计划/区域映射、年龄与人工费率状态、结构化 TOB、共享限额表达、Compare/Group 规则和可审计 XLSX 输出均已落地并验证。P3WW 缺费率是源数据缺口，已被显式阻断在人工确认路径；在业务确认前，不应宣称 P3WW 已具备自动报价能力。
