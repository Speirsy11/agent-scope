import http from 'node:http';
import { Db } from './db.js';
import { sinceToIso } from './util.js';

function json(res: http.ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function params(url: URL) {
  const since = sinceToIso(url.searchParams.get('since') || '30d');
  const project = url.searchParams.get('project') || undefined;
  const model = url.searchParams.get('model') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const where = ['started_at >= @since'];
  const values: Record<string, unknown> = { since };
  if (project) { where.push('project = @project'); values.project = project; }
  if (model) { where.push('model = @model'); values.model = model; }
  if (status) { where.push('status = @status'); values.status = status; }
  return { clause: where.join(' AND '), values, since, project, model, status };
}

function api(db: Db, url: URL) {
  const filter = params(url);
  if (url.pathname === '/api/overview') {
    const totals = db.prepare(`SELECT COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes, SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures FROM runs WHERE ${filter.clause}`).get(filter.values);
    const conversations = db.prepare(`SELECT COUNT(*) conversations FROM conversations WHERE started_at >= @since`).get({ since: filter.since });
    const messages = db.prepare(`SELECT COUNT(*) messages FROM messages WHERE created_at >= @since`).get({ since: filter.since });
    const insights = db.prepare(`SELECT status, COUNT(*) count FROM insight_candidates GROUP BY status ORDER BY status`).all();
    const daily = db.prepare(`SELECT substr(started_at,1,10) date, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost, COUNT(*) runs FROM runs WHERE ${filter.clause} GROUP BY substr(started_at,1,10) ORDER BY date DESC LIMIT 30`).all(filter.values).reverse();
    return { filter, totals, conversations, messages, insights, daily };
  }
  if (url.pathname === '/api/projects') return db.prepare(`SELECT COALESCE(project,'unknown') project, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs WHERE ${filter.clause} GROUP BY COALESCE(project,'unknown') ORDER BY tokens DESC LIMIT 50`).all(filter.values);
  if (url.pathname === '/api/models') return db.prepare(`SELECT COALESCE(provider,'unknown') provider, COALESCE(model,'unknown') model, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs WHERE ${filter.clause} GROUP BY provider, model ORDER BY tokens DESC LIMIT 50`).all(filter.values);
  if (url.pathname === '/api/runs') return db.prepare(`SELECT id, started_at, project, provider, model, status, total_tokens, estimated_cost_usd, duration_ms, error FROM runs WHERE ${filter.clause} ORDER BY started_at DESC LIMIT 100`).all(filter.values);
  if (url.pathname.startsWith('/api/runs/')) return db.prepare(`SELECT * FROM runs WHERE id=?`).get(decodeURIComponent(url.pathname.split('/').at(-1) || ''));
  if (url.pathname === '/api/conversations') return db.prepare(`SELECT c.id, c.started_at, c.project, c.title, c.privacy_mode, COUNT(m.id) messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.started_at >= @since GROUP BY c.id ORDER BY c.started_at DESC LIMIT 100`).all({ since: filter.since });
  if (url.pathname.startsWith('/api/conversations/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1) || '');
    const conversation = db.prepare(`SELECT * FROM conversations WHERE id=?`).get(id);
    const messages = db.prepare(`SELECT role, created_at, content_chars, content_redacted, content_raw, metadata FROM messages WHERE conversation_id=? ORDER BY created_at LIMIT 200`).all(id);
    return { conversation, messages };
  }
  if (url.pathname === '/api/insights') return db.prepare(`SELECT id, date, kind, sensitivity, destination, status, project, summary FROM insight_candidates ORDER BY date DESC, created_at DESC LIMIT 200`).all();
  return undefined;
}

function handlePost(db: Db, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const match = url.pathname.match(/^\/api\/insights\/([^/]+)\/status$/);
  if (!match) return false;
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const status = String(body.status || '');
    if (!['pending', 'approved', 'rejected', 'exported'].includes(status)) {
      json(res, { error: 'invalid status' }, 400); return;
    }
    const id = decodeURIComponent(match[1]);
    const info = db.prepare(`UPDATE insight_candidates SET status=? WHERE id=?`).run(status, id);
    json(res, { id, status, changed: info.changes });
  });
  return true;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentScope</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#11182d;--muted:#8ea0c0;--text:#e8eefc;--accent:#7dd3fc;--good:#86efac;--bad:#fca5a5;--line:#22304f}*{box-sizing:border-box}body{margin:0;background:#0b1020;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:var(--text)}main{max-width:1280px;margin:0 auto;padding:24px}header{display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}h1{font-size:30px;margin:0 0 4px}.sub,.label{color:var(--muted)}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.toolbar input,.toolbar select{background:#0f172a;border:1px solid var(--line);border-radius:8px;color:var(--text);padding:8px 10px}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:18px}.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}.metric{font-size:25px;font-weight:750}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}section{margin-top:12px}h2{font-size:16px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}.pill{border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--accent)}.ok{color:var(--good)}.bad{color:var(--bad)}.bar{height:8px;background:#1e293b;border-radius:99px;overflow:hidden}.bar>i{display:block;height:100%;background:#38bdf8}button{background:#172554;border:1px solid #1d4ed8;color:#e8eefc;border-radius:7px;padding:5px 8px;margin:0 4px 4px 0;cursor:pointer}.detail{white-space:pre-wrap;max-height:320px;overflow:auto;color:#cbd5e1}.muted{color:var(--muted)}@media(max-width:900px){.grid,.two{grid-template-columns:1fr}main{padding:16px}}
</style></head><body><main><header><div><h1>AgentScope</h1><div class="sub">Local-first AI agent observability</div></div><div class="toolbar"><select id="since"><option>7d</option><option selected>30d</option><option>90d</option><option>today</option></select><input id="project" placeholder="project"><input id="model" placeholder="model"><select id="status"><option value="">any status</option><option>success</option><option>failure</option></select><button onclick="render()">Apply</button></div></header><div id="app">Loading...</div></main>
<script>
const fmt = new Intl.NumberFormat(); const money = n => '$' + Number(n||0).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function qs(){const p=new URLSearchParams(); for (const id of ['since','project','model','status']) { const v=document.getElementById(id).value; if(v)p.set(id,v); } return '?' + p.toString();}
async function get(p){return fetch(p + (p.includes('?')?'&':'') + qs().slice(1)).then(r=>r.json())}
function table(rows, cols){return '<table><thead><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+(rows||[]).map(r=>'<tr>'+cols.map(c=>'<td>'+c[1](r)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
async function setInsight(id,status){await fetch('/api/insights/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status})}); render();}
async function showRun(id){const r=await fetch('/api/runs/'+encodeURIComponent(id)).then(x=>x.json()); document.getElementById('detail').innerHTML='<h2>Run detail</h2><pre class="detail">'+esc(JSON.stringify(r,null,2))+'</pre>'}
async function showConv(id){const c=await fetch('/api/conversations/'+encodeURIComponent(id)).then(x=>x.json()); document.getElementById('detail').innerHTML='<h2>Conversation detail</h2><pre class="detail">'+esc(JSON.stringify(c,null,2))+'</pre>'}
async function render(){const [o,p,m,r,c,i]=await Promise.all(['/api/overview','/api/projects','/api/models','/api/runs','/api/conversations','/api/insights'].map(get)); const t=o.totals||{}; const max=Math.max(...(o.daily||[]).map(d=>d.tokens||0),1); const insightCounts=(o.insights||[]).map(x=>x.status+': '+x.count).join(', ') || '0';
document.getElementById('app').innerHTML='<div class="grid">'+[['Runs',fmt.format(t.runs||0)],['Tokens',fmt.format(t.tokens||0)],['Cost',money(t.cost)],['Failures',fmt.format(t.failures||0)],['Insights',esc(insightCounts)]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="metric">'+x[1]+'</div></div>').join('')+'</div>'+
'<section class="card"><h2>Daily usage</h2>'+((o.daily||[]).map(d=>'<div style="display:grid;grid-template-columns:94px 1fr 96px;gap:10px;align-items:center;margin:7px 0"><span class="label">'+esc(d.date)+'</span><div class="bar"><i style="width:'+Math.max(2,(d.tokens||0)/max*100)+'%"></i></div><span>'+fmt.format(d.tokens||0)+'</span></div>').join('')||'<p class="muted">No usage in range</p>')+'</section>'+
'<div class="two"><section class="card"><h2>Projects</h2>'+table(p,[['Project',x=>esc(x.project)],['Runs',x=>fmt.format(x.runs)],['Tokens',x=>fmt.format(x.tokens||0)],['Cost',x=>money(x.cost)]])+'</section><section class="card"><h2>Models</h2>'+table(m,[['Provider',x=>esc(x.provider)],['Model',x=>esc(x.model)],['Tokens',x=>fmt.format(x.tokens||0)],['Cost',x=>money(x.cost)]])+'</section></div>'+
'<section class="card"><h2>Recent runs</h2>'+table(r,[['Started',x=>esc(x.started_at)],['Project',x=>esc(x.project||'')],['Model',x=>esc(x.model||'')],['Status',x=>'<span class="'+(x.status==='success'?'ok':'bad')+'">'+esc(x.status)+'</span>'],['Tokens',x=>fmt.format(x.total_tokens||0)],['Detail',x=>'<button onclick="showRun(\\''+esc(x.id)+'\\')">Open</button>']])+'</section>'+
'<div class="two"><section class="card"><h2>Conversations</h2>'+table(c,[['Started',x=>esc(x.started_at)],['Project',x=>esc(x.project||'')],['Privacy',x=>'<span class="pill">'+esc(x.privacy_mode)+'</span>'],['Messages',x=>fmt.format(x.messages||0)],['Detail',x=>'<button onclick="showConv(\\''+esc(x.id)+'\\')">Open</button>']])+'</section><section class="card"><h2>Insights</h2>'+table(i,[['Date',x=>esc(x.date)],['Kind',x=>esc(x.kind)],['Status',x=>esc(x.status)],['Summary',x=>esc(x.summary)],['Actions',x=>'<button onclick="setInsight(\\''+esc(x.id)+'\\',\\'approved\\')">Approve</button><button onclick="setInsight(\\''+esc(x.id)+'\\',\\'rejected\\')">Reject</button>']])+'</section></div><section id="detail" class="card"><h2>Detail</h2><div class="muted">Open a run or conversation.</div></section>'}
render().catch(e=>document.getElementById('app').textContent=e.stack||String(e));
</script></body></html>`;

export function startDashboard(db: Db, opts: { host?: string; port?: number }) {
  const host = opts.host || '127.0.0.1';
  const port = opts.port || 3737;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (req.method === 'POST' && handlePost(db, req, res, url)) return;
    if (url.pathname.startsWith('/api/')) {
      const value = api(db, url);
      if (value === undefined) { json(res, { error: 'not found' }, 404); return; }
      json(res, value); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(port, host, () => console.log(`AgentScope dashboard: http://${host}:${port}`));
  return server;
}
