/* TaskByte admin write path - update fields (currently status) on an
   existing task by id. Same shared-secret auth and Supabase service role
   as api/add-task.js. */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normStatus(v){
  const t = String(v == null ? "" : v).trim().toLowerCase().replace(/[\s_\-]+/g, "");
  if(t === "inprogress" || t === "doing") return "inprogress";
  if(t === "done" || t === "completed" || t === "complete") return "done";
  return "todo";
}

export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-taskbyte-key");
  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST") return res.status(405).json({error:"POST a JSON body: {id, status}"});

  const secret = process.env.TASKBYTE_API_SECRET;
  const got = req.headers["x-taskbyte-key"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if(!secret || !got || got !== secret) return res.status(401).json({error:"Unauthorized"});

  let b = req.body;
  if(typeof b === "string"){ try{ b = JSON.parse(b); }catch(e){ b = {}; } }
  b = b || {};
  const id = String(b.id || "").trim();
  if(!id) return res.status(400).json({error:"id is required"});
  const status = normStatus(b.status);

  try{
    const resp = await fetch(SUPA_URL + "/rest/v1/tasks?id=eq." + encodeURIComponent(id), {
      method:"PATCH",
      headers:{
        "apikey": SUPA_KEY,
        "Authorization": "Bearer " + SUPA_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({status:status, updated_at:Date.now()})
    });
    const text = await resp.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
    if(!resp.ok) throw new Error("supabase " + resp.status + ": " + text);
    const row = Array.isArray(data) ? data[0] : data;
    if(!row) return res.status(404).json({error:"no task with id " + id});
    return res.status(200).json({ok:true, task:row});
  }catch(e){
    return res.status(502).json({error:"Backend write failed", detail:String(e && e.message || e)});
  }
}
