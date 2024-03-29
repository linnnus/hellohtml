// TODO: Fetch may also throw an error. We should display an error to the user in that case as well.
// TODO: Split into seperate scripts. Use progessive enhancement.

// UPLOAD INPUT ----------------------------------------------------------------

const inputArea = document.getElementById("input");
const nameInput = document.getElementById("name");

async function handleInputChange() {
  const response = await fetch(
    `/project/${window.helloHtmlProjectId}/content`,
    {
      method: "PATCH",
      headers: { "Content-Type": "text/plain" },
      body: inputArea.value,
    },
  );
  if (!response.ok) {
    alert(
      `Failed to send updated content to server: ${response.statusText}.` +
        ` See dev console for more info.`,
    );
    console.log(response);
    return;
  }
}

function debounce(fn, delay) {
  let timerId;
  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

inputArea.addEventListener("input", debounce(handleInputChange, 2000));

async function handleNameChange() {
  const response = await fetch(
    `/project/${window.helloHtmlProjectId}/name`,
    {
      method: "PATCH",
      headers: { "Content-Type": "text/plain" },
      body: nameInput.value,
    },
  );
  if (!response.ok) {
    alert(
      `Failed to send updated name to server: ${response.statusText}.` +
        ` See dev console for more info.`,
    );
    console.log(response);
    return;
  }

  document.title = nameInput.value;
}

nameInput.addEventListener("change", handleNameChange);

// SMART INPUT -----------------------------------------------------------------

inputArea.addEventListener("keydown", (event) => {
  const t = event.target;
  if (event.key === "Tab") { // In-/dedent with tab key
    // Don't switch to next element.
    // This is super bad for accesability.
    event.preventDefault();

    if (t.selectionStart === t.selectionEnd) {
      if (event.shiftKey) {
        // We want to (optionally) remove a single tab character at
        // the start of the current line.
        // TODO
      } else {
        // We use execCommand so the edit history isn't flushed.
        // See: https://meta.discourse.org/t/add-better-undo-support-when-inserting-formatted-text/214821/13
        document.execCommand("insertText", false, "\t");
      }
    } else {
      // Record initial selection. What the user sees.
      const oldSelectionStart = t.selectionStart;
      const oldSelectionEnd = t.selectionEnd;

      // Move visual selection back to start of line.
      while (t.selectionStart !== 0 && t.value[t.selectionStart - 1] !== "\n") {
        t.selectionStart -= 1;
      }

      if (event.shiftKey) { // remove tab from each line
        const text = t.value.slice(t.selectionStart, t.selectionEnd);
        const newText = text.split("\n").map((l) =>
          l.startsWith("\t") ? l.slice(1) : l
        ).join("\n");
        console.assert(newText.length <= text.length);

        document.execCommand("insertText", false, newText);

        // Restore visual selection.
        // We use oldSelectionStart to avoid cursor jumping to beginning of line.
        // We use oldSelectionEnd because execCommand fucked t.selectionEnd.
        const firstLine = text.split("\n", 1)[0];
        t.selectionStart = firstLine.startsWith("\t")
          ? oldSelectionStart - 1
          : oldSelectionStart;
        t.selectionEnd = oldSelectionEnd + (newText.length - text.length);
      } else {
        const text = t.value.slice(t.selectionStart, t.selectionEnd);
        const newText = text.split("\n").map((l) => "\t" + l).join("\n");
        console.assert(newText.length > text.length);

        document.execCommand("insertText", false, newText);

        const firstLine = text.split("\n", 1)[0];
        t.selectionStart = /\S/.test(firstLine)
          ? oldSelectionStart + 1
          : oldSelectionStart;
        t.selectionEnd = oldSelectionEnd + (newText.length - text.length);
      }
    }
  } else if (event.key == "Enter") { // Copy indentation on newline
    if (t.selectionStart === t.selectionEnd) { // no visual selection
      event.preventDefault(); // don't insert linebreak - we will do that

      // Get whitespace *before* cursor.
      const lines = t.value.slice(0, t.selectionStart).split("\n");
      const currentLine = lines[lines.length - 1];
      const indent = currentLine.match(/^\s*/)[0];

      document.execCommand("insertText", false, "\n" + indent);
    }
  }
});

// OUTPUT ----------------------------------------------------------------------

const outputFrame = document.getElementById("output");
const eventSource = new EventSource(
  `/project/${window.helloHtmlProjectId}/event-stream`,
);
eventSource.addEventListener("message", (event) => {
  console.clear();
  console.log("%cRefreshing...", "font-size: x-large");
  const data = JSON.parse(event.data);
  console.log(data);
  reloadIframe(outputFrame);
  window.title = data.name;
});

// ACTIONS ---------------------------------------------------------------------

const deleteButton = document.getElementById("deleteAction");
const cloneButton = document.getElementById("cloneAction");
const reloadButton = document.getElementById("reloadAction");

deleteButton.addEventListener("click", async (_) => {
  if (confirm("Are you sure you want to PERMANENTLY delete this project?")) {
    const response = await fetch(`/project/${window.helloHtmlProjectId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      alert(
        `Failed to delete project: ${response.statusText}.` +
          ` See dev console for more info.`,
      );
      console.log(response);
    } else {
      window.location = "/";
    }
  }
});

cloneButton.addEventListener("click", async (_) => {
  const response = await fetch(`/project/${window.helloHtmlProjectId}`, {
    method: "COPY",
  });
  if (!response.ok) {
    alert(
      `Failed to clone project: ${response.statusText}.` +
        ` See dev console for more info.`,
    );
    console.log(response);
  } else {
    // Manually follow redirected response.
    // See: https://stackoverflow.com/a/56974253
    console.assert(response.redirected);
    window.location.href = response.url;
  }
});

reloadButton.addEventListener("click", () => {
  reloadIframe(outputFrame);
});

// UTILITIES -------------------------------------------------------------------

function reloadIframe(iframe) {
  const tmp = iframe.src;
  iframe.src = "about:blank";
  setTimeout(() => {
    iframe.src = tmp;
  }, 10);
}

// vi: ft=javascript et ts=2 sw=2 tw=80
