import type { ReactNode } from "react";
import { ListBox, Select } from "@heroui/react";
import "./AppSelect.css";

type AppSelectProps = {
  label: string;
  value: string | number;
  options: readonly (readonly [string, string] | string[])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  icon?: ReactNode;
  variant?: "default" | "compact";
};

/** Shared single-choice control. Business values stay separate from collection keys. */
export function AppSelect({ label, value, options, onChange, disabled, icon, variant = "default" }: AppSelectProps) {
  const selected = options.findIndex(([id]) => id === String(value));
  return <Select aria-label={label} className={`app-select app-select--${variant}`} selectedKey={selected < 0 ? null : String(selected)} onSelectionChange={(key) => {
    if (key !== null && options[Number(key)]) onChange(options[Number(key)][0]);
  }} isDisabled={disabled}>
    <Select.Trigger>{icon}<Select.Value /><Select.Indicator /></Select.Trigger>
    <Select.Popover className="app-select-popover" placement="bottom end">
      <ListBox aria-label={label}>
        {options.map(([, text], index) => <ListBox.Item key={String(index)} id={String(index)} textValue={text}>{text}<ListBox.ItemIndicator /></ListBox.Item>)}
      </ListBox>
    </Select.Popover>
  </Select>;
}
