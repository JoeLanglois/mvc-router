export type Params = Record<string, string>

export type RouteContext = {
  path: string
  params: Params
  query: URLSearchParams
  signal: AbortSignal
}

export type Controller = {
  load(route: RouteContext): void | Promise<void>
}

export type ControllerClass<App> = new (app: App) => Controller
export type ControllerFactory<App> = (app: App) => Controller
export type ControllerDefinition<App> =
  | ControllerClass<App>
  | ControllerFactory<App>

export type Route<App> = readonly [
  path: string,
  controller: ControllerDefinition<App>
]

export type NavigateOptions = {
  replace?: boolean
}

export type RouterOptions<App> = {
  app: App
  routes: readonly Route<App>[]
  notFound?: ControllerDefinition<App>
}

export function createRouter<App>(options: RouterOptions<App>) {
  const { app, routes, notFound } = options
  let lifetime: AbortController | undefined
  let started = false

  const navigate = async (
    to: string,
    options: NavigateOptions = {}
  ): Promise<void> => {
    const url = new URL(to, location.href)

    if (url.origin !== location.origin) {
      location.href = url.href
      return
    }

    if (options.replace) {
      history.replaceState(null, "", url)
    } else {
      history.pushState(null, "", url)
    }

    await load(url)
  }

  const load = async (url = new URL(location.href)): Promise<void> => {
    lifetime?.abort()

    let definition = notFound
    let params: Params = {}

    for (const [pattern, controller] of routes) {
      const match = matchPath(pattern, url.pathname)

      if (match) {
        definition = controller
        params = match
        break
      }
    }

    if (!definition) {
      lifetime = undefined
      return
    }

    const abort = lifetime = new AbortController()
    const controller = definition.prototype?.load
      ? new (definition as ControllerClass<App>)(app)
      : (definition as ControllerFactory<App>)(app)

    await controller.load({
      path: url.pathname,
      params,
      query: url.searchParams,
      signal: abort.signal
    })
  }

  const onPopState = () => {
    void load()
  }

  const onClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    const element = event.target
    if (!(element instanceof Element)) return

    const anchor = element.closest("a")
    if (!(anchor instanceof HTMLAnchorElement)) return

    if (
      (anchor.target && anchor.target !== "_self") ||
      anchor.hasAttribute("download")
    ) {
      return
    }

    const url = new URL(anchor.href, location.href)

    if (
      url.origin !== location.origin ||
      (
        url.pathname === location.pathname &&
        url.search === location.search &&
        url.hash !== location.hash
      )
    ) {
      return
    }

    event.preventDefault()
    void navigate(url.href)
  }

  const start = async (): Promise<void> => {
    if (started) return
    started = true

    addEventListener("popstate", onPopState)
    document.addEventListener("click", onClick)

    await load()
  }

  const stop = (): void => {
    if (!started) return
    started = false

    removeEventListener("popstate", onPopState)
    document.removeEventListener("click", onClick)

    lifetime?.abort()
    lifetime = undefined
  }

  return { start, stop, navigate, load }
}

export function matchPath(pattern: string, pathname: string): Params | undefined {
  const patternParts = pattern.split("/").filter(Boolean)
  const pathParts = pathname.split("/").filter(Boolean)

  if (patternParts.length !== pathParts.length) return

  const params: Params = {}

  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]
    const actual = pathParts[i]

    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual)
      continue
    }

    if (expected !== actual) return
  }

  return params
}

