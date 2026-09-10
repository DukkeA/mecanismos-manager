import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import pg from 'pg';

try {await access('.env.local');console.log('.env.local already exists; preserved.');process.exit(0);}catch{}
const status=JSON.parse(execFileSync('pnpm.cmd',['dlx','supabase@2.116.0','status','--output','json'],{encoding:'utf8',shell:true,stdio:['ignore','pipe','pipe']}));
if(status.API_URL!=='http://127.0.0.1:56321')throw Error('Unexpected local Supabase instance; refusing configuration.');
const password=randomBytes(32).toString('hex');
const client=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
await client.connect();
try {
  await client.query('SELECT 1 FROM workshop."Location" LIMIT 1');
  await client.query(`ALTER ROLE workshop_runtime LOGIN PASSWORD '${password}'`);
}finally{await client.end();}
const publishable=status.PUBLISHABLE_KEY;
if(!publishable?.startsWith('sb_publishable_'))throw Error('Missing local publishable key.');
await writeFile('.env.local',[
  '# Generated local development configuration. Never commit.',
  `DATABASE_URL=postgresql://workshop_runtime:${password}@127.0.0.1:56322/postgres`,
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
  'NEXT_PUBLIC_APP_URL=http://localhost:3100',
  'GOOGLE_AUTH_ENABLED=false','',
].join('\n'),{flag:'wx'});
console.log('Local environment configured with a dedicated runtime role. No secrets printed.');
