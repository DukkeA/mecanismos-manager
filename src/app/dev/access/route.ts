import { NextResponse } from "next/server";
import { localCredentials,localTestAccessEnabled } from "@/server/local-test-access";
import { supabaseServer } from "@/server/auth";

export async function POST(request:Request) {
  const url=new URL(request.url);
  if(!localTestAccessEnabled()||!["localhost","127.0.0.1"].includes(url.hostname))return new Response(null,{status:404});
  const origin=request.headers.get("origin");
  const host=request.headers.get("host");
  if(!origin||new URL(origin).host!==host||!["localhost","127.0.0.1"].includes(new URL(origin).hostname))return new Response(null,{status:403});
  const data=await request.formData();const credentials=await localCredentials(String(data.get("role")));
  if(!credentials)return new Response(null,{status:400});
  const auth=await supabaseServer();
  const {error}=await auth.auth.signInWithPassword(credentials);
  if(error)return NextResponse.redirect(new URL("/login?error=local",origin),303);
  const response=NextResponse.redirect(new URL("/",origin),303);
  response.headers.set("Cache-Control","private, no-store");return response;
}
