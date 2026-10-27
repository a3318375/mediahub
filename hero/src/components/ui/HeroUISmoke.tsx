import { useState } from "react";
import { Button, toast } from "@heroui/react";

/** Opt-in visual check using the documented HeroUI Button API. */
export function HeroUISmoke() {
  const [pressed, setPressed] = useState(false);
  return <section aria-label="HeroUI smoke test" className="flex flex-wrap items-center gap-4 border-b p-4">
    <Button onPress={() => { setPressed(true); toast("HeroUI 组件交互正常"); }}>HeroUI 样式验证</Button>
    <span role="status">{pressed ? "按钮交互正常" : "点击按钮验证交互"}</span>
  </section>;
}
