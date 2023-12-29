import { HandlerContext, router } from "https://deno.land/x/rutt@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

interface Project {
  name: string;
  content: string;
}

const kv = await Deno.openKv();

function serveFile(path: string, init?: ResponseInit): () => Response {
  const contents = Deno.readFileSync(path);
  return () => new Response(contents, init);
}

// This endpoint creates a new project and redirects the client to the edit page.
const DEFAULT_CONTENT = Deno.readTextFileSync("default.html");
async function handleNew(): Promise<Response> {
  const newId = crypto.randomUUID();
  const project = {
    name: "my projecttt ^v^ uwu",
    content: DEFAULT_CONTENT,
  };
  await kv.set(["projects", newId], project);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": `/edit/${newId}`,
    },
  });
}

// This endpoint presents the client with a ui to interact with the given project.
// The client-side JavaScript is populated with some data in a rather hacky way...
const EDIT_HTML = Deno.readTextFileSync("edit.html");
async function handleEdit(
  _req: Request,
  _ctx: HandlerContext,
  { id }: Record<"id", string>,
): Promise<Response> {
  const { value: project } = await kv.get(["projects", id]);
  if (project === null) {
    return new Response(`project with id ${id} not found`, { status: 404 });
  }

  const pageContent = EDIT_HTML
    .replaceAll("{{ID}}", id)
    .replaceAll("{{name}}", project.name)
    .replaceAll("{{content}}", project.content);
  return new Response(pageContent, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}

// This endpoint returns an IFrame-embeddable HTML page for the given project.
async function handleView(
  _req: Request,
  _ctx: HandlerContext,
  { id }: Record<"id", string>,
): Promise<Response> {
  const { value: project } = await kv.get<Project>(["projects", id]);
  if (project === null) {
    return new Response(`Content for project with id ${id} not found`, {
      status: 404,
    });
  }

  return new Response(project.content, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}

// This endpoint is used by the client to update the project's source code.
async function handleUpdate(
  req: Request,
  _ctx: HandlerContext,
  { id }: Record<"id", string>,
): Promise<Response> {
  const { value: project } = await kv.get<Project>(["projects", id]);
  if (project === null) {
    return new Response(`Content for project with id ${id} not found`, {
      status: 404,
    });
  }

  // UNSAFE: Clients can store whatever they want.
  const newProject = await req.json() as Project;
  await kv.set(["projects", id], newProject);

  return new Response(null, { status: 204, statusText: "Updated database" });
}

// The client needs to be notified of changes so it can reload the view.
// This endpoint responds with a classic event stream, as values in the DB are updated.
function handleListen(
  _req: Request,
  _ctx: HandlerContext,
  { id }: Record<"id", string>,
): Response {
  const toValueEventStream = new TransformStream({
    start(controller) {
      controller.enqueue(`retry: 1000\n\n`);
    },
    transform(chunk, controller) {
      for (const { value } of chunk) {
        controller.enqueue(`data: ${JSON.stringify(value)}\n\n`);
      }
    },
  });
  const stream = kv.watch([["projects", id]])
    .pipeThrough(toValueEventStream)
    .pipeThrough(new TextEncoderStream());
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

const handler = router({
  // FIXME: NGINX or something should serve these files ngl.
  "/": serveFile("index.html"),
  "edit.js": serveFile("edit.js"),
  "/new": handleNew,
  "/edit/:id": handleEdit,
  "/view/:id": handleView,
  "/update/:id": handleUpdate,
  "/listen/:id": handleListen,
});

const port = 8080;
console.log(`HTTP server running. Access it at: http://0.0.0.0:${port}/`);
await serve(handler, { port });

// vi: ft=typescript et ts=2 sw=2
