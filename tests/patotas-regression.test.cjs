// Run with: node --test tests/patotas-regression.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const js=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../styles.css'),'utf8');
function boot(){
 const nodes=new Map(),listeners=new Map(),storage=new Map();
 const document={body:{classList:{toggle(){}}},querySelector(sel){if(!nodes.has(sel))nodes.set(sel,{textContent:'',innerHTML:'',onclick:null});return nodes.get(sel)},addEventListener(ev,cb){listeners.set(ev,cb)}};
 const ctx=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{},console,alert(){},confirm(){return true},setTimeout,clearTimeout,Date,Intl});
 vm.runInContext(js,ctx);
 return {ctx,nodes,listeners};
}
test('JavaScript loads and renders the members list',()=>{const {nodes}=boot();assert.match(nodes.get('#selectMonth').textContent,/Outubro/);assert.match(nodes.get('#view').innerHTML,/data-act="member:/)});
test('New member payment date is optional',()=>{assert.match(js,/name="duePaidAt" type="date"/);assert.doesNotMatch(js,/name="duePaidAt" type="date" required/);assert.match(js,/paidAt:data.duePaidAt\|\|null/);});
test('Paid and unpaid monthly dues retain correct date semantics',()=>{const {ctx}=boot();assert.equal(vm.runInContext("status(null,'2026-09')",ctx),vm.runInContext("todayLocal()>='2026-10-01'?'Atrasado':'Pendente'",ctx));assert.equal(vm.runInContext("status('2026-09-21','2026-09')",ctx),'Pago');});
test('Share copy feedback does not replace button text',()=>{assert.match(js,/class="share-label"/);assert.match(js,/class="share-check"/);assert.doesNotMatch(js,/button\.textContent='✓ Lista copiada'/)});
test('Members have a scroll container and notifications appear at top',()=>{assert.match(css,/#memberRows\{max-height:/);assert.match(css,/#toast\{top:/);assert.match(css,/bottom:auto/);});
