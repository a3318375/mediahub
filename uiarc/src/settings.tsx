import { useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, EyeOff, KeyRound, Plus } from 'lucide-react';
import { Button } from './arc/button/button';
import { Dialog, DialogContent } from './arc/dialog/dialog';
import { Input } from './arc/input/input';
import { Select } from './arc/select/select';
import { SortableDataTable } from './arc/sortable-data-table/sortable-data-table';
import { Switch } from './arc/switch/switch';
import { Textarea } from './arc/textarea/textarea';
import { Workflow } from './operations';
import { PageHeading, SectionHeading, WorkspaceTabs } from './ui';
import { options, uid } from './model';
import type { DemoState, Notify, Update } from './model';

export type SettingsProps = { state: DemoState; update: Update; notify: Notify };
type Field = { key: string; label: string; kind?: 'switch' | 'multiline' | 'secret'; initial?: string | boolean; choices?: string[] };

const basic: Field[] = [
  { key: 'basic.tmdb', label: 'TMDB API Key', kind: 'secret' },
  { key: 'basic.emby', label: 'Emby 服务地址', initial: 'https://emby.example.test' },
  { key: 'basic.embyKey', label: 'Emby API Key', kind: 'secret' },
  { key: 'basic.embyUser', label: 'Emby 用户 ID' },
  { key: 'basic.cookie', label: '115 Cookie', kind: 'secret' },
  { key: 'basic.music', label: 'Subsonic 服务地址', initial: 'https://music.example.test' },
  { key: 'basic.comics', label: '漫画书库路径', initial: '/演示/漫画' },
  { key: 'basic.comicsCookie', label: 'ExHentai 示例 Cookie', kind: 'secret' },
  { key: 'basic.novels', label: '小说书库路径', initial: '/演示/小说' },
];
const rules: Field[] = [
  { key: 'rules.quality', label: '默认清晰度', choices: ['任意', '4K', '1080p'], initial: '任意' },
  { key: 'rules.words', label: '优先关键词', initial: 'HDR, 简体字幕' },
  { key: 'rules.exclude', label: '排除关键词', initial: '枪版, CAM' },
  { key: 'rules.detect', label: '自动检查可见结果', kind: 'switch', initial: false },
];
const notificationFields: Field[] = [
  { key: 'notifications.telegram', label: 'Telegram 通知', kind: 'switch' },
  { key: 'notifications.token', label: 'Bot Token', kind: 'secret' },
  { key: 'notifications.chat', label: 'Chat ID' },
  { key: 'notifications.webhook', label: 'Webhook 地址' },
  { key: 'notifications.download', label: '下载完成后通知', kind: 'switch', initial: true },
];
const searchTabs: [string, string, Field[]][] = [
  ['channels', 'TG 频道', [{ key: 'search.channels', label: '频道列表', kind: 'multiline', initial: 'demo-movies\ndemo-series' }]],
  ['plugins', '搜索插件', [{ key: 'search.index', label: '启用演示索引', kind: 'switch', initial: true }, { key: 'search.animation', label: '启用动画资源', kind: 'switch', initial: true }]],
  ['drives', '网盘类型', ['115 网盘', '百度网盘', '夸克网盘', '磁力链接'].map(name => ({ key: `search.drive.${name}`, label: name, kind: 'switch', initial: true }))],
  ['detect', '链接检测', [{ key: 'search.detect', label: '自动检查搜索结果', kind: 'switch' }, { key: 'search.timeout', label: '检测超时（秒）', initial: '8' }]],
];

export function VisibilityButton({ label, visible, toggle }: { label: string; visible: boolean; toggle: () => void }) {
  const action = `${visible ? '隐藏' : '显示'}${label}`;
  const Icon = visible ? EyeOff : Eye;
  return <Button type="button" variant="ghost" className="icon-button visibility-button" aria-label={action} title={action} onClick={toggle}><Icon size={18} aria-hidden="true" /></Button>;
}

function SettingsForm({ title, description, fields, state, update, notify }: SettingsProps & { title: string; description?: string; fields: Field[] }) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map(field => [field.key, state.settings[field.key] ?? field.initial ?? (field.kind === 'switch' ? false : '')])));
  const [shown, setShown] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  function change(key: string, value: string | boolean) { setDraft(current => ({ ...current, [key]: value })); setSaved(false); }
  return <form className="panel stack" onSubmit={event => {
    event.preventDefault();
    update(current => ({ ...current, settings: { ...current.settings, ...draft } }));
    setSaved(true);
    notify(`已保存${title}的演示配置`, '设置');
  }}>
    <SectionHeading title={title} description={description} />
    <div className="field-grid">
      {fields.map(field => {
        const value = draft[field.key];
        if (field.kind === 'switch') return <label className="switch-row" key={field.key}><span>{field.label}</span><Switch checked={Boolean(value)} onCheckedChange={next => change(field.key, next)} /></label>;
        if (field.choices) return <Select key={field.key} label={field.label} options={options(field.choices)} value={String(value)} onValueChange={next => change(field.key, next)} />;
        if (field.kind === 'multiline') return <Textarea key={field.key} label={field.label} rows={5} value={String(value)} onChange={event => change(field.key, event.target.value)} />;
        const secret = field.kind === 'secret';
        const visible = shown.includes(field.key);
        return <div key={field.key} className={secret ? 'secret-field' : undefined}>
          <Input label={field.label} type={secret && !visible ? 'password' : 'text'} value={String(value)} onChange={event => change(field.key, event.target.value)} autoComplete="off" placeholder={secret ? '仅填写演示值' : undefined} />
          {secret && <VisibilityButton label={field.label} visible={visible} toggle={() => setShown(items => visible ? items.filter(item => item !== field.key) : [...items, field.key])} />}
        </div>;
      })}
    </div>
    <div className="row"><Button type="submit">保存配置</Button>{saved && <span role="status" className="muted">已保存到演示数据</span>}</div>
  </form>;
}

function Keys({ state, update, notify }: SettingsProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [visible, setVisible] = useState('');
  const [error, setError] = useState('');
  return <div className="stack">
    <SectionHeading title="API 密钥" description="在浏览器中生成和撤销示例密钥。"
      action={<Button onClick={() => { setLabel(''); setError(''); setOpen(true); }}><Plus size={16} aria-hidden="true" />生成示例密钥</Button>} />
    <div className="table-panel"><SortableDataTable rows={state.apiKeys} rowKey="id" caption="API 密钥列表" emptyMessage="尚未生成示例密钥" columns={[
      { key: 'label', label: '名称', render: (_, row) => <span className="row"><KeyRound size={15} aria-hidden="true" />{row.label}</span> },
      { key: 'value', label: '密钥', render: (_, row) => <code>{visible === row.id ? row.value : 'uiarc_demo_••••••••'}</code> },
      { key: 'action', label: '操作', render: (_, row) => <div className="row">
        <VisibilityButton label={`${row.label}密钥`} visible={visible === row.id} toggle={() => setVisible(visible === row.id ? '' : row.id)} />
        <Button variant="ghost" size="sm" onClick={() => { update(current => ({ ...current, apiKeys: current.apiKeys.filter(item => item.id !== row.id) })); notify('已撤销示例密钥', '设置'); }}>撤销</Button>
      </div> },
    ]} /></div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="生成示例密钥" description="演示密钥只用于预览密钥列表。">
        <form className="stack" onSubmit={event => {
          event.preventDefault();
          if (!label.trim()) { setError('请输入密钥名称。'); return; }
          const id = uid();
          update(current => ({ ...current, apiKeys: [...current.apiKeys, { id, label: label.trim(), value: `uiarc_demo_${id.slice(0, 12)}` }] }));
          setVisible(id); setOpen(false); notify('已生成示例密钥', '设置');
        }}><Input label="密钥名称" value={label} error={error} onChange={event => setLabel(event.target.value)} /><Button type="submit">生成密钥</Button></form>
      </DialogContent>
    </Dialog>
  </div>;
}

const settingsTabs = [
  ['menus', '菜单管理'], ['basic', '基础配置'], ['organize', '媒体整理'], ['strm', 'STRM 生成'],
  ['scraping', '元数据刮削'], ['rules', '搜索规则'], ['search', '资源搜索'], ['account', '账号与安全'],
  ['keys', 'API 密钥'], ['notifications', '通知与机器人'],
] as const;

export function SettingsLayout({ description, panels }: {
  description: string; panels: Record<(typeof settingsTabs)[number][0], ReactNode>;
}) {
  return <>
    <PageHeading title="全局设置" description={description} />
    <WorkspaceTabs label="设置分类" items={settingsTabs.map(([id, label]) => ({ id, label, content: panels[id] }))} />
  </>;
}

export function Settings({ state, update, notify, menus }: SettingsProps & { menus: { id: string; label: string }[] }) {
  const props = { state, update, notify };
  return <SettingsLayout description="调整菜单、连接参数、账号和通知的演示配置。" panels={{
      menus: <SettingsForm {...props} title="菜单管理" description="选择侧边栏显示的模块。" fields={menus.map(item => ({ key: `menu.${item.id}`, label: item.label, kind: 'switch', initial: true }))} />,
      basic: <SettingsForm {...props} title="基础配置" description="配置 Emby、TMDB、115、音乐和漫文书库的示例连接。" fields={basic} />,
      organize: <Workflow {...props} id="organize" />,
      strm: <Workflow {...props} id="strm" />,
      scraping: <Workflow {...props} id="scraping" />,
      rules: <SettingsForm {...props} title="搜索规则" fields={rules} />,
      search: <WorkspaceTabs label="资源搜索设置" items={searchTabs.map(([id, label, fields]) => ({ id, label, content: <SettingsForm {...props} title={label} fields={fields} /> }))} />,
      account: <SettingsForm {...props} title="账号与安全" description="这些字段只影响本地预览。" fields={[
        { key: 'account.name', label: '显示名称', initial: '演示用户' },
        { key: 'account.user', label: '演示账号', initial: 'demo' },
        { key: 'account.password', label: '示例密码', kind: 'secret' },
      ]} />,
      keys: <Keys {...props} />,
      notifications: <SettingsForm {...props} title="通知与机器人" description="保存 Telegram 与 Webhook 的示例参数。" fields={notificationFields} />,
  }} />;
}
