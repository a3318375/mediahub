import { getAccessToken } from "./auth-api";
export type OutputKind = "strm" | "scraping";
export type OutputConfig = {sourceId: string; outputDir: string; baseUrl: string; cron: string};
export type OutputStatus = {state: string; startedAt: string; finishedAt: string; scanned: number; completed: number; skipped: number; failed: number; error?: string; issues: string[]};
export type OutputJob = {config: OutputConfig; status: OutputStatus; configured: boolean};
async function request<T>(kind: OutputKind, action: string, method = "GET", body?: OutputConfig | {baseUrl: string}, signal?: AbortSignal): Promise<T> {
  const token=getAccessToken();
  const response=await fetch(`/api/v1/processing/${kind}/${action}`, {method, signal, cache:"no-store", headers:{Authorization:`Bearer ${token}`, ...(body?{"Content-Type":"application/json"}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(result?.message || "媒体处理请求失败");
  if(!result) throw new Error("媒体处理服务返回无效响应");
  return result as T;
}
export const mediaOutputApi = {
  config:(kind:OutputKind,signal?:AbortSignal)=>request<OutputJob>(kind,"config","GET",undefined,signal),
  save:(kind:OutputKind,config:OutputConfig)=>request<{config:OutputConfig;configured:boolean}>(kind,"config","PUT",kind==="strm"?{...config,baseUrl:window.location.origin}:config),
  run:(kind:OutputKind)=>request<{message:string}>(kind,"run","POST",kind==="strm"?{baseUrl:window.location.origin}:undefined),
};
