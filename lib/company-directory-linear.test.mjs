import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompanyDirectory} from './company-directory.js';

test('linear representative selection preserves legacy order, ties and approved media',()=>{
 const brands=Array.from({length:25},(_,i)=>({brandId:'b'+i,brandName:'会社'+i}));
 brands.push({brandId:'empty',brandName:'空'});
 const works=Array.from({length:1000},(_,i)=>({workId:'w'+i,brandId:'b'+i%25,voteCount:i%7===0?null:i%11,releaseDate:'2000-01-01',projectedThumbnailPath:'approved/'+i,thumbnailPath:'legacy/'+i}));
 works.push({workId:'unknown',brandId:'unknown',voteCount:100000});
 const model=buildCompanyDirectory({brands,works});
 for(const brand of brands){
  const legacy=works.filter(w=>w.brandId===brand.brandId).map((work,index)=>({work,index})).sort((a,b)=>(Number(b.work.voteCount)||0)-(Number(a.work.voteCount)||0)||a.index-b.index)[0]?.work??null;
  const company=model.companies.find(c=>c.companyId===brand.brandId);
  assert.equal(company.fallbackWorkId,legacy?.workId??null);
  assert.equal(company.fallbackCoverPath,legacy?.projectedThumbnailPath??null);
 }
});

test('25000-record company preparation reads brand identity a bounded number of times',()=>{
 const brands=Array.from({length:100},(_,i)=>({brandId:'b'+i,brandName:'会社'+i}));
 let reads=0;
 const works=Array.from({length:25000},(_,i)=>({workId:'w'+i,get brandId(){reads++;return 'b'+i%100;},voteCount:i,releaseDate:'2000-01-01'}));
 const model=buildCompanyDirectory({brands,works});
 assert.equal(model.companies.length,100);
 assert.ok(reads<=works.length*2,`Expected one grouping pass plus snapshots, got ${reads}`);
 assert.equal(model.companies[0].workCount,250);
 assert.equal(model.companies[0].fallbackWorkId,'w24900');
});
