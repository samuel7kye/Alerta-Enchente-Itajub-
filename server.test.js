const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const PORT = 5187;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'alerta-itajuba-'));
let server;
const base = `http://127.0.0.1:${PORT}`;
async function wait() {
  for (let i=0; i<50; i++) {
    try { const r=await fetch(base+'/api/health'); if(r.ok)return; } catch {}
    await new Promise(r=>setTimeout(r,150));
  }
  throw new Error('Servidor não iniciou');
}
test('API de relatos, autenticação, alertas e clima', async t => {
  server=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:TMP,env:{...process.env,PORT:String(PORT),ADMIN_TOKEN:'teste-seguro'},stdio:'ignore'});
  t.after(async()=>{server.kill(); await new Promise(resolve=>server.once('exit',resolve)); fs.rmSync(TMP,{recursive:true,force:true});});
  await wait();
  let r=await fetch(base+'/api/status'); let data=await r.json();
  assert.equal(r.status,200); assert.equal(data.pontos.length,3);
  r=await fetch(base+'/api/relatos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bairro:'Varginha',tipo:'Rua alagada',descricao:'Água subindo na rua'})});
  assert.equal(r.status,201); const relato=await r.json(); assert.ok(relato.id);
  r=await fetch(base+'/api/status'); data=await r.json(); assert.equal(data.relatos[0].descricao,'Água subindo na rua');
  r=await fetch(base+'/api/alertas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nivel:'vermelho',bairro:'Varginha',descricao:'Teste sem autorização'})}); assert.equal(r.status,401);
  r=await fetch(base+'/api/alertas',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer teste-seguro'},body:JSON.stringify({nivel:'vermelho',bairro:'Varginha',descricao:'Elevação crítica do rio'})});
  assert.equal(r.status,201); data=await r.json(); assert.equal(data.pontos[0].status,'vermelho');
  r=await fetch(base+'/api/status'); data=await r.json(); assert.equal(data.alertas[0].descricao,'Elevação crítica do rio');
  r=await fetch(base+'/api/weather'); assert.ok([200,502].includes(r.status)); const weather=await r.json(); assert.ok(weather.provider==='Open-Meteo'||typeof weather.error==='string');
});
