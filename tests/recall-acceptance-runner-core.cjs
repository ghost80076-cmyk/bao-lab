'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'recall-acceptance-'));
const files=['scripts/evaluate-episodic-recall.cjs','js/episodic-memory-core.js','js/episodic-memory.js','tests/fixtures/recall-acceptance/v2.json'];
const write=(file,text)=>{const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
const core=fs.readFileSync(path.join(root,files[1]),'utf8'),runtime=fs.readFileSync(path.join(root,files[2]),'utf8');
const run=()=>{
 const report=path.join(dir,'report.json');
 const result=spawnSync(process.execPath,[path.join(dir,files[0]),'--report',report],{encoding:'utf8',timeout:15000});
 if(result.error)throw result.error;
 assert.ok(fs.existsSync(report),result.stderr||result.stdout);
 return{status:result.status,report:JSON.parse(fs.readFileSync(report,'utf8'))};
};
try{
 files.forEach(file=>write(file,fs.readFileSync(path.join(root,file),'utf8')));
 const suite=JSON.parse(fs.readFileSync(path.join(root,files[3]),'utf8'));
 assert.equal(new Set(suite.cases.map(c=>c.id)).size,suite.cases.length,'duplicate IDs would hide cases');
 assert.equal(suite.cases.length,41,'case removal needs explicit review');
 const normal=run();assert.equal(normal.status,0);
 assert.deepEqual(normal.report,JSON.parse(fs.readFileSync(path.join(root,'docs/recall-acceptance-baseline.json'),'utf8')),'checked-in evidence must match current core/runtime/fixture/evaluator');
 assert.equal(normal.report.supported.cases,40);assert.equal(normal.report.diagnostic.falseNegatives,1);
 assert.equal(normal.report.all.falseNegatives,1,'known gaps stay in total recall');
 write(files[2],runtime.replace("    const state = window.GameState?.current;","    return await next(config);\n    const state = window.GameState?.current;"));
 const empty=run();assert.equal(empty.status,1);assert.ok(empty.report.supported.falseNegatives>0,'empty recall cannot silently pass');
 write(files[2],runtime);
 const wrongProof=core.replace("${sourceIds.join('、')}","${candidate.event.evidence.map(e => e.id).join('、')}");
 assert.notEqual(wrongProof,core);write(files[1],wrongProof);
 const provenance=run();assert.equal(provenance.status,1);assert.ok(provenance.report.supported.sourceErrors>0,'plausible text with incorrect evidence must fail');
 const unrestricted=core.replace("const shared = event.visibility === 'public' && event.certainty === 'confirmed';","const shared = true;");
 assert.notEqual(unrestricted,core);write(files[1],unrestricted);
 const leak=run();assert.equal(leak.status,1);assert.ok(leak.report.supported.forbiddenContentCases>0,'scope leak must fail');
 console.log('PASS fixed oracles, fresh evidence, counted diagnostic gaps; empty retrieval, wrong provenance and scope leak fail the gate');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
