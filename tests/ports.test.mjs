import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import {clearPorts} from '../../beauty-platform/dist/scripts/clear-ports.mjs';
const probe=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});
test('selected port cleanup leaves other listeners running',async()=>{
 const children=[];async function start(){const c=spawn(process.execPath,['-e',"const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>process.stdout.write(String(s.address().port)+'\\n'));"],{stdio:['ignore','pipe','pipe']});children.push(c);const [out]=await once(c.stdout,'data');return Number(out.toString().trim());}
 try{const a=await start(),b=await start();await clearPorts([a]);assert.equal(await probe(a),false);assert.equal(await probe(b),true);}finally{for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill('SIGTERM');}
});
