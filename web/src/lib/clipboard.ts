// The Clipboard API requires HTTPS. Local NAS deployments also use plain HTTP.
export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const input = document.createElement("textarea")
  input.value = value
  input.readOnly = true
  input.style.cssText = "position:fixed;left:-9999px;top:0"
  const container = active?.closest('[role="dialog"]') ?? document.body
  container.append(input)
  try {
    input.select()
    if (!document.execCommand("copy")) throw new Error("复制失败")
  } finally {
    input.remove()
    active?.focus({ preventScroll: true })
  }
}
