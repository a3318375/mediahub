import { useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { cloudLabels } from '../../hero/src/lib/parity';
import { normalizeResourceChannel } from '../../hero/src/lib/resource-search';
import type { APIKeyInfo } from '../../hero/src/lib/api-keys-api';
import type { ResourceSearchMeta } from '../../hero/src/lib/resource-search';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { Switch } from './arc/switch/switch';
import { Textarea } from './arc/textarea/textarea';
import { requestError } from './live-api';
import type { LiveApi, LiveSession, LiveUser } from './live-api';
import { SectionHeading, WorkspaceTabs } from './ui';

export function AccountSettings({ api, user, onUser, onSession }: {
  api: LiveApi; user: LiveUser; onUser: (user: LiveUser) => void; onSession: (session: LiveSession) => void;
}) {
  const [account, setAccount] = useState(user.account);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = account.trim() !== user.account || Boolean(password || confirm);

  async function save() {
    if (!changed || !current || busy) return;
    setError(''); setSaved(false);
    if (password !== confirm) { setError('两次输入的新密码不一致。'); return; }
    setBusy(true);
    try {
      if (account.trim() !== user.account) onUser(await api.updateAccount(account.trim(), current));
      if (password) onSession(await api.updatePassword(password, current));
      setCurrent(''); setPassword(''); setConfirm(''); setSaved(true);
    } catch (reason) { setError(requestError(reason)); }
    finally { setBusy(false); }
  }
  return <form className="panel stack" onChange={() => setSaved(false)} onSubmit={event => { event.preventDefault(); void save(); }}>
    <SectionHeading title="账号与安全" description="修改登录账号或密码需要验证当前密码。" />
    <div className="field-grid">
      <Input label="显示名称" value={user.name || user.account} readOnly />
      <Input label="登录账号" autoComplete="username" required minLength={3} maxLength={32} value={account} disabled={busy}
        onChange={event => setAccount(event.target.value)} />
      <Input label="当前密码" type="password" autoComplete="current-password" value={current} disabled={busy} onChange={event => setCurrent(event.target.value)} />
      <Input label="新密码" type="password" autoComplete="new-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      <Input label="确认新密码" type="password" autoComplete="new-password" value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} />
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="row"><Button type="submit" disabled={!changed || !current || busy}>{busy ? '正在保存…' : '保存配置'}</Button>
      {saved && <span role="status" className="muted">账号信息已保存</span>}</div>
  </form>;
}

export function LiveKeys({ api }: { api: LiveApi }) {
  const [items, setItems] = useState<APIKeyInfo[]>();
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState(false);
  const [revoke, setRevoke] = useState<APIKeyInfo>();
  const [name, setName] = useState('');
  const [created, setCreated] = useState('');
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.apiKeys(controller.signal).then(rows => { if (!controller.signal.aborted) setItems(rows); })
      .catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, revision]);

  function close() {
    setDialog(false); setRevoke(undefined); setCreated(''); setName(''); setDialogError('');
  }
  async function act() {
    if (busy) return;
    setBusy(true); setDialogError('');
    try {
      if (revoke) {
        await api.revokeKey(revoke.id);
        close();
      } else {
        const result = await api.createKey(name.trim());
        setCreated(result.key);
      }
      setRevision(value => value + 1);
    } catch (reason) { setDialogError(requestError(reason)); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    <SectionHeading title="API 密钥" description="为连接 MediaHub 的客户端创建和管理密钥。"
      action={<Button onClick={() => setDialog(true)}><Plus size={16} aria-hidden="true" />生成密钥</Button>} />
    {error && <div className="row"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新读取</Button></div>}
    {!items ? !error && <p role="status">正在读取密钥列表…</p> : <div className="table-panel">
      <SortableDataTable rows={items} rowKey="id" caption="API 密钥列表" emptyMessage="尚未生成密钥" columns={[
        { key: 'name', label: '名称', render: (_, row) => <span className="row"><KeyRound size={15} aria-hidden="true" />{row.name}</span> },
        { key: 'prefix', label: '密钥', render: (_, row) => <code>{row.prefix}…</code> },
        { key: 'lastUsedAt', label: '最近使用', render: (_, row) => row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString('zh-CN') : '未使用' },
        { key: 'action', label: '操作', render: (_, row) => <Button variant="ghost" size="sm" disabled={Boolean(row.revokedAt)}
          aria-label={row.revokedAt ? '已撤销 ' + row.name : '撤销 ' + row.name} onClick={() => setRevoke(row)}>{row.revokedAt ? '已撤销' : '撤销'}</Button> },
      ]} />
    </div>}
    <Dialog open={dialog || Boolean(revoke)} onOpenChange={open => { if (!open && !busy) close(); }}>
      <DialogContent title={revoke ? '撤销 API 密钥' : '生成 API 密钥'} description={revoke ? `使用「${revoke.name}」的客户端将无法继续连接。` : '为密钥填写一个便于识别的名称。'}>
        {created ? <div className="stack">
          <p>完整密钥仅显示一次，请妥善保存。</p>
          <Input label="完整密钥" readOnly value={created} autoComplete="off" />
          <div className="row"><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(created).catch(() => setDialogError('复制失败，请手动复制。'))}>复制密钥</Button>
            <Button onClick={close}>已保存</Button></div>
          {dialogError && <p role="alert">{dialogError}</p>}
        </div> : <form className="stack" onSubmit={event => { event.preventDefault(); void act(); }}>
          {!revoke && <Input label="密钥名称" value={name} required disabled={busy} onChange={event => setName(event.target.value)} />}
          {dialogError && <p role="alert">{dialogError}</p>}
          <div className="row"><Button variant="secondary" disabled={busy} onClick={close}>取消</Button>
            <Button variant={revoke ? 'danger' : 'primary'} type="submit" disabled={busy || (!revoke && !name.trim())}>{revoke ? '确认撤销' : '生成密钥'}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}

type ListKey = 'channels' | 'plugins' | 'cloudTypes';
const listTabs: { id: ListKey; label: string }[] = [
  { id: 'channels', label: 'TG 频道' }, { id: 'plugins', label: '搜索插件' }, { id: 'cloudTypes', label: '网盘类型' },
];

export function ResourceSettings({ api }: { api: LiveApi }) {
  const [meta, setMeta] = useState<ResourceSearchMeta>();
  const [selection, setSelection] = useState<ResourceSearchMeta['selection']>();
  const [custom, setCustom] = useState('');
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api.resourceMeta(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) {
        setMeta(data); setSelection(data.selection); setCustom((data.selection.customChannels ?? []).join('\n'));
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => controller.abort();
  }, [api, revision]);
  if (!meta || !selection) return <section className="panel stack">
    <SectionHeading title="资源搜索" />
    {error ? <div className="row"><p role="alert">{error}</p><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新读取</Button></div>
      : <p role="status">正在读取资源搜索配置…</p>}
  </section>;

  const channelInputs = custom.split(/[\n,，]+/).map(channel => channel.trim()).filter(Boolean);
  const normalized = channelInputs.map(normalizeResourceChannel);
  const customChannels = [...new Set(normalized.filter((channel): channel is string => channel !== null))];
  const invalidChannel = normalized.includes(null);
  const channelOptions = [...new Set([...(meta.defaults.channels ?? []), ...(meta.channels ?? []), ...customChannels, ...(selection.channels ?? [])])];
  const choices = { channels: channelOptions, plugins: meta.plugins.map(plugin => plugin.name), cloudTypes: meta.cloudTypes };
  const changed = invalidChannel || JSON.stringify({ ...selection, customChannels }) !== JSON.stringify(meta.selection);

  function set<K extends keyof ResourceSearchMeta['selection']>(key: K, value: ResourceSearchMeta['selection'][K]) {
    setSelection(previous => previous && ({ ...previous, [key]: value }));
    setSaved(false);
  }
  async function save() {
    if (!selection || !meta || busy || !changed) return;
    if (invalidChannel) { setError('请检查自定义 TG 频道，填写频道名或有效的 t.me 链接。'); return; }
    setBusy(true); setSaved(false); setError('');
    try {
      const availableChannels = new Set([...(meta.defaults.channels ?? []), ...customChannels]);
      const next = { ...selection, channels: (selection.channels ?? []).filter(channel => availableChannels.has(channel)), customChannels };
      const changedFields = (['channels', 'customChannels', 'plugins', 'cloudTypes', 'detectionEnabled'] as const)
        .filter(key => JSON.stringify(next[key]) !== JSON.stringify(meta.selection[key]));
      await api.saveSettings('pansou', Object.fromEntries([
        ...changedFields.map(key => ['pansou.' + key, next[key] ?? []] as const),
        ['pansou.configVersion', 1] as const,
      ]));
      setMeta({ ...meta, selection: next }); setSelection(next); setCustom(customChannels.join('\n')); setSaved(true);
    } catch (reason) { setError(requestError(reason)); }
    finally { setBusy(false); }
  }

  return <form className="panel stack" onSubmit={event => { event.preventDefault(); void save(); }}>
    <SectionHeading title="资源搜索" />
    <WorkspaceTabs label="资源搜索设置" items={[
      ...listTabs.map(({ id, label }) => {
        const selected = selection[id] ?? [];
        const available = choices[id];
        const visible = id === 'plugins' ? available.filter(name => name.toLowerCase().includes(filter.trim().toLowerCase())) : available;
        const all = available.length > 0 && available.every(name => selected.includes(name));
        return { id, label, content: <div className="stack">
          {id === 'channels' && <Textarea label="自定义 TG 频道" rows={3} value={custom} disabled={busy}
            onChange={event => { setCustom(event.target.value); setSaved(false); }} placeholder="每行一个频道名或 t.me 链接" />}
          {id === 'plugins' && <Input label="筛选搜索插件" value={filter} onChange={event => setFilter(event.target.value)} />}
          <div className="row"><Button variant="secondary" disabled={busy || !available.length} onClick={() => set(id, all ? [] : available)}>{all ? '取消全选' : '全选'}</Button>
            <span className="muted">已选 {selected.length} 项</span></div>
          <div className="field-grid">{visible.map(name => <label key={name} className="switch-row">
            <span>{id === 'cloudTypes' ? cloudLabels[name] ?? name : name}</span>
            <Switch aria-label={name} disabled={busy} checked={selected.includes(name)}
              onCheckedChange={value => set(id, value ? [...selected, name] : selected.filter(item => item !== name))} />
          </label>)}</div>
        </div> };
      }),
      { id: 'detect', label: '链接检测', content: <label className="switch-row"><span>自动检查搜索结果</span>
        <Switch aria-label="自动检查搜索结果" checked={selection.detectionEnabled} disabled={busy} onCheckedChange={value => set('detectionEnabled', value)} /></label> },
    ]} />
    {error && <p role="alert">{error}</p>}
    <div className="row"><Button type="submit" disabled={busy || !changed}>{busy ? '正在保存…' : '保存配置'}</Button>
      {saved && <span className="muted" role="status">已保存到服务器</span>}</div>
  </form>;
}
