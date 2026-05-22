import http from 'node:http';
import { Db } from './db.js';
import { parseJson } from './util.js';

function json(res: http.ServerResponse, value: unknown) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function api(db: Db, pathname: string) {
  if (pathname === '/api/overview') {
    const totals = db.prepare(`SELECT COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes, SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures FROM runs`).get();
    const conversations = db.prepare(`SELECT COUNT(*) conversations FROM conversations`).get();
    const messages = db.prepare(`SELECT COUNT(*) messages FROM messages`).get();
    const insights = db.prepare(`SELECT COUNT(*) insights FROM insight_candidates`).get();
    const daily = db.prepare(`SELECT substr(started_at,1,10) date, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost, COUNT(*) runs FROM runs GROUP BY substr(started_at,1,10) ORDER BY date DESC LIMIT 14`).all().reverse();
    return { totals, conversations, messages, insights, daily };
  }
  if (pathname === '/api/projects') return db.prepare(`SELECT COALESCE(project,'unknown') project, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs GROUP BY COALESCE(project,'unknown') ORDER BY tokens DESC LIMIT 20`).all();
  if (pathname === '/api/models') return db.prepare(`SELECT COALESCE(provider,'unknown') provider, COALESCE(model,'unknown') model, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs GROUP BY provider, model ORDER BY tokens DESC LIMIT 20`).all();
  if (pathname === '/api/runs') return db.prepare(`SELECT id, started_at, project, provider, model, status, total_tokens, estimated_cost_usd, duration_ms FROM runs ORDER BY started_at DESC LIMIT 50`).all();
  if (pathname === '/api/conversations') return db.prepare(`SELECT c.id, c.started_at, c.project, c.title, c.privacy_mode, COUNT(m.id) messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY c.id ORDER BY c.started_at DESC LIMIT 50`).all();
  if (pathname === '/api/insights') return db.prepare(`SELECT id, date, kind, sensitivity, destination, status, project, summary FROM insight_candidates ORDER BY date DESC, created_at DESC LIMIT 100`).all();
  return undefined;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentScope</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#11182d;--muted:#8ea0c0;--text:#e8eefc;--accent:#7dd3fc;--good:#86efac;--bad:#fca5a5;--line:#22304f}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#172554,#0b1020 45%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:var(--text)}main{max-width:1200px;margin:0 auto;padding:28px}h1{font-size:32px;margin:0 0 4px}.sub{color:var(--muted);margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:rgba(17,24,45,.86);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 30px #0004}.metric{font-size:28px;font-weight:750}.label{color:var(--muted);font-size:13px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}section{margin-top:14px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}.pill{border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--accent)}.ok{color:var(--good)}.bad{color:var(--bad)}.bar{height:8px;background:#1e293b;border-radius:99px;overflow:hidden}.bar>i{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#a78bfa)}@media(max-width:850px){.grid,.two{grid-template-columns:1fr}main{padding:18px}}
</style></head><body><main><h1>AgentScope</h1><div class="sub">Local-first AI agent observability on the Mac mini</div><div id="app">Loading…</div></main>
<script>
const fmt = new Intl.NumberFormat(); const money = n => '$' + Number(n||0).toFixed(2);
async function get(p){return fetch(p).then(r=>r.json())}
function table(rows, cols){return '<table><thead><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+c[1](r)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
async function render(){const [o,p,m,r,c,i]=await Promise.all(['/api/overview','/api/projects','/api/models','/api/runs','/api/conversations','/api/insights'].map(get));
const totals=o.totals||{}; const max=Math.max(...(o.daily||[]).map(d=>d.tokens||0),1);
document.getElementById('app').innerHTML =
'<div class="grid">'+[
['Runs',fmt.format(totals.runs||0)],['Tokens',fmt.format(totals.tokens||0)],['Cost',money(totals.cost)],['Insights',fmt.format((o.insights||{}).insights||0)]
].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="metric">'+x[1]+'</div></div>').join('')+'</div>'+ 
'<section class="card"><h2>Daily usage</h2>'+((o.daily||[]).map(d=>'<div style="display:grid;grid-template-columns:90px 1fr 90px;gap:10px;align-items:center;margin:8px 0"><span class="label">'+d.date+'</span><div class="bar"><i style="width:'+Math.max(2,(d.tokens||0)/max*100)+'%"></i></div><span>'+fmt.format(d.tokens||0)+'</span></div>').join('')||'<p class="label">No usage yet</p>')+'</section>'+ 
'<div class="two"><section class="card"><h2>Projects</h2>'+table(p,[['Project',x=>x.project],['Runs',x=>fmt.format(x.runs)],['Tokens',x=>fmt.format(x.tokens||0)],['Cost',x=>money(x.cost)]])+'</section><section class="card"><h2>Models</h2>'+table(m,[['Provider',x=>x.provider],['Model',x=>x.model],['Tokens',x=>fmt.format(x.tokens||0)],['Cost',x=>money(x.cost)]])+'</section></div>'+ 
'<section class="card"><h2>Recent runs</h2>'+table(r,[['Started',x=>x.started_at],['Project',x=>x.project||''],['Model',x=>x.model||''],['Status',x=>'<span class="'+(x.status==='success'?'ok':'bad')+'">'+x.status+'</span>'],['Tokens',x=>fmt.format(x.total_tokens||0)],['Cost',x=>money(x.estimated_cost_usd)]])+'</section>'+ 
'<div class="two"><section class="card"><h2>Conversations</h2>'+table(c,[['Started',x=>x.started_at],['Project',x=>x.project||''],['Privacy',x=>'<span class="pill">'+x.privacy_mode+'</span>'],['Messages',x=>fmt.format(x.messages||0)]])+'</section><section class="card"><h2>Insights</h2>'+table(i,[['Date',x=>x.date],['Kind',x=>x.kind],['Sensitivity',x=>x.sensitivity],['Destination',x=>x.destination],['Summary',x=>x.summary]])+'</section></div>'}
render().catch(e=>document.getElementById('app').textContent=e.stack||String(e));
</script></body></html>`;

export function startDashboard(db: Db, opts: { host?: string; port?: number }) {
  const host = opts.host || '127.0.0.1';
  const port = opts.port || 3737;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const value = api(db, url.pathname);
      if (value === undefined) { res.writeHead(404); res.end('not found'); return; }
      json(res, value); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(port, host, () => console.log(`AgentScope dashboard: http://${host}:${port}`));
  return server;
}
