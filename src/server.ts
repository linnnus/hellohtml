/// <reference lib="deno.unstable" />

import { Hono } from "$hono";
import { serveStatic } from "$hono/middleware.ts";
import { getCookie, setCookie } from "$hono/helper/cookie/index.ts";
import { logger } from "$hono/middleware.ts";
import nunjucks from "$nunjucks";
import { relative } from "$std/path/mod.ts";
import { mergeReadableStreams } from /*"./util.ts"*/"$std/streams/merge_readable_streams.ts";
import { newProject, getProjectById, setProjectName, setProjectContent, watchProjectForChanges, getProjectsByUserId, deleteProject, cloneProject } from "./model.ts";
import { viewPath, staticPath, port, debug, altDomain } from "./config.ts";

const app = new Hono<{
	Variables: {
		userId: string,
	},
}>();

// Views are stored in `./views/`. They are Nunjuck templates which need to be
// populated with data before they are rendered to HTML.
//
// Hono has support for custom renderers but it is slightly cumbersome. First,
// we must declare the type of arguments supported by our renderer. The way to
// do this is rather obscure, so I just copied what [0] was doing.
//
// Then we configure Nunjucks [1] to look in the correct repository.
//
// For each request we then set define a renderer which basically just passes
// it's arguments directly to Nunjucks, while setting a few default properties.
//
// [0]: https://github.com/honojs/middleware/blob/0d7244b5bbcc0b628f5fe9f032c9542b74531b7d/packages/react-renderer/src/index.ts#L5-L9
// [1]: https://mozilla.github.io/nunjucks
declare module "$hono" {
	interface ContextRenderer {
		(view: string, props?: {
			layout?: string,
			[prop: string]: unknown,
		}): Response | Promise<Response>
	}
}
nunjucks.configure(viewPath, {
	autoescape: true,
	throwOnUndefined: true,
	trimBlocks: true,
	lstripBlocks: true,
});
app.use("*", async (c, next) => {
	c.setRenderer((name, props) => {
		const content = nunjucks.render(name + ".njk", {
			title: "HelloHTML",
			...props,
			layout: (props?.layout ?? "layout") + ".njk",
		});
		return c.html(content);
	});
	await next();
});

app.use(logger());

// Users are identified by a userId which acts sort of like an API token. That
// is, a combined identifier and permission. The security/ease-of-use tradeoff
// is essentially the same as to those of projects being editable if you know
// their Id.
//
// The Id is stored in a secure cookie. That means it becomes associated with a
// particular browser, though a savy user could transfer it to other devies.
app.use("*", async (c, next) => {
	const COOKIE_NAME = "helloHtmlSuperSecretToken";
	let userId = getCookie(c, COOKIE_NAME);
	if (userId === undefined) {
		userId = crypto.randomUUID();
	}
	c.set("userId", userId);

	// We set this cookie regardless of whether we found a user id to
	// re-enfource cookie so it doesn't expire.
	setCookie(c, COOKIE_NAME, userId, {
		secure: true,
		sameSite: "Lax", // We need the cookie to be sent on cross-site navigations.
		expires: new Date(Date.now() + 1000*60*60*24*365*10),
	});

	await next();
});

app.use("/", c => {
	return c.render("index");
});

app.post("/project/new", async c => {
	const userId = c.get("userId");
	const project = await newProject(userId);
	return c.redirect(`/project/${project.id}/edit.html`, 303);
});

app.get("/project/:id/edit.html", async c => {
	const projectId = c.req.param("id");
	const project = await getProjectById(projectId);
	const userId = c.get("userId");
	return c.render("edit", {
		project,
		userId,
		title: project.name,
		// Okay so here's the deal: we want the iframe to run on a separate thread. This makes the editor more
		// robust, as it means it won't soft-lock if you accidentally put an infinite loop in the code you're
		// working on.
		//
		// The temporary (and thoroughly shitty) solution that I've come up with is based on out of process
		// iframes [0]. This is a security thing that Chrome does where cross-site iframes are run in a separate
		// process. As a side effect, it also means that the two event loops can't fuck each other up.
		//
		// The key word in the above paragraph is "cross-site". I couldn't figure out a neater way to do this,
		// so I just bought another domain, which also points to this server. The lines below are figuring out
		// what this "other domain" should be. For development, I have figured out that "localhost" and
		// "127.0.0.1" are considered separate sites.
		//
		// [0]: https://www.chromium.org/developers/design-documents/oop-iframes/#current-uses
		location: debug ? `127.0.0.1:${port}` : altDomain,
		readonly: project.ownerId != userId,
	});
});

app.get("/project/:id/view.html", async c => {
	const projectId = c.req.param("id");
	const project = await getProjectById(projectId);
	return c.html(project.content, 200, {
		"Cache-Control": "no-cache",
	});
});

app.patch("/project/:id/name", async c => {
	const projectId = c.req.param("id");
	const newName = await c.req.text();
	const userId = c.get("userId");
	await setProjectName(projectId, newName, userId);
	return new Response(null, { status: 204, statusText: "Updated name" });
});

app.patch("/project/:id/content", async c => {
	const projectId = c.req.param("id");
	const newContent = await c.req.text();
	const userId = c.get("userId");
	await setProjectContent(projectId, newContent, userId);
	return new Response(null, { status: 204, statusText: "Updated content" });
});

app.get("/project/:id/content", async c => {
	const projectId = c.req.param("id");
	const project = await getProjectById(projectId);
	return c.html(project.content);
});

app.delete("/project/:id", async c => {
	const projectId = c.req.param("id");
	const userId = c.get("userId");
	await deleteProject(projectId, userId);
	return new Response(null, { status: 204, statusText: "Deleted post" });
});

app.on("COPY", "/project/:id", async c => {
	const projectId = c.req.param("id");
	const userId = c.get("userId");
	const newProject = await cloneProject(projectId, userId);
	await new Promise(resolve => setTimeout(resolve, 3000));
	// Note the use of the 303 'See other' status code;
	// we do not want the client to make a COPY request to …/edit.html!
	return c.redirect(`/project/${newProject.id}/edit.html`, 303);
});

app.get("/project/:id/event-stream", c => {
	const textEncoder = new TextEncoder();

	// Proxies and the like may kill connection, if it is not covered in a while.
	// See: https://community.cloudflare.com/t/are-server-sent-events-sse-supported-or-will-they-trigger-http-524-timeouts/499621/7
	// See: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#data-only_messages
	let intervalId: number;
	const keepAliveStream = new ReadableStream({
		start(controller) {
			intervalId = setInterval(() => {
				controller.enqueue(textEncoder.encode(`:keepalive\n\n`));
			}, 5 * 1000);
		},
		cancel() {
			clearInterval(intervalId);
		}
	});

	const projectId = c.req.param("id");
	const changeStream = watchProjectForChanges(projectId);
	const changeMessageStream = changeStream.pipeThrough(
		new TransformStream({
			start(controller) {
				controller.enqueue(textEncoder.encode(`retry: 2000\n\n`));
			},
			transform(chunk, controller) {
				controller.enqueue(textEncoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
			}
		}),
	);

	const body = mergeReadableStreams(keepAliveStream, changeMessageStream);

	return c.newResponse(body, 200, {
		"Content-Type": "text/event-stream",
		"Transfer-Encoding": "chunked",
		"X-Content-Type-Options": "nosniff",
		"X-Accel-Buffering": "no",
	});
});

app.get("/projects.html", async c => {
	const userId = c.get("userId");
	const projects = await getProjectsByUserId(userId);
	return c.render("projects", {
		title: "Projects",
		userId,
		projects,
	});
});

app.use("/static/*", serveStatic({
	root: relative(Deno.cwd(), staticPath),
	rewriteRequestPath: p => p.slice("/static/".length),
}));

Deno.serve({ port }, app.fetch);
