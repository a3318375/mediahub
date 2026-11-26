import filmStill from "@/assets/man-with-a-movie-camera.jpg"
import { LoginForm } from "@/components/login-form"
import { MediaBrand } from "@/components/media-brand"
import { ThemeToggle } from "@/layouts/media-shell/theme-toggle"
import type { AuthUser } from "@/lib/auth-api"
import "./login.css"

export function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  return (
    <main className="login-page">
      <div className="login-panel">
        <header className="login-bar">
          <MediaBrand />
          <ThemeToggle />
        </header>
        <div className="login-body"><LoginForm onLogin={onLogin} /></div>
      </div>
      <div className="login-film">
        <figure>
          <img src={filmStill} loading="lazy" decoding="async" width="640" height="480"
            alt="摄影师在巨大的电影摄影机上架起了三脚架" />
          <figcaption>
            <cite>持摄影机的人</cite>
            <span>吉加·维尔托夫 <span aria-hidden="true">·</span> <time dateTime="1929">1929</time></span>
          </figcaption>
        </figure>
      </div>
    </main>
  )
}
