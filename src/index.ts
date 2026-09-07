export type Params = Record<string, string>

export type RouteContext = {
  path: string
  params: Params
  query: URLSearchParams
  navigate: (to: string, options?: NavigateOptions) => Promise<void>
}

export type Controller = {
  view: () => Node
  destroy?: () => void
}

export type ControllerObject = {
  view: (context: RouteContext) => Node
  destroy?: () => void
}

export type ControllerClass = new (context: RouteContext) => Controller

export type ControllerFactory =
  | ControllerObject
  | ControllerClass
  | ((context: RouteContext) => Node | Controller)

export type Route = {
  path: string
  controller: ControllerFactory
}

export type NavigateOptions = {
  replace?: boolean
}

export type RouterOptions = {
  target: Element
  routes: Route[]
  notFound?: ControllerFactory
}

type Match = {
  route: Route
  params: Params
}

export function createRouter(options: RouterOptions) {
  const { target, routes, notFound } = options
  let current: Controller | undefined
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

    await show(url)
  }

  const show = async (url = new URL(location.href)): Promise<void> => {
    const match = findRoute(routes, url.pathname)

    current?.destroy?.()

    const context: RouteContext = {
      path: url.pathname,
      params: match?.params ?? {},
      query: url.searchParams,
      navigate
    }

    const factory = match?.route.controller ?? notFound

    if (!factory) {
      current = undefined
      target.replaceChildren()
      return
    }

    current = makeController(factory, context)
    target.replaceChildren(current.view())
  }

  const onPopState = () => {
    void show()
  }

  const onClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
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
      anchor.target && anchor.target !== "_self" ||
      anchor.hasAttribute("download")
    ) {
      return
    }

    const url = new URL(anchor.href, location.href)

    if (
      url.origin !== location.origin ||
      url.pathname === location.pathname &&
      url.search === location.search &&
      url.hash !== location.hash
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

    await show()
  }

  const stop = (): void => {
    if (!started) return
    started = false

    removeEventListener("popstate", onPopState)
    document.removeEventListener("click", onClick)

    current?.destroy?.()
    current = undefined
  }

  return { start, stop, navigate, show }
}

function makeController(
  factory: ControllerFactory,
  context: RouteContext
): Controller {
  if (isClass(factory)) {
    return new factory(context)
  }

  if (typeof factory === "function") {
    const result = factory(context)

    if (result instanceof Node) {
      return { view: () => result }
    }

    return result
  }

  return {
    view: () => factory.view(context),
    destroy: factory.destroy?.bind(factory)
  }
}

function isClass(factory: ControllerFactory): factory is ControllerClass {
  if (typeof factory !== "function") return false

  return /^class\s/.test(Function.prototype.toString.call(factory))
}

function findRoute(routes: Route[], pathname: string): Match | undefined {
  for (const route of routes) {
    const params = matchPath(route.path, pathname)
    if (params) return { route, params }
  }
}

export function matchPath(pattern: string, pathname: string): Params | undefined {
  const patternParts = parts(pattern)
  const pathParts = parts(pathname)

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

function parts(path: string): string[] {
  return path.split("/").filter(Boolean)
}
