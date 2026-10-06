import { createClient } from "@libsql/client";
import crypto from "crypto";
import { unzipSync, strFromU8 } from "fflate";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const db = createClient({ url: env.TURSO_DATABASE_URL_PROD, authToken: env.TURSO_AUTH_TOKEN_PROD });
function decrypt(b64){const key=Buffer.from(env.ZIPNOVA_ENCRYPTION_KEY,"hex");const bundle=Buffer.from(b64,"base64");const iv=bundle.subarray(0,16),tag=bundle.subarray(16,32),enc=bundle.subarray(32);const d=crypto.createDecipheriv("aes-256-gcm",key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(enc),d.final()]).toString("utf8");}
const cfg=JSON.parse(decrypt((await db.execute("SELECT config_json FROM workspace_integration_connections WHERE id=3")).rows[0].config_json));
async function dump(sid,label){
  const r=await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${sid}&response_type=zpl2`,{headers:{Authorization:`Bearer ${cfg.accessToken}`}});
  const buf=Buffer.from(await r.arrayBuffer());const files=unzipSync(new Uint8Array(buf));let zpl="";for(const[n,d]of Object.entries(files)){if(/\.(txt|zpl)$/i.test(n))zpl=strFromU8(d);}
  fs.writeFileSync(`scripts/lbl_${label}.zpl`,zpl);
  console.log(`\n== ${label} ${sid} len=${zpl.length} ==`);
  for(const cmd of ["LL","PW","LH","LS","PO","MN","BY"]){const m=(zpl.match(new RegExp("\^"+cmd+"[^\^\n]{0,12}","g"))||[]).slice(0,2);if(m.length)console.log("  ^"+cmd,JSON.stringify(m));}
  // por bloque XA
  const blocks=zpl.match(/\^XA[\s\S]*?\^XZ/g)||[];
  blocks.forEach((b,i)=>{const reg=/\^F[OT](\d+),(\d+)/g;let m,maxY=0;while((m=reg.exec(b))){maxY=Math.max(maxY,+m[2]);}console.log(`  bloque#${i} len=${b.length} maxY=${maxY}dots (${(maxY/8).toFixed(0)}mm)`);});
}
await dump("47326553211","colecta");
await dump("47327653696","flex");
await db.close();
