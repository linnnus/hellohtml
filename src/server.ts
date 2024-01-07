/// <reference lib="deno.unstable" />

import { Hono } from "https://deno.land/x/hono@v3.11.12/mod.ts";
import { getCookie, setCookie } from "https://deno.land/x/hono@v3.11.12/helper/cookie/index.ts";
import { serveStatic } from 'https://deno.land/x/hono@v3.11.12/middleware.ts'
import { render, configure } from "https://esm.sh/nunjucks@3.2.4";
import { relative } from "https://deno.land/std@0.181.0/path/mod.ts";
import { newProject, getProjectById, setProjectName, setProjectContent, watchProjectForChanges, getProjectsByUserId } from "./model.ts";
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
declare module "https://deno.land/x/hono@v3.11.12/mod.ts" {
	interface ContextRenderer {
		(view: string, props?: {
			layout?: string,
			[prop: string]: unknown,
		}): Promise<Response>
	}
}
configure(viewPath, {
	autoescape: true,
	throwOnUndefined: true,
	trimBlocks: true,
	lstripBlocks: true,
});
app.use("*", async (c, next) => {
	c.setRenderer(async (name, props) => {
		const content = await render(name + ".njk", {
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

app.get("/project/:id/view.html", async c => {
	const projectId = c.req.param("id");
	const project = await getProjectById(projectId);
	return c.html(project.content);
});

app.patch("/project/:id/set-name", async c => {
	const projectId = c.req.param("id");
	const newName = await c.req.text();
	await setProjectName(projectId, newName);
	return new Response(null, { status: 204 });
});

app.patch("/project/:id/set-content", async c => {
	const projectId = c.req.param("id");
	const newContent = await c.req.text();
	await setProjectContent(projectId, newContent);
	return new Response(null, { status: 204 });
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
