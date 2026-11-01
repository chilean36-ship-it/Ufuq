import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}})}
function ytId(url:string|null){if(!url)return null;const m=url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/i);return m?.[1]??null}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders}); if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization"); if(!auth?.startsWith("Bearer "))return json({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL")??"", pub=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??Deno.env.get("SUPABASE_ANON_KEY")??"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}}); const adminDb=createClient(url,service);
 const {data:{user},error:ue}=await userDb.auth.getUser(); if(ue||!user)return json({error:"Unauthorized"},401);
 let body:{video_id?:string}; try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}; const id=body.video_id; if(!id)return json({error:"video_id is required"},400);
 const {data:p,error:pe}=await userDb.from("profiles").select("id,status").eq("id",user.id).maybeSingle(); if(pe||!p||p.status!=="active")return json({error:"Account is not active"},403);
 const {data:v,error:ve}=await userDb.from("video_lessons").select("id,group_code,title,video_url,storage_path").eq("id",id).maybeSingle(); if(ve||!v)return json({error:"Video not found"},404); if(!v.group_code)return json({error:"Video is not assigned to a group"},403);
 const {data:m,error:me}=await userDb.from("group_members").select("group_code").eq("user_id",user.id).eq("group_code",v.group_code).maybeSingle(); if(me||!m)return json({error:"You are not a member of this group"},403);
 let youtubeUrl:string|null=null;
 const {data:srcRows,error:se}=await adminDb.rpc("get_video_source",{p_video_id:id}); const s=Array.isArray(srcRows)?srcRows[0]:srcRows;
 if(!se&&s?.youtube_url) youtubeUrl=s.youtube_url; else if(v.video_url) youtubeUrl=v.video_url;
 const y=ytId(youtubeUrl); if(!y)return json({error:"Video source unavailable or invalid"},404);
 return json({video_id:id,title:v.title,embed_url:`https://www.youtube-nocookie.com/embed/${y}?rel=0&modestbranding=1&playsinline=1`});
});
