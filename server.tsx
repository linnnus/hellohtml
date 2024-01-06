/** @jsx jsx */
/** @jsxFrag Fragment */

/// <reference lib="deno.unstable" />

import { Hono } from "https://deno.land/x/hono@v3.11.12/mod.ts";
import { jsx, Fragment, jsxRenderer, serveStatic, raw } from "https://deno.land/x/hono@v3.11.12/middleware.ts";
import { getCookie, setCookie } from "https://deno.land/x/hono@v3.11.12/helper/cookie/index.ts";
import { newProject, getProjectById, setProjectName, setProjectContent, watchProjectForChanges, getProjectsByUserId } from "./model.ts";

// Configuration (may optionally be specificed by command line).
const staticPath = Deno.env.get("HELLOHTML_STATIC_PATH") ?? "./static/";
const port = parseInt(Deno.env.get("HELLOHTML_PORT") ?? "8538");

const app = new Hono<{
	Variables: {
		userId: string,
	},
}>();

// As a first step, try serving the static files.
app.get("/*", serveStatic({ root: staticPath }));

app.use("*", jsxRenderer(({ children, extraHead = [] }) => {
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				{extraHead}
			</head>
			<body>{children}</body>
		</html>
	);
}));

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
	const body = <>
		<header>
			<input type="text" value={project.name} id="name" />
			{(project.ownerId != userId)
				? <span>Read-only mode</span>
				: <></>}
		</header>
		<textarea spellcheck={false} id="input">{project.content}</textarea>
		<iframe id="output" src={`/project/${project.id}/view.html`} allow="accelerometer; camera; encrypted-media; display-capture; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; web-share" allowfullscreen={true} allowpaymentrequest={true} allowtransparency={true} sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation allow-downloads allow-presentation" class="result-iframe iframe-visual-update" name="Output window" loading="lazy"></iframe>
	</>;
	return c.render(body, {
		extraHead: <>
			<title>{project.name}</title>
			<link rel="stylesheet" href="/edit.css" />
			{/* FIXME: bro BER om XSS */}
			<script>{raw(`window.helloHtmlProjectId = "${projectId}"`)}</script>
			<script async src="/edit.js" />
		</>,
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
	const body = <>
		<h1>your pwojects uwu....</h1>
		<p>here's a list of your projects and whatnot.</p>
		<ul>
			{projects.map(p => <li><a href={`/project/${p.id}/edit.html`}>{p.name}</a></li>)}
		</ul>
	</>;
	return c.render(body, {
		extraHead: <title>Your projects</title>,
	});
});

Deno.serve({ port }, app.fetch);
