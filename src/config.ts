import { join, fromFileUrl, dirname } from "https://deno.land/std@0.181.0/path/mod.ts";

const base = Deno.env.get("HELLOHTML_BASE_DIR") ?? dirname(dirname(fromFileUrl(import.meta.url)));

// Path to the directory that contains all static assets.
export const staticPath = Deno.env.get("HELLOHTML_STATIC_DIR") ?? join(base, "static");

// Path to the directory that contains all view templates. This should contain subdirectories partials/ and layouts/.
export const viewPath = Deno.env.get("HELLOHTML_VIEWS_DIR") ?? join(base, "views");

// Path to database file.
// FIXME: On deploy this would need to be undefined which we can't set.
export const dbPath = Deno.env.get("HELLOHTML_DB_PATH") ?? join(base, "hello.db");

// Port for webserver to listen on.
export const port = parseInt(Deno.env.get("HELLOHTML_PORT") ?? "8538");
