import { useEffect, useState } from 'react';
import { directoryIdFromInput, is115ShareURL } from '../../hero/src/lib/download-api';
import type { DownloadFile, DownloadReference } from '../../hero/src/lib/download-api';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { requestError, type LiveApi } from './live-api';

export type DownloadResource = { title: string; url: string; password?: string; reference: DownloadReference };

export function DirectoryPicker({ api, choose, close, title = '选择 115 目标文件夹' }: {
  api: LiveApi; choose: (folder: DownloadFile) => void; close: () => void; title?: string;
}) {
  const [path, setPath] = useState<DownloadFile[]>([]);
  const [items, setItems] = useState<DownloadFile[]>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const folder = path.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    setItems(undefined); setError('');
    api.downloadDirectories(folder?.id ?? '0', controller.signal).then(result => {
      if (!controller.signal.aborted) setItems((result.items ?? []).filter(item => item.directory));
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, folder?.id, retry]);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent title={title}>
      <div className="stack">
        <div className="row">
          {!!path.length && <Button variant="ghost" onClick={() => setPath(current => current.slice(0, -1))}>上一级</Button>}
          <span>{path.map(item => item.name).join(' / ') || '根目录'}</span>
        </div>
        {error ? <div className="row"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRetry(n => n + 1)}>重试</Button></div>
          : !items ? <p role="status">正在读取文件夹…</p>
          : items.length ? <ul className="anime-resources">{items.map(item => <li key={item.id}>
            <Button variant="ghost" onClick={() => setPath(current => [...current, item])}>{item.name}</Button>
          </li>)}</ul> : <p className="muted">没有子文件夹。</p>}
        <div className="row form-actions"><Button variant="ghost" onClick={close}>返回</Button>
          <Button disabled={!folder} onClick={() => { if (folder) choose(folder); }}>选择当前文件夹</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function ResourceDownload({ api, resource, close, done }: {
  api: LiveApi; resource: DownloadResource; close: () => void; done: (message: string) => void;
}) {
  const share = is115ShareURL(resource.url);
  const [code, setCode] = useState(resource.password ?? '');
  const [submittedCode, setSubmittedCode] = useState(code);
  const [path, setPath] = useState<DownloadFile[]>([]);
  const [files, setFiles] = useState<DownloadFile[]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [picking, setPicking] = useState(false);
  const directory = path.at(-1)?.id ?? '';

  useEffect(() => {
    if (!share) return;
    const controller = new AbortController();
    setFiles(undefined);
    setSelected([]);
    setListError('');
    api.shareFiles(resource.url, submittedCode, directory, controller.signal).then(result => {
      if (!controller.signal.aborted) setFiles(result.items ?? []);
    }).catch(reason => {
      if (!controller.signal.aborted) setListError(requestError(reason));
    });
    return () => controller.abort();
  }, [api, directory, resource.url, retry, share, submittedCode]);

  async function submit(wholeShare = false) {
    if (busy || (!share && !/^magnet:\?/i.test(resource.url))) return;
    setBusy(true); setError('');
    try {
      const result = await api.createDownload({
        kind: share ? 'share_transfer' : 'offline',
        url: resource.url, directoryId: destination.trim() ? directoryIdFromInput(destination) : '', reference: resource.reference,
        ...(share ? { wholeShare, receiveCode: code.trim(), ...(wholeShare ? {} : { sourceDirectoryId: directory, fileIds: selected }) } : {}),
      });
      done(result.created ? '已加入下载队列，完成后按设置自动整理。' : '此资源已在下载队列中。');
      close();
    } catch (reason) { setError(requestError(reason)); }
    finally { setBusy(false); }
  }

  return <><Dialog open onOpenChange={open => { if (!open && !busy && !picking) close(); }}>
    <DialogContent className="wide-dialog" title={share ? '转存到 115' : '115 离线下载'} description={resource.title}>
      <div className="stack">
        {share && <>
          <form className="row fields" onSubmit={event => {
            event.preventDefault(); setSubmittedCode(code.trim()); setPath([]); setRetry(value => value + 1);
          }}>
            <Input label="提取码" value={code} disabled={busy} onChange={event => setCode(event.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy}>读取分享文件</Button>
          </form>
          {path.length > 0 && <div className="row">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setPath(current => current.slice(0, -1))}>返回上一级</Button>
            <span>{path.map(folder => folder.name).join(' / ')}</span>
          </div>}
          {listError ? <p role="alert">{listError}</p> : !files ? <p role="status">正在读取分享文件…</p> :
            files.length ? <ul className="anime-resources">{files.map(file => <li key={file.id} className="row">
              <label className="row"><input type="checkbox" checked={selected.includes(file.id)} disabled={busy || code.trim() !== submittedCode}
                onChange={event => setSelected(current => event.target.checked ? [...current, file.id] : current.filter(id => id !== file.id))} />
                {file.name}</label>
              {file.directory && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPath(current => [...current, file])}>打开文件夹</Button>}
            </li>)}</ul> : <p className="muted">此文件夹为空。</p>}
        </>}
        <div className="row fields">
          <Input label="115 目标目录" placeholder="留空自动分类，或填写目录 ID / 链接" value={destination} disabled={busy}
            onChange={event => { setDestination(event.target.value); setDestinationName(''); }} />
          <Button variant="secondary" disabled={busy} onClick={() => setPicking(true)}>浏览文件夹</Button>
        </div>
        {destinationName && <small className="muted">已选择 {destinationName}</small>}
        {error && <p role="alert">{error}</p>}
        <div className="row form-actions">
          <Button variant="ghost" disabled={busy} onClick={close}>取消</Button>
          {share && <Button variant="secondary" disabled={busy} onClick={() => void submit(true)}>转存整个分享</Button>}
          <Button disabled={busy || (share && (!files || !selected.length || code.trim() !== submittedCode))}
            onClick={() => void submit()}>{busy ? '正在提交…' : share ? '转存所选文件' : '加入下载队列'}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>{picking && <DirectoryPicker api={api} close={() => setPicking(false)} choose={folder => {
    setDestination(folder.id); setDestinationName(folder.name); setPicking(false);
  }} />}</>;
}
