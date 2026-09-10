import { createServerClient } from "@supabase/ssr";
import { NextResponse,type NextRequest } from "next/server";

export async function proxy(request:NextRequest) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response=NextResponse.next({request});
  response.headers.set("Cache-Control","private, no-store");
  if(!url||!key)return response;
  const auth=createServerClient(url,key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:(values,headers)=>{
      for(const {name,value} of values)request.cookies.set(name,value);
      response=NextResponse.next({request});
      for(const {name,value,options} of values)response.cookies.set(name,value,options);
      for(const [name,value] of Object.entries(headers??{}))response.headers.set(name,value);
      response.headers.set("Cache-Control","private, no-store");
    },
  }});
  // Refresh before Server Components render. Domain services still authorize
  // every operation using the verified identity and the current Member record.
  await auth.auth.getUser();
  return response;
}

export const config={matcher:["/","/login","/auth/:path*","/api/:path*"]};
