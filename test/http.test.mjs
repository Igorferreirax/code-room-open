import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('HTTP autentica, bloqueia origem externa e persiste perfis com ambientes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'code-room-http-'));const port=19000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['server/main.mjs'],{cwd:resolve('.'),env:{...process.env,CODE_ROOM_DATA:dir,CODE_ROOM_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 try {
   await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Servidor não iniciou')),5000))]);
   const key=(await readFile(join(dir,'access.key'),'utf8')).trim();const base=`http://127.0.0.1:${port}`;
   assert.equal((await fetch(base+'/api/state')).status,401);
   const headers={'X-Code-Room-Key':key,'Content-Type':'application/json'};
   assert.equal((await fetch(base+'/api/state',{headers:{...headers,Origin:'https://externo.example'}})).status,403);
   const create=async(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
   const p=await create('/api/projects',{name:'Teste',path:dir});assert.equal(p.status,201);
   const a=await create('/api/agents',{name:'Luna',role:'Pesquisa',room:'Pesquisa',provider:'codex',model:'',mode:'read',skillIds:[]});assert.equal(a.status,200);const agent=await a.json();
   const edit=await create('/api/agents',{...agent,name:'Luna 2',room:'Vídeo'});assert.equal((await edit.json()).revision,2);
   const state=await (await fetch(base+'/api/state',{headers})).json();assert.equal(state.agents[0].room,'Vídeo');assert.equal(state.projects.length,1);
   assert.equal((await fetch(base+'/.data/access.key')).status,404);
   const invalid=await create('/api/agents',{...agent,provider:'shell'});assert.equal(invalid.status,400);
 } finally {const closed=once(child,'close');child.kill();await closed;await rm(dir,{recursive:true,force:true});}
});
