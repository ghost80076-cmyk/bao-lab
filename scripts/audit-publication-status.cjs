'use strict';
// Offline metadata comparison only. Never writes D1 or infers payment/rights.
const fs=require('node:fs'),path=require('node:path');
const clean=value=>typeof value==='string'?value.trim():'';
const id=value=>/^[a-z0-9][a-z0-9_-]{0,179}$/i.test(clean(value))?clean(value):null;
const positive=value=>Number.isSafeInteger(value)&&value>0;
function audit({submissions,pulls,catalog}){
 if(!Array.isArray(submissions)||!Array.isArray(pulls)||!Array.isArray(catalog))throw Error('submissions, pulls and catalog must be JSON arrays');
 const prs=new Map(),works=new Map(),counts=new Map();
 for(const pr of pulls){if(positive(pr?.number))prs.set(pr.number,[...(prs.get(pr.number)||[]),pr]);}
 for(const work of catalog){if(id(work?.id))works.set(work.id,[...(works.get(work.id)||[]),work]);}
 for(const row of submissions){if(positive(row?.pr_number))counts.set(row.pr_number,(counts.get(row.pr_number)||0)+1);}
 const rows=submissions.map(row=>{
  const out={pr_number:positive(row?.pr_number)?row.pr_number:null,work_id:id(row?.work_id),author_id:id(row?.author_id),published_version:positive(row?.published_version)?row.published_version:null};
  const result=(status,attention=true)=>({...out,status,attention});
  if(!out.pr_number||!out.work_id||!out.author_id||!out.published_version)return result('invalid_submission');
  if(counts.get(out.pr_number)!==1)return result('duplicate_submission');
  if(row.status!=='pending_review')return result('not_pending',false);
  const candidates=prs.get(out.pr_number)||[];
  if(!candidates.length)return result('pr_snapshot_missing');
  if(candidates.length!==1)return result('pr_snapshot_ambiguous');
  const pr=candidates[0];
  if(pr.base?.repo?.full_name!=='ghost80076-cmyk/bao-lab')return result('pr_repository_mismatch');
  if(pr.base?.ref!=='main')return result('pr_base_mismatch');
  if(pr.state==='open'&&!pr.merged_at)return result('pr_open',false);
  if(pr.state==='closed'&&!pr.merged_at&&pr.merged!==true)return result('pr_closed_unmerged',false);
  if(pr.state!=='closed'||!clean(pr.merged_at)||!Number.isFinite(Date.parse(pr.merged_at))||pr.merged===false||!/^[a-f0-9]{40}$/i.test(clean(pr.merge_commit_sha)))return result('pr_merge_evidence_incomplete');
  const entries=works.get(out.work_id)||[];
  if(!entries.length)return result('catalog_missing');
  // Duplicate catalogs are normal only when publication identity agrees.
  if(entries.some(item=>clean(item.author_id)!==clean(entries[0].author_id)||item.published_version!==entries[0].published_version))return result('catalog_ambiguous');
  const entry=entries[0];
  if(clean(entry.author_id)!==out.author_id)return result('catalog_author_mismatch');
  if(!positive(entry.published_version))return result('catalog_version_invalid');
  if(entry.published_version<out.published_version)return result('catalog_version_older');
  if(entry.published_version>out.published_version)return result('catalog_version_newer');
  return result('merged_catalog_match',false);
 });
 return{schema_version:1,scope:'Offline metadata snapshots; matches require manual verification of repository, snapshot freshness, commit ancestry and license snapshot before any status write. No remote requests or D1 writes.',counts:rows.reduce((out,row)=>(out[row.status]=(out[row.status]||0)+1,out),{}),attention_rows:rows.filter(row=>row.attention).length,rows};
}
if(require.main===module){
 try{
  const args=process.argv.slice(2),allowed=['--submissions','--pulls','--catalog','--report'];
  const opts={};
  for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||opts[args[i]])throw Error('Use --submissions FILE --pulls FILE --catalog FILE --report FILE');opts[args[i]]=args[i+1];}
  if(allowed.some(key=>!opts[key]))throw Error('All four file arguments are required');
  const inputs=allowed.slice(0,3).map(key=>path.resolve(opts[key])),target=path.resolve(opts['--report']);
  if(inputs.some(file=>file===target||(fs.existsSync(target)&&fs.realpathSync(file)===fs.realpathSync(target))))throw Error('Report must not overwrite an input');
  const report=audit({submissions:JSON.parse(fs.readFileSync(inputs[0],'utf8')),pulls:JSON.parse(fs.readFileSync(inputs[1],'utf8')),catalog:JSON.parse(fs.readFileSync(inputs[2],'utf8'))});
  fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({counts:report.counts,attention_rows:report.attention_rows}));
  if(report.attention_rows)process.exitCode=1;
 }catch(error){console.error(error.message);process.exitCode=2;}
}
module.exports={audit};
