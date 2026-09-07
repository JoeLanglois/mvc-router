# mvc-router

A tiny browser router for MVC-style applications.

It maps URLs to controllers, renders the controller's DOM into a target, and gets out of the way.

There is no component framework, state store, view abstraction, dependency injection system, or special link component.

## Basic use

```ts
import { createRouter } from "@jdlanglois/mvc-router"

const router = createRouter({
  target: document.querySelector("#app")!,
  routes: [
    {
      path: "/",
      controller: () => Home()
    },
    {
      path: "/companies",
      controller: () => Companies()
    },
    {
      path: "/companies/:id",
      controller: ({ params }) => Company(params.id)
    }
  ]
})

router.start()
```

A controller can return any real DOM `Node`, including DOM created with UIBuilder:

```tsx
{
  path: "/companies/:id",
  controller: ({ params }) => (
    <main>
      <h1>Company {params.id}</h1>
    </main>
  )
}
```

## Regular links

Navigation uses ordinary HTML links:

```html
<a href="/">Home</a>
<a href="/companies">Companies</a>
<a href="/settings">Settings</a>
```

No `appnav` class, custom element, link component, or `onclick` handler is needed.

The router intercepts unmodified left-clicks on same-origin links. External links, downloads, links with another `target`, modified clicks, and hash-only navigation retain normal browser behavior.

This means links remain links: open-in-new-tab works, copying the URL works, and the application still has meaningful HTML.

## Controller styles

mvc-router intentionally accepts several controller styles. Use whichever has the least ceremony for the screen.

### Function returning DOM

For simple screens:

```ts
const About = () => {
  const main = document.createElement("main")
  main.textContent = "About"
  return main
}
```

### Closure controller

Use a closure when a screen needs private state or cleanup:

```ts
const Company = ({ params }) => {
  const abort = new AbortController()

  function save() {
    // ...
  }

  return {
    view() {
      return (
        <main>
          <h1>Company {params.id}</h1>
          <button onclick={save}>Save</button>
        </main>
      )
    },

    destroy() {
      abort.abort()
    }
  }
}
```

### Plain object

A Mithril-style object is useful when no per-route instance state is needed:

```ts
const Settings = {
  view(context) {
    return <main>Settings</main>
  }
}
```

### Class

Classes work when they are the natural shape for a larger controller:

```ts
class CompanyController {
  constructor(context) {
    this.id = context.params.id
  }

  view() {
    return <Company id={this.id} />
  }

  destroy() {
    // optional cleanup
  }
}
```

The router normalizes all four forms to the same tiny lifecycle:

```ts
view()
destroy?()
```

## Route context

Controllers receive:

```ts
{
  path,
  params,
  query,
  navigate
}
```

For:

```
/companies/42?tab=people
```

and:

```ts
{ path: "/companies/:id", controller: Company }
```

the controller receives:

```ts
params.id === "42"
query.get("tab") === "people"
```

## Programmatic navigation

Use regular links whenever navigation is actually a link.

For navigation caused by application logic:

```ts
await context.navigate("/companies/42")
```

or:

```ts
await context.navigate("/login", { replace: true })
```

The latter uses `history.replaceState`.

## Layouts

Layouts belong to your application, not the router.

For example, a logged-in controller can wrap every logged-in screen:

```tsx
function LoggedIn(screen) {
  return (
    <div class="app">
      <Sidebar />
      <main>{screen}</main>
    </div>
  )
}

const routes = [
  {
    path: "/login",
    controller: () => <Login />
  },
  {
    path: "/companies",
    controller: () => LoggedIn(<Companies />)
  },
  {
    path: "/projects",
    controller: () => LoggedIn(<Projects />)
  }
]
```

Or make `LoggedInController` a shared base/helper if its sidebar has substantial behavior. mvc-router does not impose a nested layout abstraction.

## Lifecycle

When navigation changes controllers:

1. the previous controller's optional `destroy()` runs;
2. the new controller is created;
3. its `view()` is called;
4. the target's contents are replaced with the returned DOM.

If a screen has nothing to clean up, it needs no lifecycle code at all.

## API

```ts
createRouter(options)

router.start()
router.stop()
router.navigate(path, options?)
router.show()

matchPath(pattern, pathname)
```

That's the whole router.
