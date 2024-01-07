// Model part of the model-view-controller.
//
// For the database we use Deno's built in key-value store. I am not
// particularly fond of the API but using it means that this project works
// seamlessly on both Deno Deploy and my home-server.

import { HTTPException } from "https://deno.land/x/hono@v3.11.12/http-exception.ts";
import { dbPath } from "./config.ts";

const kv = await Deno.openKv(dbPath);

export interface Project {
	name: string,
	id: string,
	ownerId: string,
	content: string,
};

export async function newProject(ownerId: string): Promise<Project> {
	const project: Project = {
		name: "My new project",
		id: crypto.randomUUID(),
		ownerId: ownerId,
		content: `<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8">
		<style>
			p {
				color: blue;
			}
		</style>
		<script defer>
			console.log("hello!");
		</script>
	</head>
	<body>
		<p>Hello there!</p>
	</body>
</html>`,
	};

	const primaryKey = ["projectsById", project.id];
	const userKey = ["projectsByOwnerId", ownerId, project.id];
	const result = await kv.atomic()
		.check({ key: primaryKey, versionstamp: null })
		.check({ key: userKey, versionstamp: null })
		.set(primaryKey, project)
		.set(userKey, project)
		.commit();
	checkCommit(result);

	return project;
}

export async function getProjectById(projectId: string): Promise<Project> {
	const result = await kv.get<Project>(["projectsById", projectId]);
	checkResult(result);
	return result.value;
}

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
	const iter = kv.list<Project>({ prefix: ["projectsByOwnerId", userId] });
	const list = [];
	for await (const result of iter) {
		list.push(result.value);
	}
	return list;
}

// Maybe throws. This should be part of the type smh.
export async function setProjectName(projectId: string, newName: string) {
	const projectResult = await kv.get<Project>(["projectsById", projectId]);
	checkResult(projectResult);

	const project = projectResult.value;
	const newProject = { ...project, name: newName };

	const primaryKey = ["projectsById", project.id];
	const userKey = ["projectsByOwnerId", project.ownerId, project.id];
	const commitResult = await kv.atomic()
		.check({ key: primaryKey, versionstamp: projectResult.versionstamp }) // These keys are always updated together; this is fine.
		.set(primaryKey, newProject)
		.set(userKey, newProject)
		.commit();
	checkCommit(commitResult);
}

export async function setProjectContent(projectId: string, newContent: string) {
	const projectResult = await kv.get<Project>(["projectsById", projectId]);
	checkResult(projectResult);

	const project = projectResult.value;
	const newProject = { ...project, content: newContent };

	const primaryKey = ["projectsById", project.id];
	const userKey = ["projectsByOwnerId", project.ownerId, project.id];
	const commitResult = await kv.atomic()
		.check({ key: primaryKey, versionstamp: projectResult.versionstamp }) // These keys are always updated together; this is fine.
		.set(primaryKey, newProject)
		.set(userKey, newProject)
		.commit();
	checkCommit(commitResult);
}

export function watchProjectForChanges(projectId: string): ReadableStream<Project> {
	const key = ["projectsById", projectId];
	const resultStream = kv.watch<[Project]>([key]);
	const projectStream = resultStream.pipeThrough(new TransformStream({
		transform(chunk, controller) {
			for (const { value } of chunk) {
				controller.enqueue(value);
			}
		}
	}));
	return projectStream;
}

function checkResult(result: Deno.KvEntryMaybe<Project>): asserts result is Deno.KvEntry<Project> {
	if (result.versionstamp === null) {
		throw new HTTPException(404, { message: `Project with id '${result.key[1] as string}' not found` });
	}
}

function checkCommit(result: Deno.KvCommitResult | Deno.KvCommitError): asserts result is Deno.KvCommitResult {
	if (!result.ok) {
		throw new HTTPException(500, { message: "Database error" });
	}
}
