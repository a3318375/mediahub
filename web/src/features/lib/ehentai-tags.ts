const namespaces: Record<string, string> = {
  artist: "作者", group: "社团", language: "语言", parody: "原作", character: "角色",
  female: "女性标签", male: "男性标签", mixed: "混合标签", other: "其他", misc: "其他",
  cosplayer: "扮演者", reclass: "分类",
};

const languages: Record<string, string> = {
  chinese: "中文", japanese: "日文", english: "英文", korean: "韩文", french: "法文",
  german: "德文", spanish: "西班牙文", russian: "俄文", italian: "意大利文",
  portuguese: "葡萄牙文", thai: "泰文", vietnamese: "越南文", indonesian: "印尼文",
  translated: "已翻译", rewrite: "改写", "speechless": "无对白",
};
export function namespaceLabel(value: string): string { return namespaces[value] ?? value; }
export function tagLabel(namespace: string, value: string): string {
  return namespace === 'language' ? languages[value.toLowerCase()] ?? value : value;
}
export function languageLabel(value: string): string {
  return value.replace(/[a-z]+/gi, word => languages[word.toLowerCase()] ?? word);
}
export function searchTag(namespace: string, tag: string, language: string) {
  const normalized = tag.toLowerCase();
  if (namespace === 'language' && ['chinese', 'japanese', 'english'].includes(normalized)) {
    return { query: '', language: normalized };
  }
  const quoted = tag.replace(/[\\"]/g, character => '\\' + character);
  return { query: `${namespace}:"${quoted}$"`, language };
}
