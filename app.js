/* TaskByte - draft task tracker. Vanilla JS, localStorage persistence. */
(function(){
"use strict";
const LS_KEY = "taskbyte.v1";
const PALETTE = ["#FF5A2D","#2563EB","#0E9F6E","#7C3AED","#DB2777","#0D9488","#B7791F","#475569","#DC2626","#5B8DEF"];
const STATUS = [
  {id:"todo", label:"To Do", color:"#B7791F", soft:"var(--amber-soft)", ink:"var(--amber)"},
  {id:"inprogress", label:"In Progress", color:"#2563EB", soft:"var(--blue-soft)", ink:"var(--blue)"},
  {id:"done", label:"Completed", color:"#0E9F6E", soft:"var(--green-soft)", ink:"var(--green)"}
];
const EVENT_DEFS = [
  {id:"statusChange", label:"Task status changes", sub:"Whenever a card moves between columns"},
  {id:"newTask", label:"New task created", sub:"When anyone adds a task to the board"},
  {id:"dueSoon", label:"Due date approaching", sub:"A task enters its last 48 hours"},
  {id:"overdue", label:"Task goes overdue", sub:"A task passes its due date unfinished"}
];

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const dayMs = 86400000;
const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dISO = d => { const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()); };
const fmtDue = iso => {
  if(!iso) return null;
  const d = new Date(iso+"T00:00:00");
  const diff = Math.round((d - todayStart())/dayMs);
  const label = d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  if(diff < 0) return {text: label + " · overdue", cls:"overdue"};
  if(diff === 0) return {text:"Today", cls:"soon"};
  if(diff === 1) return {text:"Tomorrow", cls:"soon"};
  if(diff <= 3) return {text:label, cls:"soon"};
  return {text:label, cls:""};
};

function rel(n){ const d = todayStart(); d.setDate(d.getDate()+n); return dISO(d); }

function seed(){
  const owners = ["Ankit","Priya","Rahul","Sara"].map((n,i)=>({name:n,color:PALETTE[i]}));
  const customers = ["Acme Trading","Gulf Retail Group","Delta Bank","Orbit Media","NoonCart"].map((n,i)=>({name:n,color:PALETTE[i+4]}));
  const types = ["Development","Proposal Submission","Demo","Meeting"].map((n,i)=>({name:n,color:PALETTE[i+1]}));
  const T = (title,owner,customer,type,status,due,prio,notes)=>({id:uid(),title,owner,customer,type,status,due,priority:prio,notes:notes||"",createdAt:Date.now(),updatedAt:Date.now()});
  const tasks = [
    T("RFP response - Delta Bank core banking","Ankit","Delta Bank","Proposal Submission","inprogress",rel(2),"high","Commercial annex pending from finance."),
    T("Build pipeline health dashboard","Rahul","Acme Trading","Development","inprogress",rel(4),"med",""),
    T("Product demo - Orbit Media analytics suite","Sara","Orbit Media","Demo","todo",rel(1),"high","Focus on the new cohort view."),
    T("Weekly delivery sync","Ankit","Gulf Retail Group","Meeting","todo",rel(0),"med",""),
    T("Fix export timeout on reports","Rahul","Acme Trading","Development","todo",rel(-1),"high","Times out beyond 50k rows."),
    T("Proposal - NoonCart fulfilment pilot","Priya","NoonCart","Proposal Submission","todo",rel(5),"med",""),
    T("Data model review with Gulf Retail team","Sara","Gulf Retail Group","Meeting","inprogress",rel(0),"low",""),
    T("UAT sign-off pack for phase 2","Priya","Delta Bank","Development","todo",rel(7),"med",""),
    T("Demo rehearsal - agent workflow","Ankit","NoonCart","Demo","done",rel(-2),"med",""),
    T("Security questionnaire - Delta Bank","Rahul","Delta Bank","Proposal Submission","inprogress",rel(3),"high",""),
    T("Onboard new analyst to tracker","Sara","Orbit Media","Meeting","done",rel(-4),"low",""),
    T("Mobile layout polish - board view","Rahul","Acme Trading","Development","done",rel(-3),"med",""),
    T("Draft QBR deck for Gulf Retail","Priya","Gulf Retail Group","Meeting","todo",rel(9),"low",""),
    T("Latency fix on search endpoint","Rahul","Orbit Media","Development","inprogress",rel(-2),"high","p95 at 1.9s, target 600ms."),
    T("Pilot kickoff agenda - NoonCart","Ankit","NoonCart","Meeting","todo",rel(6),"med","")
  ];
  return {
    v:1, tasks, owners, customers, types,
    settings:{
      showCompleted:true,
      notifications:{enabled:true, emails:["ankitsamriwal@gmail.com"], events:{statusChange:true,newTask:true,dueSoon:false,overdue:true}},
      digest:{enabled:false, email:"ankitsamriwal@gmail.com", time:"09:00"}
    },
    notifLog:[], notifSeen:0
  };
}

let state;
try{ state = JSON.parse(localStorage.getItem(LS_KEY)) || seed(); }catch(e){ state = seed(); }
if(!state.settings || !state.settings.notifications) state = seed();
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));

let view = "board";
let editingId = null;

/* ---------- helpers ---------- */
const ownerColor = n => { const o = state.owners.find(x=>x.name===n); return o?o.color:"#475569"; };
const custColor = n => { const o = state.customers.find(x=>x.name===n); return o?o.color:"#475569"; };
const typeColor = n => { const o = state.types.find(x=>x.name===n); return o?o.color:"#475569"; };
const initials = n => n.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
const stDef = id => STATUS.find(s=>s.id===id);

function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = '<span class="tdot"></span><span>'+esc(msg)+"</span>";
  $("#toastZone").appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),320); }, 3400);
}

/* ---------- notification stub ---------- */
function queueNotification(kind, text){
  const n = state.settings.notifications;
  if(!n.enabled) return;
  if(!n.events[kind]) return;
  const recips = n.emails.filter(e=>e.trim());
  if(!recips.length){ toast("No notification emails configured - add one in Settings"); return; }
  state.notifLog.unshift({ts:Date.now(), kind, text, recipients:recips.slice()});
  if(state.notifLog.length>60) state.notifLog.length=60;
  save();
  toast("Notification queued to "+recips.length+" recipient"+(recips.length>1?"s":"")+" (stub - no email sent yet)");
  renderBell();
}
function renderBell(){
  const unseen = Math.max(0, state.notifLog.length - (state.notifSeen||0));
  const b = $("#bellBadge");
  if(unseen>0){ b.textContent = unseen>9?"9+":unseen; b.classList.remove("hidden"); } else b.classList.add("hidden");
}

/* ---------- stats ---------- */
function renderStats(){
  const t0 = todayStart().getTime();
  const active = state.tasks.filter(t=>t.status!=="done").length;
  const dueWeek = state.tasks.filter(t=>t.status!=="done" && t.due && (new Date(t.due)-t0)>=0 && (new Date(t.due)-t0)<7*dayMs).length;
  const overdue = state.tasks.filter(t=>t.status!=="done" && t.due && new Date(t.due)<todayStart()).length;
  const doneWeek = state.tasks.filter(t=>t.status==="done" && t.updatedAt >= t0-7*dayMs).length;
  $("#statsRow").innerHTML =
    '<div class="stat accent"><div class="num">'+active+'</div><div class="lbl">Open tasks</div></div>'+
    '<div class="stat"><div class="num">'+dueWeek+'</div><div class="lbl">Due this week</div></div>'+
    '<div class="stat red"><div class="num">'+overdue+'</div><div class="lbl">Overdue</div></div>'+
    '<div class="stat green"><div class="num">'+doneWeek+'</div><div class="lbl">Done this week</div></div>';
}

/* ---------- board ---------- */
function taskCard(t){
  const due = fmtDue(t.due);
  const s = stDef(t.status);
  return '<div class="tcard '+(t.status==="done"?"done":"")+'" draggable="true" data-id="'+t.id+'">'+
    '<div class="tcard-top"><span class="drag-handle"><svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="8" r="1.6"/><circle cx="9" cy="8" r="1.6"/><circle cx="3" cy="13" r="1.6"/><circle cx="9" cy="13" r="1.6"/></svg></span>'+
    '<div class="tcard-title">'+esc(t.title)+'</div></div>'+
    '<div class="tcard-meta">'+
      '<span class="chip" style="background:'+hexA(typeColor(t.type),.13)+';color:'+typeColor(t.type)+'"><span class="cdot" style="background:'+typeColor(t.type)+'"></span>'+esc(t.type)+'</span>'+
      '<span class="chip" style="background:'+hexA(custColor(t.customer),.13)+';color:'+custColor(t.customer)+'">'+esc(t.customer)+'</span>'+
      '<span class="prio '+t.priority+'">'+t.priority.toUpperCase()+'</span>'+
    '</div>'+
    '<div class="tcard-foot">'+
      (due?'<span class="due '+due.cls+'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'+due.text+'</span>':"<span></span>")+
      '<span class="avatar" style="background:'+ownerColor(t.owner)+'" title="'+esc(t.owner)+'">'+initials(t.owner)+'</span>'+
    '</div></div>';
}
function hexA(hex,a){
  const h = hex.replace("#","");
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return "rgba("+r+","+g+","+b+","+a+")";
}
function renderBoard(){
  const main = $("#main");
  const showDone = state.settings.showCompleted;
  let html = '<div class="board">';
  STATUS.forEach(s=>{
    if(s.id==="done" && !showDone) return;
    const items = state.tasks.filter(t=>t.status===s.id);
    html += '<div class="col" data-status="'+s.id+'"><div class="col-head">'+
      '<span class="col-dot" style="background:'+s.color+'"></span>'+
      '<span class="col-title">'+s.label+'</span>'+
      '<span class="col-count">'+items.length+'</span>';
    if(s.id==="done"){
      html += '<button class="col-eye" id="hideDoneBtn" title="Hide completed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/></svg></button>';
    }
    html += '</div><div class="col-body" data-status="'+s.id+'">';
    html += items.length ? items.map(taskCard).join("") : '<div class="col-empty">Nothing here yet</div>';
    html += '</div></div>';
  });
  html += '</div>';
  if(!showDone){
    const doneN = state.tasks.filter(t=>t.status==="done").length;
    html += '<div style="text-align:center;margin-top:16px"><button class="btn ghost sm" id="showDoneBtn">Show '+doneN+' completed task'+(doneN===1?"":"s")+'</button></div>';
  }
  main.innerHTML = html;
  bindBoard();
}
function bindBoard(){
  $$(".tcard").forEach(card=>{
    card.addEventListener("dragstart", e=>{
      e.dataTransfer.setData("text/plain", card.dataset.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", ()=>card.classList.remove("dragging"));
    card.addEventListener("click", e=>{
      if(card.classList.contains("dragging")) return;
      openTaskModal(card.dataset.id);
    });
  });
  $$(".col-body").forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.parentElement.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.parentElement.classList.remove("dragover"));
    col.addEventListener("drop", e=>{
      e.preventDefault();
      col.parentElement.classList.remove("dragover");
      const id = e.dataTransfer.getData("text/plain");
      const t = state.tasks.find(x=>x.id===id);
      const ns = col.dataset.status;
      if(t && t.status!==ns){ setStatus(t, ns); }
    });
  });
  const hide = $("#hideDoneBtn");
  if(hide) hide.addEventListener("click", ()=>{ state.settings.showCompleted=false; save(); render(); toast("Completed tasks hidden - re-enable in Settings"); });
  const show = $("#showDoneBtn");
  if(show) show.addEventListener("click", ()=>{ state.settings.showCompleted=true; save(); render(); });
}
function setStatus(t, ns){
  const from = stDef(t.status).label, to = stDef(ns).label;
  t.status = ns; t.updatedAt = Date.now(); save();
  queueNotification("statusChange", '"'+t.title+'" moved from '+from+' to '+to+' ('+t.owner+')');
  render();
}

/* ---------- group views ---------- */
function groupView(kind){
  const list = kind==="owners"?state.owners:kind==="customers"?state.customers:state.types;
  const key = kind==="owners"?"owner":kind==="customers"?"customer":"type";
  let html = '<div class="group-grid">';
  list.forEach(g=>{
    const items = state.tasks.filter(t=>t[key]===g.name);
    const bySt = STATUS.map(s=>items.filter(t=>t.status===s.id).length);
    const total = items.length;
    const open = total - bySt[2];
    const upcoming = items.filter(t=>t.status!=="done"&&t.due).sort((a,b)=>a.due<b.due?-1:1).slice(0,1)[0];
    html += '<div class="gcard"><div class="gcard-head">';
    if(kind==="owners") html += '<span class="avatar lg" style="background:'+g.color+'">'+initials(g.name)+'</span>';
    else html += '<span class="avatar lg" style="background:'+g.color+';border-radius:14px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(kind==="customers"?'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>':'<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.41H4a1 1 0 0 0-1 1v5.59A2 2 0 0 0 3.59 11l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="7.5" r=".5"/>')+'</svg></span>';
    html += '<div style="flex:1"><div class="gcard-name">'+esc(g.name)+'</div><div class="gcard-sub">'+open+' open · '+bySt[2]+' completed'+(upcoming?' · next due '+fmtDue(upcoming.due).text:'')+'</div></div></div>';
    if(total){
      html += '<div class="gbars">'+STATUS.map((s,i)=> bySt[i]?'<div class="gbar" style="width:'+(bySt[i]/total*100)+'%;background:'+s.color+'"></div>':'').join("")+'</div>';
      html += '<div class="glegend"><span><b>'+bySt[0]+'</b> to do</span><span><b>'+bySt[1]+'</b> in progress</span><span><b>'+bySt[2]+'</b> done</span></div>';
      const shown = items.slice().sort((a,b)=>(a.status==="done")-(b.status==="done")||((a.due||"9999")<(b.due||"9999")?-1:1)).slice(0,5);
      shown.forEach(t=>{
        const due = fmtDue(t.due);
        html += '<div class="gtask'+(t.status==="done"?" done":"")+'" data-id="'+t.id+'" style="cursor:pointer">'+
          '<span class="status-dot" style="background:'+stDef(t.status).color+'"></span>'+
          '<span class="gtask-title">'+esc(t.title)+'</span>'+
          (due?'<span class="due '+due.cls+'" style="font-size:11px">'+due.text+'</span>':'')+
        '</div>';
      });
      if(items.length>5) html += '<div style="font-size:12px;color:var(--faint);text-align:center;padding:4px">+'+(items.length-5)+' more</div>';
    } else {
      html += '<div class="col-empty">No tasks assigned</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  $("#main").innerHTML = html;
  $$(".gtask").forEach(el=>el.addEventListener("click",()=>openTaskModal(el.dataset.id)));
}

/* ---------- settings ---------- */
function catSection(title, desc, kind){
  const list = state[kind];
  const key = kind==="owners"?"owner":kind==="customers"?"customer":"type";
  return '<div class="set-sec"><h3>'+title+'</h3><div class="desc">'+desc+'</div>'+
    '<div class="taglist">'+list.map((g,i)=>'<span class="tagitem"><span class="cdot" style="background:'+g.color+'"></span>'+esc(g.name)+'<button data-del="'+kind+':'+i+'" title="Remove">&times;</button></span>').join("")+'</div>'+
    '<div class="inline-add"><input class="input" placeholder="Add '+key+'…" data-addinput="'+kind+'"><button class="btn primary sm" data-add="'+kind+'">Add</button></div></div>';
}
function renderSettings(){
  const s = state.settings, n = s.notifications, d = s.digest;
  let html = '<div class="set-sec"><h3>Board</h3><div class="desc">Control what the kanban board shows.</div>'+
    '<div class="set-row"><div><div class="lbl">Show completed tasks</div><div class="sub">Turn off to hide the Completed column from the board</div></div>'+
    '<label class="switch"><input type="checkbox" id="setShowDone" '+(s.showCompleted?"checked":"")+'><span class="tr"></span><span class="th"></span></label></div></div>';

  html += catSection("Task types","Workflow categories such as Development or Proposal Submission. Custom types appear everywhere - chips, views and filters.","types");
  html += catSection("Owners","People who own tasks.","owners");
  html += catSection("Customers","Customers or accounts tasks belong to.","customers");

  html += '<div class="set-sec"><h3>Notifications</h3><div class="desc">Choose who gets emailed when tasks move. Add recipient emails and pick the events that fire.</div>'+
    '<div class="set-row"><div><div class="lbl">Email notifications</div><div class="sub">Master switch for all event emails</div></div>'+
    '<label class="switch"><input type="checkbox" id="setNotifEnabled" '+(n.enabled?"checked":"")+'><span class="tr"></span><span class="th"></span></label></div>'+
    '<div style="margin-top:8px"><div class="lbl" style="font-size:12.5px;font-weight:700;margin-bottom:8px">Recipients</div>'+
    '<div class="taglist">'+n.emails.map((e,i)=>'<span class="tagitem">'+esc(e)+'<button data-delemail="'+i+'" title="Remove">&times;</button></span>').join("")+'</div>'+
    '<div class="inline-add"><input class="input" type="email" placeholder="name@company.com" id="newEmail"><button class="btn primary sm" id="addEmailBtn">Add</button></div></div>'+
    '<div style="margin-top:14px"><div class="lbl" style="font-size:12.5px;font-weight:700;margin-bottom:4px">Fire on</div>'+
    EVENT_DEFS.map(ev=>'<label class="checkrow"><input type="checkbox" data-event="'+ev.id+'" '+(n.events[ev.id]?"checked":"")+'><span>'+ev.label+'<span style="display:block;font-size:11.5px;color:var(--muted);font-weight:500">'+ev.sub+'</span></span></label>').join("")+'</div>'+
    '<button class="btn ghost block" id="testNotifBtn" style="margin-top:12px">Send test notification</button>'+
    '<div class="stubnote"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>Draft mode: emails are not actually sent yet. Each event is queued into the notification log (bell icon, top right) exactly as it would be delivered.</span></div></div>';

  html += '<div class="set-sec"><h3>Daily task report</h3><div class="desc">One consolidated email with the full board - open, due and overdue - sent once a day to a single address.</div>'+
    '<div class="set-row"><div><div class="lbl">Daily report</div><div class="sub">Delivered every morning</div></div>'+
    '<label class="switch"><input type="checkbox" id="setDigestEnabled" '+(d.enabled?"checked":"")+'><span class="tr"></span><span class="th"></span></label></div>'+
    '<div class="field" style="margin-top:10px"><label>Send to</label><input class="input" type="email" id="digestEmail" value="'+esc(d.email)+'" placeholder="you@company.com"></div>'+
    '<div class="field"><label>Send at</label><input class="input" type="time" id="digestTime" value="'+esc(d.time)+'"></div>'+
    '<div style="display:flex;gap:8px"><button class="btn primary" id="digestSave" style="flex:1">Save report settings</button><button class="btn ghost" id="digestPreview" style="flex:1">Preview report</button></div>'+
    '<div class="stubnote"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>Scheduling is stubbed for now - this saves the configuration only. The send pipeline gets wired up in a later pass.</span></div></div>';

  html += '<div class="set-sec"><h3>Data</h3><div class="desc">Everything lives in this browser for the draft. Export to keep a copy.</div>'+
    '<div style="display:flex;gap:8px"><button class="btn ghost" id="exportBtn" style="flex:1">Export JSON</button><button class="btn danger" id="resetBtn" style="flex:1">Reset demo data</button></div></div>';

  $("#settingsBody").innerHTML = html;
  bindSettings();
}
function bindSettings(){
  $("#setShowDone").addEventListener("change", e=>{ state.settings.showCompleted=e.target.checked; save(); render(); });
  $("#setNotifEnabled").addEventListener("change", e=>{ state.settings.notifications.enabled=e.target.checked; save(); toast(e.target.checked?"Notifications on":"Notifications off"); });
  $$("[data-event]").forEach(cb=>cb.addEventListener("change", ()=>{ state.settings.notifications.events[cb.dataset.event]=cb.checked; save(); }));
  $$("[data-del]").forEach(b=>b.addEventListener("click", ()=>{
    const [kind,i] = b.dataset.del.split(":");
    const name = state[kind][+i].name;
    const key = kind==="owners"?"owner":kind==="customers"?"customer":"type";
    const used = state.tasks.some(t=>t[key]===name);
    if(used){ toast('"'+name+'" is used by tasks - reassign them first'); return; }
    state[kind].splice(+i,1); save(); renderSettings();
  }));
  $$("[data-add]").forEach(b=>b.addEventListener("click", ()=>{
    const kind = b.dataset.add;
    const inp = document.querySelector('[data-addinput="'+kind+'"]');
    const name = inp.value.trim();
    if(!name) return;
    if(state[kind].some(g=>g.name.toLowerCase()===name.toLowerCase())){ toast("Already exists"); return; }
    state[kind].push({name, color:PALETTE[state[kind].length % PALETTE.length]});
    save(); renderSettings(); toast('Added "'+name+'"');
  }));
  $$("[data-addinput]").forEach(inp=>inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); document.querySelector('[data-add="'+inp.dataset.addinput+'"]').click(); } }));
  $("#addEmailBtn").addEventListener("click", ()=>{
    const inp = $("#newEmail"); const v = inp.value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ toast("That doesn't look like an email address"); return; }
    if(state.settings.notifications.emails.includes(v)){ toast("Already in the list"); return; }
    state.settings.notifications.emails.push(v); save(); renderSettings();
  });
  $("#newEmail").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#addEmailBtn").click(); } });
  $$("[data-delemail]").forEach(b=>b.addEventListener("click", ()=>{ state.settings.notifications.emails.splice(+b.dataset.delemail,1); save(); renderSettings(); }));
  $("#testNotifBtn").addEventListener("click", ()=>{
    queueNotification("newTask", "Test notification - TaskByte notifications are configured correctly");
    renderBell();
  });
  $("#digestSave").addEventListener("click", ()=>{
    const em = $("#digestEmail").value.trim();
    if(state.settings.digest.enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast("Add a valid report email first"); return; }
    state.settings.digest.email = em;
    state.settings.digest.time = $("#digestTime").value || "09:00";
    save(); toast("Report settings saved");
  });
  $("#setDigestEnabled").addEventListener("change", e=>{ state.settings.digest.enabled=e.target.checked; save(); });
  $("#digestPreview").addEventListener("click", openDigestPreview);
  $("#exportBtn").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "taskbyte-export.json"; a.click();
  });
  $("#resetBtn").addEventListener("click", ()=>{
    if(!confirm("Reset everything back to the demo dataset?")) return;
    state = seed(); save(); render(); renderSettings(); toast("Demo data restored");
  });
}

/* ---------- digest preview ---------- */
function openDigestPreview(){
  const t0 = todayStart().getTime();
  const open = state.tasks.filter(t=>t.status!=="done");
  const overdue = open.filter(t=>t.due && new Date(t.due)<todayStart());
  const dueToday = open.filter(t=>t.due && Math.round((new Date(t.due)-t0)/dayMs)===0);
  const byOwner = state.owners.map(o=>({n:o.name, c:open.filter(t=>t.owner===o.name).length})).filter(x=>x.c>0);
  showModal('<div class="eyebrow">PREVIEW · NOT SENT</div><h2>Daily task report</h2>'+
    '<div class="digest"><h4>TaskByte daily digest</h4><div style="color:var(--muted);font-size:12px">'+new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})+' · would go to '+esc(state.settings.digest.email||"(no email set)")+' at '+esc(state.settings.digest.time)+'</div>'+
    '<div class="dsec"><div class="dsec-t">Snapshot</div>'+
      '<div class="dline"><span>Open tasks</span><span>'+open.length+'</span></div>'+
      '<div class="dline"><span>Overdue</span><span>'+overdue.length+'</span></div>'+
      '<div class="dline"><span>Due today</span><span>'+dueToday.length+'</span></div></div>'+
    '<div class="dsec"><div class="dsec-t">Open by owner</div>'+
      (byOwner.length?byOwner.map(x=>'<div class="dline"><span>'+esc(x.n)+'</span><span>'+x.c+'</span></div>').join(""):'<div class="dline"><span>No open tasks</span><span></span></div>')+'</div>'+
    '<div class="dsec"><div class="dsec-t">Needs attention</div>'+
      (overdue.slice(0,5).map(t=>'<div class="dline"><span>'+esc(t.title)+'</span><span>overdue</span></div>').join("")||'<div class="dline"><span>Nothing overdue</span><span></span></div>')+'</div></div>'+
    '<div class="modal-actions"><button class="btn primary" id="modalClose">Done</button></div>');
  $("#modalClose").addEventListener("click", closeModal);
}

/* ---------- task modal ---------- */
function opts(list, sel){ return list.map(g=>'<option '+(g.name===sel?"selected":"")+'>'+esc(g.name)+'</option>').join(""); }
function openTaskModal(id){
  editingId = id || null;
  const t = id ? state.tasks.find(x=>x.id===id) : {title:"",owner:state.owners[0].name,customer:state.customers[0].name,type:state.types[0].name,status:"todo",due:dISO(todayStart()),priority:"med",notes:""};
  showModal('<div class="eyebrow">'+(id?"EDIT TASK":"NEW TASK")+'</div><h2>'+(id?"Edit task":"Add a task")+'</h2>'+
    '<div class="field"><label>Title</label><input class="input" id="fTitle" value="'+esc(t.title)+'" placeholder="What needs doing?"></div>'+
    '<div class="modal mrow">'+
      '<div class="field"><label>Owner</label><select class="input" id="fOwner">'+opts(state.owners,t.owner)+'</select></div>'+
      '<div class="field"><label>Customer</label><select class="input" id="fCustomer">'+opts(state.customers,t.customer)+'</select></div></div>'+
    '<div class="modal mrow">'+
      '<div class="field"><label>Type</label><select class="input" id="fType">'+opts(state.types,t.type)+'</select></div>'+
      '<div class="field"><label>Due date</label><input class="input" type="date" id="fDue" value="'+(t.due||"")+'"></div></div>'+
    '<div class="field"><label>Priority</label><div class="status-seg" id="fPrio">'+
      ["low","med","high"].map(p=>'<button data-p="'+p+'" class="'+(t.priority===p?"active":"")+'">'+p.toUpperCase()+'</button>').join("")+'</div></div>'+
    '<div class="field"><label>Status</label><div class="status-seg" id="fStatus">'+
      STATUS.map(s=>'<button data-s="'+s.id+'" class="'+(t.status===s.id?"active":"")+'">'+s.label+'</button>').join("")+'</div></div>'+
    '<div class="field"><label>Notes</label><input class="input" id="fNotes" value="'+esc(t.notes)+'" placeholder="Optional context"></div>'+
    '<div class="modal-actions">'+
      (id?'<button class="btn danger" id="taskDelete">Delete</button>':"")+
      '<button class="btn ghost" id="taskCancel">Cancel</button>'+
      '<button class="btn accent" id="taskSave">'+(id?"Save changes":"Add task")+'</button></div>');
  let prio = t.priority, stat = t.status;
  $$("#fPrio button").forEach(b=>b.addEventListener("click", ()=>{ prio=b.dataset.p; $$("#fPrio button").forEach(x=>x.classList.toggle("active",x===b)); }));
  $$("#fStatus button").forEach(b=>b.addEventListener("click", ()=>{ stat=b.dataset.s; $$("#fStatus button").forEach(x=>x.classList.toggle("active",x===b)); }));
  $("#taskCancel").addEventListener("click", closeModal);
  if(id) $("#taskDelete").addEventListener("click", ()=>{
    state.tasks = state.tasks.filter(x=>x.id!==id); save(); closeModal(); render(); toast("Task deleted");
  });
  $("#taskSave").addEventListener("click", ()=>{
    const title = $("#fTitle").value.trim();
    if(!title){ toast("Give the task a title"); return; }
    const wasNew = !editingId;
    const obj = editingId ? state.tasks.find(x=>x.id===editingId) : {id:uid(), createdAt:Date.now()};
    const oldStatus = obj.status;
    obj.title=title; obj.owner=$("#fOwner").value; obj.customer=$("#fCustomer").value;
    obj.type=$("#fType").value; obj.due=$("#fDue").value||null; obj.priority=prio; obj.status=stat;
    obj.notes=$("#fNotes").value.trim(); obj.updatedAt=Date.now();
    if(wasNew) state.tasks.unshift(obj);
    save(); closeModal(); render();
    if(wasNew) queueNotification("newTask", 'New task: "'+obj.title+'" - '+obj.owner+' · '+obj.customer+' · due '+(obj.due?fmtDue(obj.due).text:"no date"));
    else if(oldStatus!==stat) queueNotification("statusChange", '"'+obj.title+'" moved from '+stDef(oldStatus).label+' to '+stDef(stat).label+' ('+obj.owner+')');
    else toast("Saved");
  });
  setTimeout(()=>$("#fTitle").focus(),80);
}
function showModal(html){ $("#taskModal").innerHTML = html; $("#taskModalWrap").classList.remove("hidden"); }
function closeModal(){ $("#taskModalWrap").classList.add("hidden"); editingId=null; }

/* ---------- notif sheet ---------- */
function renderNotifs(){
  const log = state.notifLog;
  let html;
  if(!log.length){
    html = '<div class="nempty">No notifications yet.<br>Move a card or add a task and queued emails will show up here.</div>';
  } else {
    html = log.map(n=>{
      const d = new Date(n.ts);
      return '<div class="nitem"><span class="nkind">'+n.kind.replace(/([A-Z])/g," $1").toUpperCase()+'</span>'+
        '<div class="ntext">'+esc(n.text)+'</div>'+
        '<div class="nmeta">'+d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})+' '+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})+' · to '+n.recipients.map(esc).join(", ")+' · <b>stub, not sent</b></div></div>';
    }).join("");
  }
  $("#notifBody").innerHTML = html;
}

/* ---------- render root ---------- */
function render(){
  renderStats(); renderBell();
  $$(".vs-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  if(view==="board") renderBoard();
  else groupView(view);
}

/* ---------- boot ---------- */
function boot(){
  $("#heroDate").textContent = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
  $$(".vs-btn").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; render(); }));
  $("#addTaskBtn").addEventListener("click", ()=>openTaskModal(null));
  const openSheet = id=>{ $(id).classList.remove("hidden"); $("#scrim").classList.remove("hidden"); };
  const closeSheets = ()=>{ $$(".sheet").forEach(s=>s.classList.add("hidden")); $("#scrim").classList.add("hidden"); };
  $("#settingsBtn").addEventListener("click", ()=>{ renderSettings(); openSheet("#settingsSheet"); });
  $("#settingsClose").addEventListener("click", closeSheets);
  $("#bellBtn").addEventListener("click", ()=>{ state.notifSeen = state.notifLog.length; save(); renderBell(); renderNotifs(); openSheet("#notifSheet"); });
  $("#notifClose").addEventListener("click", closeSheets);
  $("#scrim").addEventListener("click", closeSheets);
  $("#taskModalWrap").addEventListener("click", e=>{ if(e.target===e.currentTarget) closeModal(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape"){ closeModal(); closeSheets(); } });
  render();
}
boot();
})();
