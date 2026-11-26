import {scheduleRequest} from './schedule-request';
import {useState,useEffect} from 'react'
import {RefreshCw,Download} from 'lucide-react'
import {requestError,type LiveApi,type ServerLog} from './live-api'
import {options} from './model'
import {Status,PageHeading} from './ui'
import {Button,Select,Switch,SearchField,SortableDataTable} from './controls'
export function LiveLogs({ api }: { api: LiveApi }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('所有级别');
  const [source, setSource] = useState('所有来源');
  const [limit, setLimit] = useState('500');
  const [auto, setAuto] = useState(true);
  const [remoteRows, setRemoteRows] = useState<ServerLog[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => scheduleRequest(() => {
    
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setRemoteRows([]);
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      
      try {
        const items = await api.logs({
          limit, query: query.trim(),
          ...(level !== '所有级别' ? { level } : {}),
          ...(source !== '所有来源' ? { source } : {}),
        }, controller.signal);
        if (controller.signal.aborted) return;
        setError('');
        setRemoteRows(items);
        setSources(previous => [...new Set([...previous, ...items.map(item => item.source)])].sort());
      } catch (reason) {
        if (!controller.signal.aborted) setError(requestError(reason));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          if (auto) timer = setTimeout(load, 5000);
        }
      }
    }
    timer = setTimeout(load, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }), [api, auto, level, limit, query, source, revision]);
  const rows = remoteRows;
  const tones = { INFO: 'info', WARN: 'warning', ERROR: 'danger', DEBUG: 'neutral' } as const;
  function exportLogs() {
    const blob = new Blob([rows.map(log => `[${log.time}] [${log.level}] [${log.source}] ${log.message}`).join('\n')], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'mediahub-logs.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <>
    <PageHeading title="日志中心" description="查询 MediaHub 服务日志。" />
    <div className="stack log-content">
      <div className="panel log-toolbar" role="group" aria-label="日志筛选与操作">
        <div className="log-keyword"><SearchField label="关键词" value={query} onValueChange={setQuery} placeholder="搜索日志内容" /></div>
        <div className="log-filters">
          <Select label="级别" options={options(['所有级别', 'INFO', 'WARN', 'ERROR', 'DEBUG'])} value={level} onValueChange={setLevel} />
          <Select label="来源" options={options(['所有来源', ...sources])} value={source} onValueChange={setSource} />
          <Select label="显示条数" options={options(['50', '100', '200', '500', '1000'])} value={limit} onValueChange={setLimit} />
        </div>
        <div className="row log-actions">
          <Switch label="自动刷新" checked={auto} onCheckedChange={setAuto} />
          <Button size="sm" variant="ghost" aria-label="刷新" title="刷新" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} aria-hidden="true" /><span className="log-action-label">刷新</span></Button>
          <Button size="sm" variant="ghost" aria-label="导出日志" title="导出日志" disabled={!rows.length} onClick={exportLogs}><Download size={15} aria-hidden="true" /><span className="log-action-label">导出</span></Button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <SortableDataTable rows={rows} rowKey="id" caption="日志列表" emptyMessage={busy ? '正在读取日志…' : '没有符合条件的日志'} columns={[
        { key: 'time', label: '时间', width: '11.5rem', sortable: true, render: (_, row) => <span className="log-time">{new Date(row.time).toLocaleString('zh-CN')}</span> },
        { key: 'level', label: '级别', width: '5.5rem', render: (_, row) => <Status tone={tones[row.level as keyof typeof tones]}>{row.level}</Status> },
        { key: 'source', label: '来源', width: '6.5rem', sortable: true },
        { key: 'message', label: '内容', width: 'auto' },
      ]} />
    </div>
  </>;
}
