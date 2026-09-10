import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function localTestAccessEnabled() {
  if(process.env.LOCAL_TEST_ACCESS!=="true"||process.env.VERCEL)return false;
  try {
    const db=new URL(process.env.DATABASE_URL??"");
    return ["127.0.0.1","localhost"].includes(db.hostname)&&db.port==="56322"&&process.env.NEXT_PUBLIC_SUPABASE_URL==="http://127.0.0.1:56321";
  }catch{return false;}
}

export async function localCredentials(role:string):Promise<{email:string;password:string}|null> {
  if(!localTestAccessEnabled()||!["admin","office","mechanic"].includes(role))return null;
  const users=JSON.parse(await readFile(path.join(process.cwd(),".secrets/local-users.json"),"utf8"));
  return users[role]??null;
}
