import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import pg from 'pg';
const appUrl=process.env.TEST_APP_URL??'http://localhost:3100';
assert.ok(['http://localhost:3100','http://localhost:3101'].includes(appUrl),'Only this local application can be tested');

const status=JSON.parse(execFileSync('pnpm.cmd',['dlx','supabase@2.116.0','status','--output','json'],{encoding:'utf8',shell:true,stdio:['ignore','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:56321');
const auth=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const database=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
const created=[];await database.connect();
try {
  for(const role of ['ADMIN','MECHANIC','UNINVITED']) {
    const email=`test-${randomUUID()}@example.invalid`;const password=randomBytes(30).toString('hex');
    const {data,error}=await auth.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'ADMIN'}});
    if(error)throw error;created.push(data.user.id);
    if(role!=='UNINVITED')await database.query('INSERT INTO workshop."Member"(id,"authSubject",email,name,role) VALUES($1,$1,$2,$3,$4)',[data.user.id,email,'HTTP test '+role,role]);
    const jar=new Map();
    const session=createServerClient(status.API_URL,status.PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
    const signIn=await session.auth.signInWithPassword({email,password});if(signIn.error)throw signIn.error;
    if(role==='ADMIN'){
      const tokenName=[...jar.keys()].find(name=>name.endsWith('-auth-token'));
      assert.ok(tokenName,'Expected a non-chunked local auth cookie');
      const stored=JSON.parse(Buffer.from(jar.get(tokenName).slice('base64-'.length),'base64url').toString());
      stored.expires_at=1;
      jar.set(tokenName,'base64-'+Buffer.from(JSON.stringify(stored)).toString('base64url'));
    }
    const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
    const response=await fetch(appUrl+'/',{headers:{cookie},redirect:'manual'});
    if(role==='ADMIN'){
      assert.ok(response.headers.get('set-cookie')?.includes('auth-token'),'Refreshed session cookie must reach browser');
      const cache=response.headers.get('cache-control')??'';
      assert.ok(appUrl.endsWith('3101')?cache.includes('no-store'):cache.includes('no-cache'), 'Cache policy: '+cache);
    }
    if(role==='UNINVITED') {assert.equal(response.status,307);assert.ok(response.headers.get('location')?.includes('/login'));}
    else {assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('HTTP test '+role));if(role==='MECHANIC')assert.equal(html.includes('Autorizar miembro'),false);}
    await session.auth.signOut();
  }
  const unauthenticated=await fetch(appUrl+'/',{redirect:'manual'});assert.equal(unauthenticated.status,307);
  const mutation=await fetch(appUrl+'/api/tasks/time',{method:'POST',headers:{origin:'http://localhost:3100','content-type':'application/json'},body:'{}'});assert.equal(mutation.status,403);
  console.log('Local HTTP auth checks passed: session refresh cookie, cache policy, authorized admin/mechanic, uninvited metadata spoof rejected, anonymous page and mutation rejected. Google OAuth itself was not tested.');
}finally {
  if(created.length)await database.query('DELETE FROM workshop."Member" WHERE id=ANY($1::uuid[])',[created]);
  for(const id of created)await auth.auth.admin.deleteUser(id);
  await database.end();
}
