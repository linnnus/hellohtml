# shittiest codepen known to man

i don't particularly like [codepen];
the layout's cramped and there are too many knobs and switches.
this project is a codepen clone which is basically just a textarea and an iframe.
it represents a couple hours of work, the maximum i was willing to invest in something "kinda useful".
it ain't much but its ~~~honest work~~~ just the right balance of capability/simplicity for me.

whole thing is implemented using the VANILLA stack,
where we just use the platform as is,
for the frontend and [deno] for the backend.

here's an overview of the different files ordered by approximate importance:

1. `views/`: templates for html shown to user
1. `src/server.ts`: renders views in `views/` + interacts with database through `src/model.ts` + notifies clients of changes using [server-sent events][SSE]
1. `src/model.ts`: interacts with database + contains business logic
1. `src/config.ts`: contains various configuration variables. can be overwritten with environment variables
1. `flake.nix`: defines a nixos service and a [nix] package. deeply horrific stuff
1. `deno.lock`: deno's dependencies are just urls. this file ensures there's no tomfoolery going on. `flake.nix` also uses this to achieve deterministic dependencies.
1. `flake.lock` + `deno.json` + `import_map.json`: super boringgggg

at some point i'd like to...

- [ ] add syntax highlighting. chris [did this][textarea-syntax] in vanilla js without too much work
- [ ] add support for multiple files. like [glitch] except only for static files and also way worse
- [ ] add a "clone" action in readonly-mode
- [ ] remove trailing whitespace automatically
- [ ] isolate iframe in own process to avoid `<script>while(1);</script>` breaking editor

[codepen]: https://codepen.io/
[textarea-syntax]: https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/
[nix]: https://nixos.org/
[deno]: https://deno.land/
[SSE]: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
[glitch]: https://glitch.io/
