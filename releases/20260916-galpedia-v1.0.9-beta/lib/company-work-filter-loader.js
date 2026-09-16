
const descriptor={"path":"f49e272a8dd8f08313ea5660aebf82d2fa120f043b67fe8f3b27dbc4abd017c6.json.gz","sha256":"f49e272a8dd8f08313ea5660aebf82d2fa120f043b67fe8f3b27dbc4abd017c6","bytes":651734,"rawBytes":2872838};let pending,current;
export const currentCompanyWorkFilter=()=>current;
export function loadCompanyWorkFilter(){return pending??=load().catch(error=>{pending=null;throw error;});}
async function load(){
 const r=await fetch(new URL('../runtime-data/reviewed-company-v1/'+descriptor.path,import.meta.url));if(!r.ok)throw Error('会社筛选资料加载失败');const packed=await r.arrayBuffer();
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed)),b=>b.toString(16).padStart(2,'0')).join('');
 if(packed.byteLength!==descriptor.bytes||sha!==descriptor.sha256)throw Error('会社筛选资料校验失败');
 const reader=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>descriptor.rawBytes)throw Error('会社筛选资料过大');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 if(length!==descriptor.rawBytes)throw Error('会社筛选资料不完整');const raw=new Uint8Array(length);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));if(data.integrationSha!=="118d3d7c6ce021e0598d9f6c44fe58f954e12d29101fdf2fa7899fe29f0013c1")throw Error('会社筛选版本不符');current=data;return data;
}
export function withCompanyBrands(data,projection){
 const old=new Map(data.brands.map(b=>[b.brandId,b]));data.brands=projection.brands.map(b=>({...old.get(b.brandId),...b}));data.sample.brands=data.brands;return data;
}
