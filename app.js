/* 레픽 스케줄 웹앱 — Supabase SPA */
const sb = supabase.createClient(window.SUPA.url, window.SUPA.anon);
const STATS = ["근무","OFF","연차","오전반차","오후반차","공휴일","병가","경조"];
const TEAMS = ["원장","실장","코디","간호","피부","마케팅"];
const FILLN = {"근무":"#eaf7ee","OFF":"#eef0f2","연차":"#dbeafe","오전반차":"#ede9fe","오후반차":"#ede9fe","공휴일":"#fee2e2","병가":"#ffedd5","경조":"#fce7f3"};
const DOW = ["일","월","화","수","목","금","토"];
const $ = s => document.querySelector(s);
const app = $("#app");

let ME=null, PROFILE=null, STAFF=[], TAB="grid", WEEK=sundayOf(new Date(2026,5,9));

function sundayOf(d){ const x=new Date(d); x.setDate(x.getDate()-x.getDay()); x.setHours(0,0,0,0); return x; }
function fmt(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function weekDates(){ return [...Array(7)].map((_,i)=>{ const d=new Date(WEEK); d.setDate(d.getDate()+i); return d; }); }
function canEditShift(){ return ["팀장","대표","관리자"].includes(PROFILE?.role); }
function canApprove(){ return ["팀장","대표","관리자"].includes(PROFILE?.role); }
function isAdmin(){ return PROFILE?.role==="관리자"; }

// ---------------- 부팅 ----------------
(async function boot(){
  if(!window.SUPA.url.includes("supabase.co")||window.SUPA.anon.startsWith("YOUR")){
    app.innerHTML = `<div class="center"><div class="auth"><h2>⚙️ 설정 필요</h2>
      <p>config.js 에 Supabase URL과 anon 키를 입력하세요. (README 참고)</p></div></div>`; return;
  }
  const { data:{ session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((_e,s)=>{ ME=s?.user||null; route(); });
  ME = session?.user||null; route();
})();

async function route(){
  if(!ME){ return renderAuth(); }
  const { data } = await sb.from("profiles").select("*").eq("id",ME.id).single();
  PROFILE = data;
  if(!PROFILE){ app.innerHTML=`<div class="center"><div class="auth"><h2>프로필 생성 중…</h2>
    <button class="btn" onclick="logout()">로그아웃</button></div></div>`; return; }
  if(!PROFILE.approved){
    app.innerHTML=`<div class="center"><div class="auth"><h2>⏳ 승인 대기</h2>
      <p>${ME.email}<br>관리자 승인 후 이용할 수 있습니다.</p>
      <button class="btn" onclick="logout()">로그아웃</button></div></div>`; return;
  }
  renderShell(); loadTab();
}

// ---------------- 인증 ----------------
function renderAuth(){
  app.innerHTML = `<div class="center"><div class="auth">
    <h2>🗓️ 레픽 스케줄</h2><p>직원 계정으로 로그인하세요.</p>
    <input id="em" type="email" placeholder="이메일">
    <input id="pw" type="password" placeholder="비밀번호">
    <button class="btn pri" onclick="login()">로그인</button>
    <button class="btn" onclick="signup()">회원가입 (관리자 승인 후 사용)</button>
    <div class="msg" id="amsg"></div></div></div>`;
}
async function login(){
  const { error } = await sb.auth.signInWithPassword({ email:$("#em").value.trim(), password:$("#pw").value });
  if(error) $("#amsg").textContent = error.message;
}
async function signup(){
  const { error } = await sb.auth.signUp({ email:$("#em").value.trim(), password:$("#pw").value });
  $("#amsg").className="msg ok";
  $("#amsg").textContent = error ? error.message : "가입 완료. 관리자 승인 후 로그인하세요.";
}
async function logout(){ await sb.auth.signOut(); location.reload(); }

// ---------------- 셸 ----------------
function renderShell(){
  const tabs = [["grid","📅 주간"],["leave","🏖️ 연차"]];
  if(canApprove()) tabs.push(["approve","✅ 승인"]);
  if(isAdmin()) tabs.push(["admin","👤 관리자"]);
  app.innerHTML = `<header><h1>🗓️ 레픽 스케줄</h1>
    <span class="pill">${PROFILE.role}</span><span class="sub">${ME.email}</span>
    <span class="spacer"></span><button class="btn" onclick="logout()">로그아웃</button></header>
    <div class="wrap">
      <div class="tabs">${tabs.map(t=>`<span class="tab ${t[0]===TAB?'on':''}" onclick="go('${t[0]}')">${t[1]}</span>`).join("")}</div>
      <div id="view"></div></div>`;
}
function go(t){ TAB=t; renderShell(); loadTab(); }
function loadTab(){ ({grid:viewGrid, leave:viewLeave, approve:viewApprove, admin:viewAdmin})[TAB]?.(); }

// ---------------- 주간 그리드 ----------------
async function viewGrid(){
  const dates = weekDates(), ds = dates.map(fmt);
  const [{data:staff}, {data:shifts}] = await Promise.all([
    sb.from("staff").select("*").eq("status","재직").order("team").order("id"),
    sb.from("shift").select("staff_id,work_date,status").gte("work_date",ds[0]).lte("work_date",ds[6])
  ]);
  STAFF = staff||[];
  const map = {}; (shifts||[]).forEach(s=>{ (map[s.staff_id] ??= {})[s.work_date]=s.status; });

  // 카드
  const today = ds[new Date().getDay()] || ds[1];
  let work=0,off=0,lv=0;
  STAFF.forEach(s=>{ const v=map[s.id]?.[today]||"근무"; v==="근무"?work++:v==="OFF"?off++:lv++; });
  const cards=[["재직",STAFF.length],["오늘 근무",work],["오늘 OFF",off],["오늘 연차/반차",lv]];

  // 헤더
  let head=`<thead><tr><th class="namecell">직원</th>`;
  dates.forEach((d,i)=>head+=`<th class="${(i===0||i===6)?'we':''}">${DOW[i]}<br><span style="font-weight:400;color:#94a3b8">${d.getMonth()+1}/${d.getDate()}</span></th>`);
  head+=`</tr></thead>`;
  let body="<tbody>";
  TEAMS.forEach(tm=>{
    const rows=STAFF.filter(s=>s.team===tm); if(!rows.length) return;
    body+=`<tr><td class="teamcell" colspan="8">${tm} · ${rows.length}명</td></tr>`;
    rows.forEach(s=>{
      body+=`<tr><td class="namecell"><b>${s.name}</b>${s.nationality?`<span class="nat">${s.nationality}</span>`:""}${s.rank?`<div class="rk">${s.rank}</div>`:""}</td>`;
      ds.forEach(dt=>{
        const v=map[s.id]?.[dt]||"근무";
        const dis=canEditShift()?"":"disabled";
        const opts=STATS.map(o=>`<option ${o===v?"selected":""}>${o}</option>`).join("");
        body+=`<td class="s${v}"><select class="st" ${dis} onchange="saveCell(${s.id},'${dt}',this)">${opts}</select></td>`;
      });
      body+="</tr>";
    });
  });
  body+="</tbody>";
  $("#view").innerHTML = `
    <div class="cards">${cards.map(c=>`<div class="card"><div class="n">${c[1]}</div><div class="l">${c[0]}</div></div>`).join("")}</div>
    <div class="box" style="display:flex;align-items:center;gap:10px;padding:10px 16px">
      <button class="btn" onclick="moveWeek(-1)">◀ 지난주</button>
      <b>${fmt(dates[0])} ~ ${fmt(dates[6])}</b>
      <button class="btn" onclick="moveWeek(1)">다음주 ▶</button>
      <button class="btn" onclick="moveWeek(0)">이번주</button>
      <span class="spacer"></span>
      <span class="sub">${canEditShift()?"셀을 바꾸면 즉시 저장됩니다":"읽기 전용 (편집은 팀장 이상)"}</span>
    </div>
    <div class="gridwrap"><table>${head}${body}</table></div>
    <div class="legend">${STATS.map(s=>`<span class="lg" style="background:${FILLN[s]}">${s}</span>`).join("")}</div>`;
}
function moveWeek(n){ if(n===0){WEEK=sundayOf(new Date());} else {WEEK.setDate(WEEK.getDate()+7*n);} viewGrid(); }
async function saveCell(staff_id, work_date, sel){
  const td=sel.closest("td"); td.className="s"+sel.value;
  const { error } = await sb.from("shift").upsert(
    { staff_id, work_date, status:sel.value, updated_by:ME.id, updated_at:new Date().toISOString() },
    { onConflict:"staff_id,work_date" });
  if(error){ alert("저장 실패: "+error.message); }
}

// ---------------- 연차 ----------------
async function viewLeave(){
  const { data:staff } = await sb.from("staff").select("id,name").order("name");
  const mine = PROFILE.staff_id;
  const { data:reqs } = await sb.from("leave_request")
    .select("*").order("created_at",{ascending:false}).limit(50);
  const sname = Object.fromEntries((staff||[]).map(s=>[s.id,s.name]));
  const myReqs = (reqs||[]).filter(r=>!mine || r.staff_id===mine || canApprove());
  $("#view").innerHTML = `
    <div class="box"><h3>연차·휴가 신청</h3>
      <div class="row" style="border:0;flex-wrap:wrap">
        ${mine?`<span class="pill">신청자: ${sname[mine]||"-"}</span>`:`<select class="fld" id="lstaff">${(staff||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select>`}
        <select class="fld" id="ltype">${["연차","오전반차","오후반차","병가","경조","공가"].map(t=>`<option>${t}</option>`).join("")}</select>
        <input class="fld" type="date" id="lstart"><span>~</span><input class="fld" type="date" id="lend">
        <input class="fld" type="number" id="ldays" value="1" step="0.5" style="width:80px" title="일수">
        <input class="fld" id="lreason" placeholder="사유(선택)" style="flex:1;min-width:120px">
        <button class="btn pri" onclick="submitLeave()">신청</button>
      </div><div class="msg ok" id="lmsg"></div></div>
    <div class="box"><h3>신청 내역</h3>
      ${myReqs.length? myReqs.map(r=>`<div class="row">
        <span>${sname[r.staff_id]||"?"} · ${r.type} · ${r.start_date}${r.end_date!==r.start_date?"~"+r.end_date:""} (${r.days}일)</span>
        <span class="pill">${r.approval}</span></div>`).join("") : '<div class="sub">내역 없음</div>'}</div>`;
}
async function submitLeave(){
  const staff_id = PROFILE.staff_id || +$("#lstaff").value;
  if(!staff_id){ return alert("직원을 지정하세요(관리자에게 staff 연결 요청)"); }
  const start=$("#lstart").value, end=$("#lend").value||$("#lstart").value;
  if(!start){ return alert("시작일을 선택하세요"); }
  const { error } = await sb.from("leave_request").insert(
    { staff_id, type:$("#ltype").value, start_date:start, end_date:end, days:+$("#ldays").value, reason:$("#lreason").value, approval:"신청" });
  if(error) alert(error.message); else { $("#lmsg").textContent="신청 완료"; viewLeave(); }
}

// ---------------- 승인 ----------------
async function viewApprove(){
  const { data:staff } = await sb.from("staff").select("id,name");
  const sname = Object.fromEntries((staff||[]).map(s=>[s.id,s.name]));
  const { data:reqs } = await sb.from("leave_request").select("*")
    .in("approval",["신청","팀장승인","대표승인"]).order("created_at");
  $("#view").innerHTML = `<div class="box"><h3>승인 대기 (${(reqs||[]).length})</h3>
    ${(reqs||[]).length? reqs.map(r=>`<div class="row">
      <span>${sname[r.staff_id]||"?"} · ${r.type} · ${r.start_date}~${r.end_date} (${r.days}일) ${r.reason?"· "+r.reason:""}</span>
      <span><span class="pill">${r.approval}</span>
        <button class="btn pri" onclick="approve(${r.id},1)">승인</button>
        <button class="btn" onclick="approve(${r.id},0)">반려</button></span></div>`).join("")
      : '<div class="sub">대기 중인 신청이 없습니다</div>'}</div>`;
}
async function approve(id, ok){
  const next = ok ? "완료" : "반려";
  const { data:r, error } = await sb.from("leave_request").update({ approval:next, approver:ME.id })
    .eq("id",id).select().single();
  if(error){ return alert(error.message); }
  if(ok && r){ // 승인 시 근무 스케줄에 자동 반영
    const map={"연차":"연차","오전반차":"오전반차","오후반차":"오후반차","병가":"병가","경조":"경조","공가":"OFF"};
    const st=map[r.type]||"연차"; const rows=[];
    let d=new Date(r.start_date), end=new Date(r.end_date);
    while(d<=end){ rows.push({staff_id:r.staff_id, work_date:fmt(d), status:st, updated_by:ME.id}); d.setDate(d.getDate()+1); }
    await sb.from("shift").upsert(rows,{onConflict:"staff_id,work_date"});
  }
  viewApprove();
}

// ---------------- 관리자 ----------------
async function viewAdmin(){
  const [{data:profs},{data:staff}] = await Promise.all([
    sb.from("profiles").select("*").order("created_at"),
    sb.from("staff").select("id,name,team").order("team").order("name")
  ]);
  const opt = (staff||[]).map(s=>`<option value="${s.id}">${s.name} (${s.team})</option>`).join("");
  $("#view").innerHTML = `<div class="box"><h3>계정 승인 · 권한 (${(profs||[]).length})</h3>
    ${(profs||[]).map(p=>`<div class="row">
      <span>${p.email} ${p.approved?'<span class="pill ok">승인됨</span>':'<span class="pill">대기</span>'}</span>
      <span>
        <select class="fld" id="r_${p.id}">${["직원","팀장","대표","관리자"].map(r=>`<option ${r===p.role?"selected":""}>${r}</option>`).join("")}</select>
        <select class="fld" id="s_${p.id}"><option value="">직원연결…</option>${opt.replace(`value="${p.staff_id}"`,`value="${p.staff_id}" selected`)}</select>
        <button class="btn pri" onclick="saveProfile('${p.id}',true)">저장·승인</button>
        <button class="btn" onclick="saveProfile('${p.id}',false)">승인해제</button>
      </span></div>`).join("")}</div>
    <div class="box"><h3>안내</h3><div class="sub">신규 가입자는 여기서 권한·직원연결 후 <b>저장·승인</b>해야 로그인됩니다.
      팀장 이상=그리드 편집/연차 승인, 대표·관리자=직원마스터·OT 편집, 관리자=계정관리.</div></div>`;
}
async function saveProfile(id, approve){
  const role=$("#r_"+id).value, sid=$("#s_"+id).value||null;
  const { error } = await sb.from("profiles").update({ role, staff_id:sid?+sid:null, approved:approve }).eq("id",id);
  if(error) alert(error.message); else viewAdmin();
}
window.go=go;window.login=login;window.signup=signup;window.logout=logout;
window.saveCell=saveCell;window.moveWeek=moveWeek;window.submitLeave=submitLeave;
window.approve=approve;window.saveProfile=saveProfile;
