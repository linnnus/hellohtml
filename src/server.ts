/// <reference lib="deno.unstable" />

import { Hono } from "$hono";
import { serveStatic } from "$hono/middleware.ts";
import { getCookie, setCookie } from "$hono/helper/cookie/index.ts";
import nunjucks from "$nunjucks";
import { relative } from "$std/path/mod.ts";
import { newProject, getProjectById, setProjectName, setProjectContent, watchProjectForChanges, getProjectsByUserId, deleteProject } from "./model.ts";
import { viewPath, staticPath, port } from "./config.ts";

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

app.use("/", c => {
	return c.render("index");
});

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
		setCookie(c, COOKIE_NAME, userId, {
			secure: true,
			sameSite: "Strict",
		});
	}
	c.set("userId", userId);

	await next();
});

app.post("/project/new", async c => {
	const userId = c.get("userId");
	const project = await newProject(userId);
	return c.redirect(`/project/${project.id}/edit.html`, 302);
});

app.get("/project/:id/edit.html", async c => {
	const projectId = c.req.param("id");
	const project = await getProjectById(projectId);
	const userId = c.get("userId");
	return c.render("edit", {
		project,
		userId,
		title: project.name,
		readonly: project.ownerId != userId,
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

app.get("/project/:id/event-stream", c => {
	return c.stream(async (controller) => {
		await controller.writeln("retry: 1000\n\n");

		const projectId = c.req.param("id");
		for await (const project of watchProjectForChanges(projectId)) {
			controller.writeln(`data: ${JSON.stringify(project)}\n\n`);
		}
	}, 200, {
		"Content-Type": "text/event-stream",
		"Transfer-Encoding": "chunked",
		"x-Content-Type-Options": "nosniff",
		"x-accel-buffering": "no",
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
