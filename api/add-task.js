/* TaskByte shared write path - lets Instinct file a task (e.g. forwarded
   WhatsApp messages) straight onto the board. Authenticated with a shared
   secret header; uses the Supabase service role key server-side. */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PALETTE = ["#FF5A2D","#2563EB","#0E9F6E","#7C3AED","#DB2777","#0D9488","#B7791F","#475569","#DC2626","#5B8DEF"];

const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

async function sb(path, opts){
  opts = opts || {};
  const headers = Object.assign({
    "apikey": SUPA_KEY,
    "Authorization": "Bearer " + SUPA_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  }, opts.headers || {});
  const res = await fetch(SUPA_URL + "/rest/v1" + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
  if(!res.ok) throw new Error("supabase " + res.status + ": " + text);
  return data;
}

function matchCat(fragment, list){
  if(!fragment) return null;
  const f = String(fragment).trim().toLowerCase();
  if(!f) return null;
  let hit = list.find(g => g.name.toLowerCase() === f); if(hit) return hit.name;
  hit = list.find(g => g.name.toLowerCase().indexOf(f) === 0); if(hit) return hit.name;
  hit = list.find(g => g.name.toLowerCase().split(/\s+/)[0] === f); if(hit) return hit.name;
  hit = list.find(g => g.name.toLowerCase().indexOf(f) > -1); if(hit) return hit.name;
  return null;
}

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-taskbyte-key");
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return res.status(405).json({error:"POST a JSON body: {title, owner, customer, type, due, priority, status, notes, source}"});

  const secret = process.env.TASKBYTE_API_SECRET;
  const got = req.headers["x-taskbyte-key"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if(!secret || !got || got !== secret) return res.status(401).json({error:"Unauthorized"});

  let b = req.body;
  if(typeof b === "string"){ try{ b = JSON.parse(b); }catch(e){ b = {}; } }
  b = b || {};
  const title = String(b.title || "").trim();
  if(!title) return res.status(400).json({error:"title is required"});

  const source = ["manual","voice","whatsapp"].indexOf(b.source) > -1 ? b.source : "whatsapp";
  const status = ["todo","inprogress","done"].indexOf(b.status) > -1 ? b.status : "todo";
  const priority = ["low","med","high"].indexOf(b.priority) > -1 ? b.priority : "med";
  let due = null;
  if(b.due){
    const d = String(b.due).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) due = d;
    else return res.status(400).json({error:"due must be YYYY-MM-DD"});
  }

  try{
    const kvRows = await sb("/kv?select=key,value");
    const kv = {};
    (kvRows || []).forEach(r => { kv[r.key] = r.value; });
    const out = {};
    const fields = [["owner","owners"],["customer","customers"],["type","types"]];
    for(const pair of fields){
      const field = pair[0], listKey = pair[1];
      let list = Array.isArray(kv[listKey]) ? kv[listKey] : [];
      const v = b[field] ? String(b[field]).trim() : "";
      if(!v){ out[field] = list[0] ? list[0].name : null; continue; }
      let name = matchCat(v, list);
      if(!name){
        name = v;
        list.push({name:name, color:PALETTE[list.length % PALETTE.length]});
        await sb("/kv", {
          method:"POST",
          headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify({key:listKey, value:list, updated_at:Date.now()})
        });
      }
      out[field] = name;
    }
    const now = Date.now();
    const row = {
      id:uid(), title:title,
      owner:out.owner, customer:out.customer, type:out.type,
      status:status, due:due, priority:priority,
      notes:String(b.notes || "").trim(), source:source,
      created_at:now, updated_at:now
    };
    const ins = await sb("/tasks", {method:"POST", body:JSON.stringify(row)});
    return res.status(200).json({ok:true, task:Array.isArray(ins) ? ins[0] : ins});
  }catch(e){
    return res.status(502).json({error:"Backend write failed", detail:String(e && e.message || e)});
  }
}
