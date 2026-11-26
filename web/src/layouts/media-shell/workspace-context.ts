import { createContext, useContext } from "react"
import type { Media } from "@/features/model"
import type { SettingValue } from "@/lib/settings-api"
type WorkspaceTools = {
  menus: Record<string, SettingValue>
  favorites: Media[]
  openWork: (item: Media) => void
  activity: string[]
}
export const WorkspaceContext = createContext<WorkspaceTools>({
  menus: {},
  favorites: [],
  openWork: () => {},
  activity: [],
})
export const useWorkspace = () => useContext(WorkspaceContext)
