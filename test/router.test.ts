import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouter, matchPath } from "../src/index.js"

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
  it("renders the matching controller", async () => {
    const target = document.createElement("main")

    const router = createRouter({
      target,
      routes: [
        {
          path: "/",
          controller: () => document.createTextNode("home")
        },
        {
          path: "/companies",
          controller: () => document.createTextNode("companies")
        }
      ]
    })

    await router.start()
    expect(target.textContent).toBe("home")

    await router.navigate("/companies")
    expect(target.textContent).toBe("companies")

    router.stop()
  })

  it("passes params and query to controllers", async () => {
    const target = document.createElement("main")

    const router = createRouter({
      target,
      routes: [{
        path: "/companies/:id",
        controller: context =>
          document.createTextNode(
            context.params.id + ":" + context.query.get("tab")
          )
      }]
    })

    await router.start()
    await router.navigate("/companies/42?tab=people")

    expect(target.textContent).toBe("42:people")
    router.stop()
  })

  it("supports object controllers", async () => {
    const target = document.createElement("main")

    const controller = {
      view: ({ params }: { params: Record<string, string> }) =>
        document.createTextNode(params.id)
    }

    const router = createRouter({
      target,
      routes: [{ path: "/projects/:id", controller }]
    })

    await router.start()
    await router.navigate("/projects/abc")

    expect(target.textContent).toBe("abc")
    router.stop()
  })

  it("supports class controllers and destroys them on navigation", async () => {
    const target = document.createElement("main")
    const destroy = vi.fn()

    class Company {
      constructor(private context: { params: Record<string, string> }) {}

      view() {
        return document.createTextNode(this.context.params.id)
      }

      destroy() {
        destroy()
      }
    }

    const router = createRouter({
      target,
      routes: [
        { path: "/companies/:id", controller: Company },
        { path: "/", controller: () => document.createTextNode("home") }
      ]
    })

    await router.start()
    await router.navigate("/companies/42")
    expect(target.textContent).toBe("42")

    await router.navigate("/")
    expect(destroy).toHaveBeenCalledOnce()

    router.stop()
  })

  it("supports closure controllers with lifecycle", async () => {
    const target = document.createElement("main")
    const destroy = vi.fn()

    const controller = () => {
      const node = document.createElement("button")
      node.textContent = "save"

      return {
        view: () => node,
        destroy
      }
    }

    const router = createRouter({
      target,
      routes: [
        { path: "/", controller },
        { path: "/next", controller: () => document.createTextNode("next") }
      ]
    })

    await router.start()
    await router.navigate("/next")

    expect(destroy).toHaveBeenCalledOnce()
    router.stop()
  })

  it("uses a not-found controller", async () => {
    const target = document.createElement("main")

    const router = createRouter({
      target,
      routes: [],
      notFound: () => document.createTextNode("404")
    })

    await router.start()

    expect(target.textContent).toBe("404")
    router.stop()
  })

  it("intercepts ordinary same-origin links", async () => {
    const target = document.createElement("main")
    const link = document.createElement("a")
    link.href = "/companies"
    link.textContent = "Companies"
    document.body.append(link)

    const router = createRouter({
      target,
      routes: [
        { path: "/", controller: () => document.createTextNode("home") },
        {
          path: "/companies",
          controller: () => document.createTextNode("companies")
        }
      ]
    })

    await router.start()

    link.click()
    await Promise.resolve()

    expect(location.pathname).toBe("/companies")
    expect(target.textContent).toBe("companies")
    router.stop()
  })

  it("does not intercept modified clicks", async () => {
    const target = document.createElement("main")
    const link = document.createElement("a")
    link.href = "/companies"
    document.body.append(link)

    const router = createRouter({
      target,
      routes: [{ path: "/", controller: () => document.createTextNode("home") }]
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
})
