import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouter, matchPath, type RouteContext } from "../src/index.js"

beforeEach(() => {
  history.replaceState(null, "", "/")
  document.body.replaceChildren()
})

describe("matchPath", () => {
  it("matches static routes", () => {
    expect(matchPath("/companies", "/companies")).toEqual({})
    expect(matchPath("/companies", "/projects")).toBeUndefined()
  })

  it("extracts route params", () => {
    expect(matchPath("/companies/:id", "/companies/42")).toEqual({ id: "42" })
  })

  it("decodes params", () => {
    expect(matchPath("/users/:name", "/users/Joe%20Langlois")).toEqual({
      name: "Joe Langlois"
    })
  })
})

describe("router", () => {
  it("injects the app into controllers", async () => {
    const app = { name: "test-app" }
    let injected: typeof app | undefined

    class HomeController {
      constructor(value: typeof app) {
        injected = value
      }

      load() {}
    }

    const router = createRouter({
      app,
      routes: [["/", HomeController]]
    })

    await router.start()

    expect(injected).toBe(app)
    router.stop()
  })

  it("supports closure controllers and passes the app to the factory", async () => {
    const app = { name: "test-app" }
    let injected: typeof app | undefined
    let loaded = false

    const HomeController = (value: typeof app) => {
      injected = value

      return {
        load() {
          loaded = true
        }
      }
    }

    const router = createRouter({
      app,
      routes: [["/", HomeController]]
    })

    await router.start()

    expect(injected).toBe(app)
    expect(loaded).toBe(true)

    router.stop()
  })

  it("calls load with route params and query", async () => {
    const app = {}
    let route: RouteContext | undefined

    class CompanyController {
      constructor(_app: typeof app) {}

      load(value: RouteContext) {
        route = value
      }
    }

    const router = createRouter({
      app,
      routes: [["/companies/:id", CompanyController]]
    })

    await router.start()
    await router.navigate("/companies/42?tab=people")

    expect(route?.path).toBe("/companies/42")
    expect(route?.params).toEqual({ id: "42" })
    expect(route?.query.get("tab")).toBe("people")

    router.stop()
  })

  it("awaits async load", async () => {
    const app = {}
    let loaded = false

    class CompaniesController {
      constructor(_app: typeof app) {}

      async load() {
        await Promise.resolve()
        loaded = true
      }
    }

    const router = createRouter({
      app,
      routes: [["/", CompaniesController]]
    })

    await router.start()

    expect(loaded).toBe(true)
    router.stop()
  })

  it("aborts the previous route before loading the next one", async () => {
    const app = {}
    let firstSignal: AbortSignal | undefined
    let wasAbortedWhenNextLoaded = false

    class HomeController {
      constructor(_app: typeof app) {}

      load({ signal }: RouteContext) {
        firstSignal = signal
      }
    }

    class CompaniesController {
      constructor(_app: typeof app) {}

      load() {
        wasAbortedWhenNextLoaded = firstSignal?.aborted ?? false
      }
    }

    const router = createRouter({
      app,
      routes: [
        ["/", HomeController],
        ["/companies", CompaniesController]
      ]
    })

    await router.start()
    expect(firstSignal?.aborted).toBe(false)

    await router.navigate("/companies")

    expect(firstSignal?.aborted).toBe(true)
    expect(wasAbortedWhenNextLoaded).toBe(true)

    router.stop()
  })

  it("aborts the active route when stopped", async () => {
    const app = {}
    let signal: AbortSignal | undefined

    class HomeController {
      constructor(_app: typeof app) {}

      load(route: RouteContext) {
        signal = route.signal
      }
    }

    const router = createRouter({
      app,
      routes: [["/", HomeController]]
    })

    await router.start()
    expect(signal?.aborted).toBe(false)

    router.stop()

    expect(signal?.aborted).toBe(true)
  })

  it("uses a not-found controller", async () => {
    const app = {}
    const load = vi.fn()

    class NotFoundController {
      constructor(_app: typeof app) {}

      load(route: RouteContext) {
        load(route.path)
      }
    }

    const router = createRouter({
      app,
      routes: [],
      notFound: NotFoundController
    })

    await router.start()

    expect(load).toHaveBeenCalledWith("/")
    router.stop()
  })

  it("intercepts ordinary same-origin links", async () => {
    const app = {}
    const loaded = vi.fn()

    class HomeController {
      constructor(_app: typeof app) {}
      load() {}
    }

    class CompaniesController {
      constructor(_app: typeof app) {}
      load() {
        loaded()
      }
    }

    const link = document.createElement("a")
    link.href = "/companies"
    link.textContent = "Companies"
    document.body.append(link)

    const router = createRouter({
      app,
      routes: [
        ["/", HomeController],
        ["/companies", CompaniesController]
      ]
    })

    await router.start()

    link.click()
    await Promise.resolve()

    expect(location.pathname).toBe("/companies")
    expect(loaded).toHaveBeenCalledOnce()

    router.stop()
  })

  it("does not intercept modified clicks", async () => {
    const app = {}

    class HomeController {
      constructor(_app: typeof app) {}
      load() {}
    }

    const link = document.createElement("a")
    link.href = "/companies"
    document.body.append(link)

    const router = createRouter({
      app,
      routes: [["/", HomeController]]
    })

    await router.start()

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true
    })

    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    router.stop()
  })

  it("does not touch the DOM", async () => {
    const app = {}
    const existing = document.createElement("main")
    existing.textContent = "owned by controller"
    document.body.append(existing)

    class HomeController {
      constructor(_app: typeof app) {}
      load() {}
    }

    const router = createRouter({
      app,
      routes: [["/", HomeController]]
    })

    await router.start()

    expect(document.body.contains(existing)).toBe(true)
    expect(existing.textContent).toBe("owned by controller")

    router.stop()
  })
})
