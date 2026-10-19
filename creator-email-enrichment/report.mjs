#!/usr/bin/env node
// node report.mjs <original.csv> <enriched.csv> <report.md>
import fs from 'node:fs';
const [orig, enr, out] = process.argv.slice(2);
function parse(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;r.push(f);f='';if(r.length>1)rows.push(r);r=[]}else f+=c}if(f||r.length){r.push(f);rows.push(r)}const h=rows.shift();return rows.map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??''])))}
const o = parse(fs.readFileSync(orig,'utf8')), e = parse(fs.readFileSync(enr,'utf8'));
const hadEmail = (r)=>/[\w.+-]+@[\w-]+\.\w+/.test(r.public_email+' '+r.business_contact);
const subs=(s)=>{const m=String(s).match(/([\d.]+)\s*([KMB]?)/i);return m?Number(m[1])*({K:1e3,M:1e6,B:1e9}[m[2].toUpperCase()]||1):0};
const route=(r)=>r.best_email?`email: ${r.best_email}`:[r.manual_email_button==='yes'&&'YouTube About "business email" button (manual, signed-in + captcha)',r.website&&`site: ${r.website.split(';')[0]}`,r.twitter&&`X: ${r.twitter.split(';')[0]}`,r.instagram&&`IG: ${r.instagram.split(';')[0]}`,r.discord&&`Discord: ${r.discord.split(';')[0]}`].filter(Boolean).join(' / ')||'none found';
const best=e.filter(r=>r.best_email).length, man=e.filter(r=>r.manual_email_button==='yes').length, manOnly=e.filter(r=>r.manual_email_button==='yes'&&!r.best_email).length;
const none=e.filter(r=>!r.best_email&&r.manual_email_button!=='yes');
const top=[...e].sort((a,b)=>a.tier.localeCompare(b.tier)||subs(b.approx_subs)-subs(a.approx_subs)).slice(0,20);
let md=`# Creator email report\n\nGenerated ${new Date().toISOString().slice(0,10)} from ${enr.split('/').pop()}\n\n- Rows: ${e.length}\n- Had an email in the original CSV: ${o.filter(hadEmail).length}\n- Have best_email now: ${best}\n- Newly found: ${e.filter((r,i)=>!hadEmail(o[i])&&r.best_email).length}\n- manual_email_button=yes: ${man} (${manOnly} of those have no other email: need a hand-click)\n- No email and no manual button (social/website route only or nothing): ${none.length}\n\n## Top 20 by tier\n\n| Tier | Channel | Subs | Contact route |\n|---|---|---|---|\n`;
for(const r of top) md+=`| ${r.tier} | ${r.channel_name.replace(/\|/g,'/')} | ${r.approx_subs} | ${route(r).replace(/\|/g,'/')} |\n`;
md+=`\nNote: emails marked best_email are public addresses found on the channel About page, recent video descriptions, or linked sites; MX-checked only (no SMTP probing). Verify the pitch fits before sending.\n`;
fs.writeFileSync(out,md);console.log(md);
