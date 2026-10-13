(function (root) {
  'use strict';
  const headers = {
    name: ['姓名','姓名/编号','name','membername'], type:['人员类型','关系','type','relationship'],
    age:['年龄','age'], dob:['出生日期','生日','dob','dateofbirth'], gender:['性别','gender','sex'],
    employeeId:['员工编号','员工编号（仅员工）','employeeid'], relatedEmployeeId:['关联员工编号','关联员工编号（仅家属）','relatedemployeeid'],
    assignment:['方案','方案分配','计划','plan','assignment'],
    relatedEmployeeName:['关联员工姓名','员工姓名','relatedemployeename'],
  };
  const clean = value => String(value ?? '').trim();
  const key = value => clean(value).toLowerCase().replace(/\s/g,'');
  function nextEmployeeId(existingPeople = [], reserved = new Set()) {
    const used = new Set([...existingPeople.filter(p=>p.type==='employee').map(p=>clean(p.employeeId)), ...reserved]);
    let number = 1;
    for (const id of used) {
      const match = /^E(\d+)$/i.exec(id);
      if (match) number = Math.max(number, Number(match[1]) + 1);
    }
    let candidate = `E${String(number).padStart(3,'0')}`;
    while (used.has(candidate)) candidate = `E${String(++number).padStart(3,'0')}`;
    return candidate;
  }
  function parseRows(rows, options = {}) {
    const errors = [], people = [];
    const headerIndex = rows.findIndex(row => row.some(value => clean(value)));
    if (headerIndex < 0) return {people:[],errors:['清单为空。']};
    const columns = {};
    rows[headerIndex].forEach((value,index) => {
      const field=Object.keys(headers).find(field=>headers[field].some(alias=>key(alias)===key(value)));
      if(field) { if(columns[field]!==undefined) errors.push(`表头重复：${clean(value)}`); columns[field]=index; }
    });
    if(columns.name===undefined) errors.push('缺少「姓名」列。');
    if(columns.age===undefined && columns.dob===undefined) errors.push('需要「年龄」或「出生日期」列。');
    if(errors.length) return {people:[],errors};
    const variants=options.variants || [];
    const existingEmployees=(options.existingPeople || []).filter(p=>p.type==='employee');
    const ids=new Set(existingEmployees.map(p=>clean(p.employeeId)).filter(Boolean));
    const explicitIds=new Set(rows.slice(headerIndex+1).filter(row=>{
      const type=columns.type===undefined?'':key(row[columns.type]);
      return type==='' || type==='员工' || type==='employee';
    }).map(row=>columns.employeeId===undefined?'':clean(row[columns.employeeId])).filter(Boolean));
    let nextNumber=Number(nextEmployeeId(existingEmployees).slice(1));
    const existingNames=new Set((options.existingPeople || []).map(p=>`${p.name}|${p.dob || p.age}|${p.type}`));
    const aliases={P301:'P3WWE',P401:'P4WWE',P402:'P4WW'};
    rows.slice(headerIndex+1).forEach((row,index)=>{
      if(!row.some(value=>clean(value))) return;
      const line=headerIndex+index+2;
      const fail=message=>errors.push(`第 ${line} 行：${message}`);
      const get=field=>columns[field]===undefined?'':clean(row[columns[field]]);
      const typeValue=get('type').toLowerCase();
      const type={'':'employee','员工':'employee',employee:'employee','配偶':'spouse',spouse:'spouse','子女':'child',child:'child'}[typeValue];
      if(!type) fail('人员类型须为员工、配偶或子女。');
      const person={name:get('name'),type:type || 'employee',employeeId:get('employeeId'),relatedEmployeeId:get('relatedEmployeeId'),relatedEmployeeName:get('relatedEmployeeName'),dob:get('dob'),age:get('age'),gender:'',assignment:''};
      if(person.type==='employee' && !person.employeeId) {
        let candidate=`E${String(nextNumber).padStart(3,'0')}`;
        while(ids.has(candidate) || explicitIds.has(candidate)) candidate=`E${String(++nextNumber).padStart(3,'0')}`;
        person.employeeId=candidate;
        nextNumber++;
      }
      if(!person.name) fail('姓名不能为空。');
      if(person.dob) {
        const match=person.dob.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if(!match) fail('出生日期须为 YYYY-MM-DD。');
        else {
          const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
          const date=new Date(Date.UTC(y,m-1,d));
          if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) fail('出生日期无效。');
          person.dob=`${match[1]}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const start=options.startDate;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) fail('请先填写保障开始日期。');
          else { const [sy,sm,sd]=start.split('-').map(Number); person.age=sy-y-(sm<m || sm===m && sd<d?1:0); }
        }
      }
      if(person.age==='' || !Number.isInteger(Number(person.age)) || Number(person.age)<0 || Number(person.age)>120) fail('年龄须为 0–120 的整数。');
      else person.age=Number(person.age);
      const gender=get('gender').toLowerCase();
      person.gender={'':'','男':'male',male:'male',m:'male','女':'female',female:'female',f:'female'}[gender];
      if(person.gender===undefined) fail('性别须为男或女。');
      if(person.type==='employee' && person.employeeId) {
        if(ids.has(person.employeeId)) fail(`员工编号 ${person.employeeId} 重复。`);
        ids.add(person.employeeId);
      }
      const identity=`${person.name}|${person.dob || person.age}|${person.type}`;
      if(existingNames.has(identity)) fail('姓名、年龄/生日和人员类型相同，请核对是否重复人员。');
      existingNames.add(identity);
      if(options.mode!=='compare' && person.type==='employee') {
        const requested=get('assignment');
        const code=aliases[requested.toUpperCase()] || requested.toUpperCase();
        const matches=requested?variants.filter(v=>v.id===requested || v.planCode===code || v.name===requested):variants.length===1?variants:[];
        if(matches.length===1) person.assignment=matches[0].id;
        else if(requested || variants.length>1) fail('方案未填写或无法唯一匹配，请填写计划代码或唯一方案名称。');
      }
      people.push({...person, sourceRow:line});
    });
    const employees=[...existingEmployees,...people.filter(person=>person.type==='employee')];
    people.forEach(person=>{
      if(person.type!=='employee' && !person.relatedEmployeeId) {
        const matches=person.relatedEmployeeName?employees.filter(employee=>employee.name===person.relatedEmployeeName):employees.length===1?employees:[];
        if(matches.length===1) person.relatedEmployeeId=matches[0].employeeId;
        else if(person.relatedEmployeeName) errors.push(`第 ${person.sourceRow} 行：关联员工姓名无法唯一匹配，请核对姓名。`);
      }
      if(person.type!=='employee' && (!person.relatedEmployeeId || !ids.has(person.relatedEmployeeId))) errors.push(`第 ${person.sourceRow} 行：家属必须关联清单或已有人员中的员工编号。`);
    });
    if(!people.length && !errors.length) errors.push('清单没有人员数据。');
    return {people:errors.length?[]:people.map(({sourceRow,...person})=>person),errors};
  }
  function sheetRows(XLSX, sheet) {
    // Normalize actual Excel dates before formatted extraction; preserve text IDs.
    const normalized = {...sheet};
    Object.keys(sheet).forEach(address => {
      const cell = sheet[address];
      if (cell && cell.t === 'd' && cell.v instanceof Date) {
        normalized[address] = {...cell, z:'yyyy-mm-dd'};
        delete normalized[address].w;
      }
    });
    return XLSX.utils.sheet_to_json(normalized, {header:1, raw:false, defval:''});
  }
  const api={parseRows,sheetRows,nextEmployeeId};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.PeopleImport=api;
})(typeof window!=='undefined'?window:globalThis);
