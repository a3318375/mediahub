import type { ReactNode } from "react";
import { Button, Disclosure, ProgressBar, Slider } from "@heroui/react";

export function AppDisclosure({ title, children, className, expanded, onExpandedChange }: {
  title: ReactNode; children: ReactNode; className?: string; expanded?: boolean; onExpandedChange?: (open: boolean) => void;
}) {
  return <Disclosure className={className} isExpanded={expanded} onExpandedChange={onExpandedChange}>
    <Disclosure.Heading><Button slot="trigger" variant="ghost" className="app-disclosure-trigger">{title}<Disclosure.Indicator /></Button></Disclosure.Heading>
    <Disclosure.Content><Disclosure.Body>{children}</Disclosure.Body></Disclosure.Content>
  </Disclosure>;
}

export function AppProgress({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return <ProgressBar aria-label={label} value={value} maxValue={max} size="sm" className="app-progress"><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>;
}

export function AppSlider({ label, value, max = 100, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <Slider aria-label={label} value={value} minValue={0} maxValue={max} onChange={(next) => onChange(Array.isArray(next) ? next[0] : next)} className="app-slider"><Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track></Slider>;
}
