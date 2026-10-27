import { useEffect, useState } from "react";
import { Tabs } from "@heroui/react";
import { AppDisclosure } from "../../components/ui/AppControls";
import type { Download, Session } from "../../lib/media-service";
import { Downloads } from "../downloads/Downloads";
import { ProcessingOverview } from "./ProcessingOverview";
import { routePath } from "../../lib/parity";

const tabs = [
  ["downloads", "下载管理"],
  ["organize", "媒体整理"],
  ["strm", "STRM 生成"],
  ["scraping", "元数据刮削"],
] as const;

function currentTab() {
  const path = routePath(window.location.hash);
  if (path === "organize" || path === "tools/organize") return "organize";
  const tab = path.split("/")[1];
  return tabs.some(([id]) => id === tab) ? tab : "downloads";
}

export function MediaProcessing(props: {
  tasks: Download[];
  session: Session;
  update: (items: Download[]) => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState(currentTab);
  const [tasksOpen, setTasksOpen] = useState(false);
  useEffect(() => {
    const change = () => setTab(currentTab());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  return (
    <section className="management-stack processing-page">
      <Tabs selectedKey={tab} onSelectionChange={(key) => {
        setTab(String(key));
        window.location.hash = `/processing/${key}`;
      }}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="媒体处理功能">
            {tabs.map(([id, label]) => (
              <Tabs.Tab key={id} id={id}>
                {label}<Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="downloads">
          <ProcessingOverview session={props.session} mode="downloads" />
          <AppDisclosure className="processing-download-tasks" title="下载任务与异常处理" expanded={tasksOpen} onExpandedChange={setTasksOpen}>{tasksOpen && <Downloads {...props} />}</AppDisclosure>
        </Tabs.Panel>
        <Tabs.Panel id="organize"><ProcessingOverview session={props.session} mode="organize" /></Tabs.Panel>
        <Tabs.Panel id="strm"><ProcessingOverview session={props.session} mode="strm" /></Tabs.Panel>
        <Tabs.Panel id="scraping"><ProcessingOverview session={props.session} mode="scraping" /></Tabs.Panel>
      </Tabs>
    </section>
  );
}
