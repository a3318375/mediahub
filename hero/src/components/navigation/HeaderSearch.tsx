import { useState } from "react";
import { ComboBox, Input, ListBox } from "@heroui/react";
import { navigationItems } from "../../lib/parity";

export function HeaderSearch({ navigate }: { navigate: (page: string) => void }) {
  const [query, setQuery] = useState("");
  const results = navigationItems.filter(([, label, section]) => `${label} ${section}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <ComboBox aria-label="搜索菜单" className="header-menu-search" menuTrigger="input" inputValue={query}
    onInputChange={setQuery}
    onSelectionChange={(key) => { if (key !== null) { const page = String(key); setQuery(navigationItems.find(([id]) => id === page)?.[1] || ""); navigate(page); } }} allowsCustomValue>
    <ComboBox.InputGroup><Input aria-label="搜索菜单" placeholder="搜索菜单…" /><ComboBox.Trigger aria-label="显示菜单建议" /></ComboBox.InputGroup>
    <ComboBox.Popover><ListBox aria-label="菜单搜索结果" renderEmptyState={() => "没有找到匹配的菜单"}>
      {results.map(([page, label, section]) => <ListBox.Item key={page} id={page} textValue={label}><span>{label}</span><small>{section}</small></ListBox.Item>)}
    </ListBox></ComboBox.Popover>
  </ComboBox>;
}
