# mvc-router

A tiny controller-lifecycle router for browser applications.

mvc-router does four things:

1. matches the current URL;
2. creates the matching controller with your app object, using either a class or a closure factory;
3. gives that route its own `AbortSignal`;
4. calls the controller's async `load(route)` method.

It does **not** render, replace DOM, manage state, define views, or own application layout.

## Basic use

```ts
import { createRouter } from "@jdlanglois/mvc-router"

const app = {
  api: createApi(),
  root: document.querySelector("#app")
}

class CompaniesController {
  constructor(app) {
    this.app = app
  }

  async load({ signal }) {
    const companies = await this.app.api.companies.list({ signal })

    this.app.root.replaceChildren(
      CompaniesView(companies)
    )
  }
}

const router = createRouter({
  app,
  routes: [
    { path: "/companies", controller: CompaniesController }
  ]
})

router.start()
```

The router never calls `replaceChildren()`. The controller decides whether to render, where to render, and whether an update should replace a whole screen or one small subtree.

## App as composition root

The app object owns things that live longer than a route:

```ts
const app = {
  api: createApi(),
  socket: createSocket("/ws"),
  bus: new EventTarget(),
  companies: createCompaniesService(),
  projects: createProjectsService(),
  root: document.querySelector("#app")
}

app.router = createRouter({
  app,
  routes
})

app.router.start()
```

Class controllers receive the app object in their constructor:

```ts
class ProjectController {
  constructor(app) {
    this.app = app
  }

  async load(route) {
    const project = await this.app.projects.get(
      route.params.id,
      { signal: route.signal }
    )

    this.app.root.replaceChildren(
      ProjectView(project)
    )
  }
}
```

There is no dependency-injection container. The app object is just the application's composition root.

## Controller styles

A controller has one required method:

```ts
class Controller {
  constructor(app) {
    this.app = app
  }

  async load(route) {
    // initialize the route
  }
}
```

In TypeScript:

```ts
type Controller = {
  load(route: RouteContext): void | Promise<void>
}
```

The class form is useful when a screen naturally wants instance methods and fields.

Closure controllers are equally supported. The factory receives the same app object and returns an object with `load(route)`:

```ts
const ProjectController = app => {
  let project

  return {
    async load({ params, signal }) {
      project = await app.projects.get(
        params.id,
        { signal }
      )

      app.root.replaceChildren(
        ProjectView(project)
      )
    }
  }
}
```

This gives you the same lifecycle without requiring a class.

There is deliberately no `view()` or `destroy()` contract.

The controller owns rendering. The route's `AbortSignal` owns cleanup.

## Route context

`load()` receives:

```ts
{
  path,
  params,
  query,
  signal
}
```

For:

```
/companies/42?tab=people
```

with:

```ts
{ path: "/companies/:id", controller: CompanyController }
```

you get:

```ts
async load({ params, query, signal }) {
  params.id === "42"
  query.get("tab") === "people"
  signal.aborted === false
}
```

## Route lifetime

Every route gets a fresh `AbortSignal`.

Before loading the next route, mvc-router aborts the previous one:

```text
new CompanyController(app)
        ↓
await controller.load(route)
        ↓
      active
        ↓
   navigation
        ↓
route.signal aborts
        ↓
new ProjectsController(app)
        ↓
await controller.load(route)
```

That plugs directly into browser APIs.

### Events

```ts
async load({ signal }) {
  document.addEventListener(
    "keydown",
    this.onKeyDown,
    { signal }
  )
}
```

### Fetch

```ts
async load({ params, signal }) {
  const response = await fetch(
    `/api/companies/${params.id}`,
    { signal }
  )
}
```

### EventTarget services

```ts
async load({ signal }) {
  this.app.bus.addEventListener(
    "company.changed",
    this.onCompanyChanged,
    { signal }
  )
}
```

### APIs without AbortSignal support

Bridge them once:

```ts
async load({ signal }) {
  const unsubscribe = this.app.store.subscribe(this.update)

  signal.addEventListener("abort", unsubscribe, { once: true })
}
```

Likewise for intervals:

```ts
const interval = setInterval(refresh, 5000)

signal.addEventListener(
  "abort",
  () => clearInterval(interval),
  { once: true }
)
```

## Rendering

Rendering is entirely application code.

A controller may replace a complete screen:

```ts
this.app.root.replaceChildren(
  CompaniesView(companies)
)
```

update one region:

```ts
document
  .querySelector("#sidebar")
  ?.replaceChildren(SidebarView(projects))
```

or not render anything:

```ts
class LogoutController {
  constructor(app) {
    this.app = app
  }

  async load() {
    await this.app.auth.logout()
    await this.app.router.navigate("/login", { replace: true })
  }
}
```

mvc-router does not care.

## Regular links

Use normal links:

```html
<a href="/">Home</a>
<a href="/companies">Companies</a>
<a href="/settings">Settings</a>
```

There is no `appnav` class, link component, custom element, or special click handler.

mvc-router intercepts ordinary unmodified left-clicks on same-origin links. External links, downloads, modified clicks, links with another target, and hash-only navigation retain normal browser behavior.

## Programmatic navigation

The router exposes:

```ts
await app.router.navigate("/companies/42")
```

and:

```ts
await app.router.navigate("/login", {
  replace: true
})
```

Use ordinary links when the action is semantically navigation. Use `navigate()` for navigation caused by application logic.

## Not found

A not-found controller follows the exact same lifecycle:

```ts
class NotFoundController {
  constructor(app) {
    this.app = app
  }

  load({ path }) {
    this.app.root.replaceChildren(
      NotFoundView(path)
    )
  }
}

createRouter({
  app,
  routes,
  notFound: NotFoundController
})
```

## API

```ts
createRouter({
  app,
  routes,
  notFound?
})

router.start()
router.stop()
router.navigate(path, options?)
router.load()

matchPath(pattern, pathname)
```

The intended architecture is small:

```text
App
  long-lived services

Router
  URL → controller
  route lifetime

Controller
  load data
  handle events
  decide when/how to render

UIBuilder (optional)
  create DOM
```
