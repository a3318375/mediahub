import { useEffect, useState } from "react";
import { Button, Card } from "@heroui/react";
import { DirectoryField, Field, Notice } from "../../components/ui/ManagementUI";
import { errorText } from "../../components/media/MediaUI";
import { mediaOutputApi, type OutputConfig, type OutputKind } from "../../lib/media-output-api";
import type { Session } from "../../lib/media-service";
import { directoryIdFromInput } from "../../lib/download-api";
const empty:OutputConfig={sourceId:"",outputDir:"",baseUrl:"",cron:""};
export function MediaOutputSettings({session,kind}:{session:Session;kind:OutputKind}) {
  const [config,setConfig]=useState<OutputConfig>(empty);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setLoaded(false);setError("");setNotice("");setConfig(empty);
    if(session.mode!=="live")return ()=>controller.abort();
    mediaOutputApi.config(kind,controller.signal).then((job)=>{if(!controller.signal.aborted){setConfig(job.config);setLoaded(true);}}).catch((e)=>{if(!controller.signal.aborted)setError(errorText(e));});
    return ()=>controller.abort();
  },[kind,session]);
  return <Card className="management-card">
    <h2>{kind==="strm"?"STRM 生成设置":"手动刮削设置"}</h2>
    <Notice error={error}>{notice}</Notice>
    {session.mode!=="live"&&<p>连接真实服务后配置此功能。</p>}
    <form className="management-stack" onSubmit={async(event)=>{
      event.preventDefault();if(busy||!loaded)return;setBusy(true);setError("");setNotice("");
      try{const payload=kind==="strm"?{...config,sourceId:directoryIdFromInput(config.sourceId)}:config;const result=await mediaOutputApi.save(kind,payload);setConfig(result.config);setNotice(kind==="strm"?(result.config.cron.trim()?"设置已保存，定时生成已启用。":"设置已保存，未启用定时，可在媒体处理页面手动生成。"):"设置已保存，刮削仅在手动触发时执行。");}
      catch(e){setError(errorText(e));}finally{setBusy(false);}
    }}>
      {kind==="strm"&&<DirectoryField session={session} label="115 来源目录" value={config.sourceId} onChange={(v)=>setConfig({...config,sourceId:v})} />}
      {kind==="scraping"&&<Field label="刮削目录" value={config.outputDir} onChange={(v)=>setConfig({...config,outputDir:v})} required placeholder="后端机器上的绝对目录" disabled={!loaded}/>}
      <p className="media-note">{kind==="strm"?`默认使用已整理目录作为来源，镜像目录结构生成 .strm。输出位置：${config.outputDir || "正在读取…"}。`:"扫描本地视频或 STRM，在相邻位置补充 NFO、海报等资料。可填写 STRM 输出目录。"}</p>
      {kind==="strm"&&<>
        <Field label="定时生成 Cron" value={config.cron} onChange={(v)=>setConfig({...config,cron:v})} placeholder="留空不启用定时，例如 0 3 * * *" disabled={!loaded}/>
        <p className="media-note">5 段 Cron，按北京时间执行。未配置不触发，Cron 留空时仅支持手动生成。登录和恢复会话时自动保存当前页面地址，定时生成沿用该地址，视频通过 MediaHub 转发。</p>
      </>}
      <p className="media-note">{kind==="scraping"?"优先使用文件已有的 TMDB / Bangumi 关联；未关联的文件需要在基础配置填写 TMDB Key，以便匹配作品。":"同一路径已有文件时不会覆盖；内容不同时会记录冲突。"} 保存设置不会立即执行任务。</p>
      <div className="management-actions"><Button type="submit" isDisabled={!loaded||busy}>{busy?"正在保存…":"保存设置"}</Button></div>
    </form>
  </Card>;
}
