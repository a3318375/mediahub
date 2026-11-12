import { useEffect, useRef, useState } from 'react';
import { schemas } from '../../hero/src/lib/settings-schema';
import { directoryIdFromInput } from '../../hero/src/lib/download-api';
import type { SettingsResponse, SettingsSection, SettingValue } from '../../hero/src/lib/settings-api';
import { Button } from './arc/button/button';
import { Input } from './arc/input/input';
import { Select } from './arc/select/select';
import { Switch } from './arc/switch/switch';
import { requestError } from './live-api';
import { DirectoryPicker } from './live-download';
import type { LiveApi, LiveSession, LiveUser } from './live-api';
import { AccountSettings, LiveKeys, ResourceSettings } from './live-settings-panels';
import { SettingsLayout, VisibilityButton } from './settings';
import { SectionHeading } from './ui';
import { options } from './model';

type Values = Record<string, SettingValue>;
type Field = { key: string; label: string; initial?: string | boolean | number; secret?: boolean; readOnly?: boolean; choices?: string[]; directory?: boolean };
type Source = {
  id: string;
  fields: Field[];
  load: (api: LiveApi, signal: AbortSignal) => Promise<SettingsResponse>;
  save?: (api: LiveApi, changes: Values, current: SettingsResponse) => Promise<SettingsResponse>;
  section?: SettingsSection;
};

function section(id: SettingsSection, fields: Field[]): Source {
  return { id, fields, section: id, load: (api, signal) => api.settings(id, signal), save: (api, changes) => api.saveSettings(id, changes) };
}

const valuesOnly = (values: Values): SettingsResponse => ({ values, configuredSecrets: [] });
function comicCookieSettings({ configured, maskedCookie }: Awaited<ReturnType<LiveApi['comicCredentials']>>): SettingsResponse {
  return { values: {}, configuredSecrets: configured ? ['cookie'] : [], maskedSecrets: maskedCookie ? { cookie: maskedCookie } : {} };
}
const schemaFields = (id: SettingsSection): Field[] => schemas[id].map(([key, label, initial, kind]) => ({
  key, label, initial: Array.isArray(initial) ? initial.join(', ') : initial, secret: kind === 'secret',
  choices: key === 'notifications.receiveMode' ? ['长轮询', 'Webhook'] : undefined,
}));

const basicSources: Source[] = [
  section('tmdb', schemaFields('tmdb')),
  section('emby', schemaFields('emby')),
  section('115', schemaFields('115')),
  {
    id: 'library',
    fields: [
      { key: 'subsonic', label: 'Subsonic 服务地址', readOnly: true },
      { key: 'comics', label: '漫画书库路径', readOnly: true },
      { key: 'novels', label: '小说书库路径', readOnly: true },
    ],
    load: async (api, signal) => {
      const [comics, novels] = await Promise.all([api.libraryPath('comics', signal), api.libraryPath('novels', signal)]);
      return valuesOnly({ subsonic: window.location.origin, comics: comics.root, novels: novels.root });
    },
  },
  {
    id: 'comics-cookie',
    fields: [{ key: 'cookie', label: 'ExHentai Cookie', secret: true }],
    load: async (api, signal) => comicCookieSettings(await api.comicCredentials(signal)),
    save: async (api, changes) => comicCookieSettings(await api.saveComicCredentials(String(changes.cookie))),
  },
];
const searchSources = [section('search', schemaFields('search'))];
const notificationSources = [section('notifications', schemaFields('notifications'))];
const organizeSources: Source[] = [{
  id: 'organize',
  fields: [
    { key: 'sourceId', label: '来源目录（115）', directory: true }, { key: 'targetId', label: '输出目录（115）', directory: true },
    { key: 'cron', label: '定时规则（北京时间）' },
    { key: 'enabled', label: '定时整理已启用', initial: false, readOnly: true },
    { key: 'scheduleError', label: '定时规则错误', readOnly: true },
  ],
  load: async (api, signal) => valuesOnly({ ...await api.organizeConfig(signal) }),
  save: async (api, changes, { values }) => {
    const next = { ...values, ...changes };
    return valuesOnly({ ...await api.saveOrganizeConfig({
      sourceId: directoryIdFromInput(String(next.sourceId ?? '')),
      targetId: directoryIdFromInput(String(next.targetId ?? '')),
      cron: String(next.cron ?? ''),
    }) });
  },
}];
function outputSources(kind: 'strm' | 'scraping'): Source[] {
  return [{
    id: kind,
    fields: kind === 'strm' ? [
      { key: 'sourceId', label: '来源目录（115）', directory: true }, { key: 'outputDir', label: '输出目录' },
      { key: 'cron', label: '定时规则（北京时间）' }, { key: 'baseUrl', label: '播放服务地址' },
    ] : [{ key: 'outputDir', label: '刮削目录' }],
    load: async (api, signal) => valuesOnly({ ...(await api.outputConfig(kind, signal)).config }),
    save: async (api, changes, { values }) => {
      const next = { ...values, ...changes };
      const sourceId = String(next.sourceId ?? '');
      const body = { sourceId: kind === 'strm' && sourceId.trim() ? directoryIdFromInput(sourceId) : sourceId,
        outputDir: String(next.outputDir ?? ''), baseUrl: String(next.baseUrl ?? ''), cron: kind === 'strm' ? String(next.cron ?? '') : '' };
      return valuesOnly({ ...(await api.saveOutputConfig(kind, body)).config });
    },
  }];
}
const strmSources = outputSources('strm');
const scrapingSources = outputSources('scraping');

function ServerSettingsForm({ api, sources, title, description, onSaved }: {
  api: LiveApi; sources: Source[]; title: string; description?: string; onSaved?: (values: Values) => void;
}) {
  const [loaded, setLoaded] = useState<Record<string, SettingsResponse>>();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [shown, setShown] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<Field>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const reveal = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all(sources.map(async source => [source.id, await source.load(api, controller.signal)] as const))
      .then(results => { if (!controller.signal.aborted) setLoaded(Object.fromEntries(results)); })
      .catch(reason => { if (!controller.signal.aborted) setError(requestError(reason)); });
    return () => { controller.abort(); reveal.current?.abort(); };
  }, [api, revision, sources]);

  const valueFor = (source: Source, field: Field) => field.secret ? '' : loaded?.[source.id]?.values[field.key] ?? field.initial ?? '';
  const changes = sources.map(source => ({ source, fields: source.fields.filter(field => {
    if (field.readOnly || draft[field.key] === undefined) return false;
    const value = draft[field.key];
    return field.secret ? String(value).trim().length > 0 : String(value) !== String(valueFor(source, field));
  }) })).filter(group => group.fields.length > 0 && group.source.save);

  function edit(key: string, value: string | boolean) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setSaved(false);
  }
  async function toggleSecret(source: Source, field: Field) {
    const key = field.key;
    if (shown[key] !== undefined) {
      setShown(previous => { const next = { ...previous }; delete next[key]; return next; });
      return;
    }
    if (draft[key] !== undefined || !source.section || !loaded?.[source.id].configuredSecrets.includes(key)) {
      setShown(previous => ({ ...previous, [key]: '' }));
      return;
    }
    reveal.current?.abort();
    const controller = new AbortController();
    reveal.current = controller;
    try {
      const { value } = await api.revealSetting(source.section, key, controller.signal);
      if (!controller.signal.aborted) setShown(previous => ({ ...previous, [key]: value }));
    } catch (reason) { if (!controller.signal.aborted) setError(requestError(reason)); }
  }
  async function save() {
    if (!loaded || busy || !changes.length) return;
    reveal.current?.abort();
    setShown({}); setBusy(true); setError(''); setSaved(false);
    const failures: string[] = [];
    for (const { source, fields } of changes) {
      try {
        const patch = Object.fromEntries(fields.map(field => [field.key, typeof field.initial === 'number' ? Number(draft[field.key]) : draft[field.key]]));
        const config = await source.save!(api, patch, loaded[source.id]);
        setLoaded(previous => ({ ...previous, [source.id]: config }));
        setDraft(previous => {
          const next = { ...previous };
          for (const field of fields) delete next[field.key];
          return next;
        });
        onSaved?.(config.values);
      } catch (reason) { failures.push(fields.map(field => field.label).join('、') + ' — ' + requestError(reason)); }
    }
    setBusy(false);
    if (failures.length) setError(failures.join('；'));
    else setSaved(true);
  }

  return <><form className="panel stack" onSubmit={event => { event.preventDefault(); void save(); }}>
    <SectionHeading title={title} description={description} />
    {error && <p role="alert">{error}</p>}
    {!loaded ? error ? <div><Button variant="secondary" onClick={() => setRevision(value => value + 1)}>重新读取</Button></div>
      : <p role="status">正在读取配置…</p> : <>
        <div className="field-grid">{sources.flatMap(source => source.fields.map(field => {
          const { key, label, initial, readOnly, secret, choices } = field;
          const value = draft[key] ?? valueFor(source, field);
          if (key === 'scheduleError' && !value) return null;
          if (typeof initial === 'boolean') return <label className="switch-row" key={key}><span>{label}</span>
            <Switch aria-label={label} checked={value === true} disabled={busy || readOnly} onCheckedChange={next => edit(key, next)} /></label>;
          if (choices && (choices.includes(String(value)) || !value)) return <Select key={key} label={label} value={String(value)}
            options={options(choices)} disabled={busy} onValueChange={next => edit(key, next)} />;
          const visible = shown[key] !== undefined;
          const storedValue = visible ? shown[key] : '';
          const config = loaded[source.id];
          const placeholder = secret && config.configuredSecrets.includes(key)
            ? config.maskedSecrets?.[key]?.replace('••••••••', '****') || '****'
            : undefined;
          return <div key={key} className={secret ? 'secret-field' : field.directory ? 'row fields settings-directory' : undefined}>
            <Input label={label} type={secret && !visible ? 'password' : typeof initial === 'number' ? 'number' : 'text'}
              value={storedValue || String(value)} readOnly={readOnly || Boolean(storedValue)} disabled={busy}
              autoComplete={secret ? 'new-password' : undefined} required={typeof initial === 'number'}
              min={typeof initial === 'number' ? 1 : undefined} placeholder={placeholder}
              onChange={event => edit(key, event.target.value)} />
            {secret && <VisibilityButton label={label} visible={visible} toggle={() => { if (!busy) void toggleSecret(source, field); }} />}
            {field.directory && <Button size="sm" variant="secondary" disabled={busy} aria-label={'浏览' + label}
              onClick={() => setPicking(field)}>浏览文件夹</Button>}
          </div>;
        }))}</div>
        <div className="row">
          <Button type="submit" disabled={busy || changes.length === 0}>{busy ? '正在保存…' : '保存配置'}</Button>
          {saved && <span role="status" className="muted">已保存到服务器</span>}
        </div>
      </>}
  </form>{picking && <DirectoryPicker api={api} title={'选择' + picking.label} close={() => setPicking(undefined)} choose={folder => {
    edit(picking.key, folder.id); setPicking(undefined);
  }} />}</>;
}

export function LiveSettings({ api, user, onUser, onSession, menuSources, onMenus }: {
  api: LiveApi; user: LiveUser; onUser: (user: LiveUser) => void; onSession: (session: LiveSession) => void;
  menuSources: { id: string; label: string }[]; onMenus: (values: Values) => void;
}) {
  // Keep the sources stable while other parts of the workspace re-render.
  const [menus] = useState(() => [section('menus', menuSources.map(({ id, label }) => ({ key: 'menus.' + id, label, initial: true })))]);
  return <SettingsLayout description="调整菜单、连接参数、账号和通知。" panels={{
    menus: <ServerSettingsForm api={api} title="菜单管理" description="选择侧边栏显示的模块。" sources={menus} onSaved={onMenus} />,
    basic: <ServerSettingsForm api={api} title="基础配置" description="配置 Emby、TMDB、115 和漫画服务，查看音乐及书库地址。" sources={basicSources} />,
    organize: <ServerSettingsForm api={api} title="媒体整理" description="填写 115 目录 ID 或链接，留空定时规则可停用定时整理。" sources={organizeSources} />,
    strm: <ServerSettingsForm api={api} title="STRM 生成" description="配置生成目录、播放地址和定时规则。" sources={strmSources} />,
    scraping: <ServerSettingsForm api={api} title="元数据刮削" description="配置服务端手动刮削的目录。" sources={scrapingSources} />,
    rules: <ServerSettingsForm api={api} title="搜索规则" sources={searchSources} />,
    search: <ResourceSettings api={api} />,
    account: <AccountSettings api={api} user={user} onUser={onUser} onSession={onSession} />,
    keys: <LiveKeys api={api} />,
    notifications: <ServerSettingsForm api={api} title="通知与机器人" description="保存 Telegram 与 Webhook 配置。" sources={notificationSources} />,
  }} />;
}
