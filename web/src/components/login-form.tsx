import { useEffect, useState } from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSetupStatus, login, setup } from "@/lib/auth-api"
import type { AuthUser } from "@/lib/auth-api"

export function LoginForm({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [isCheckingSetup, setIsCheckingSetup] = useState(true)

  useEffect(() => {
    getSetupStatus()
      .then(({ setupRequired: required }) => setSetupRequired(required))
      .catch((error) => setError(error instanceof Error ? error.message : "无法连接服务端"))
      .finally(() => setIsCheckingSetup(false))
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const account = String(formData.get("account") ?? "")
    const password = String(formData.get("password") ?? "")
    const confirmPassword = String(formData.get("confirmPassword") ?? "")

    if (setupRequired && password !== confirmPassword) {
      setError("两次输入的密码不一致")
      setIsSubmitting(false)
      return
    }

    try {
      if (setupRequired) {
        onLogin(await setup(account, password))
      } else {
        onLogin(await login(account, password))
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "登录失败。"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} aria-labelledby="login-title">
      <header>
        <h1 id="login-title">{setupRequired ? "创建管理员账号" : "登录媒体中心"}</h1>
        {setupRequired && <p>首次使用，此账号将用于管理媒体中心。</p>}
      </header>
      <div className="login-field">
        <label htmlFor="account">账号</label>
        <Input id="account" name="account" autoComplete="username" required
          placeholder={setupRequired ? "设置登录账号（3 位以上）" : "输入账号"} />
      </div>
      <div className="login-field">
        <label htmlFor="password">密码</label>
        <div className="login-password">
          <Input id="password" name="password" type={showPassword ? "text" : "password"} required
            autoComplete={setupRequired ? "new-password" : "current-password"}
            placeholder={setupRequired ? "设置登录密码" : "输入密码"} />
          <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      {setupRequired && <div className="login-field">
        <label htmlFor="confirmPassword">确认密码</label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
          placeholder="再次输入密码" required />
      </div>}
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" size="lg" className="login-submit" disabled={isSubmitting || isCheckingSetup}>
        {isSubmitting ? "正在处理…" : isCheckingSetup ? "连接服务端…" : setupRequired ? "创建账号并登录" : "登录"}
        {(isSubmitting || isCheckingSetup) && <LoaderCircle aria-hidden="true" className="animate-spin" />}
      </Button>
    </form>
  )
}
