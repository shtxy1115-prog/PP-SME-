import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const importer = require('../people-import.js');
const XLSX = require('../vendor/xlsx.full.min.js');
test('真实 Excel 日期及带前导零的编号可导入，CSV 同样可读', () => {
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['姓名','出生日期','员工编号'],['测试员工',new Date(1990,9,20),'001']]),'人员');
  const loaded=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{cellDates:true});
  const result=importer.parseRows(importer.sheetRows(XLSX,loaded.Sheets['人员']),{startDate:'2026-10-13'});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.people[0].age,35);
  assert.equal(result.people[0].employeeId,'001');
  const csv=XLSX.read('姓名,年龄\n测试员工,30',{type:'string'});
  assert.equal(importer.parseRows(importer.sheetRows(XLSX,csv.Sheets[csv.SheetNames[0]])).people[0].age,30);
});
test('保留已有人员并支持关联已有员工，比较模式不强制方案', () => {
  const existingPeople=[{name:'原员工',type:'employee',employeeId:'001',age:40}];
  const result=importer.parseRows([['姓名','年龄','人员类型','关联员工编号'],['家属',30,'配偶','001']],{existingPeople});
  assert.deepEqual(result.errors,[]);
  assert.equal(existingPeople.length,1);
  assert.equal(importer.parseRows([['姓名','年龄'],['新员工',30]],{mode:'compare',variants:[{id:'a'},{id:'b'}]}).errors.length,0);
});
test('清单导入保留编号、出生日期算年龄并关联家属', () => {
  const result = importer.parseRows([['姓名','人员类型','出生日期','年龄','员工编号','关联员工编号'],['张三','员工','1990-10-20','','001',''],['小张','子女','2020-01-01','','','001']], {startDate:'2026-10-13', variants:[{id:'v1',planCode:'P201'}]});
  assert.deepEqual(result.errors, []);
  assert.equal(result.people[0].age,35);
  assert.equal(result.people[0].employeeId,'001');
  assert.equal(result.people[0].assignment,'v1');
  assert.equal(result.people[1].relatedEmployeeId,'001');
});
test('错误年龄、重复编号和不存在的家属关联均阻止整批导入', () => {
  const result=importer.parseRows([['姓名','年龄','人员类型','员工编号','关联员工编号'],['甲','abc','员工','1',''],['乙',30,'员工','1',''],['丙',20,'配偶','','9']],{});
  assert.ok(result.errors.length>=3);
  assert.equal(result.people.length,0);
});
test('多方案不能猜测分配，指定唯一计划可以匹配', () => {
  const variants=[{id:'a',planCode:'P201'},{id:'b',planCode:'P4WW'}];
  assert.ok(importer.parseRows([['姓名','年龄'],['甲',30]],{variants}).errors.length);
  const result=importer.parseRows([['姓名','年龄','方案'],['甲',30,'P402']],{variants});
  assert.equal(result.people[0].assignment,'b');
});
