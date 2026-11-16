export type SettingValue = string | boolean | number | string[];

export type SettingsSection =
  "tmdb" | "emby" | "115" | "organize" | "search" | "pansou" | "notifications" | "subsonic" | "menus";

export type SettingsResponse = {
  values: Record<string, SettingValue>;
  configuredSecrets: string[];
  maskedSecrets?: Record<string, string>;
};
