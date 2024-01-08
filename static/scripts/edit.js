// TODO: Fetch may also throw an error. We should display an error to the user
// in that case as well.
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
eventSource.addEventListener("message", (_) => {
  console.log("%cRefreshing...", "font-size: x-large");
  outputFrame.contentWindow.location.reload();
});

// ACTIONS ---------------------------------------------------------------------

const deleteButton = document.getElementById("deleteAction");

deleteButton.addEventListener("click", async (_) => {
  if (confirm("Are you sure you want to PERMANENTLY delete this project?")) {
    const result = await fetch(`/project/${window.helloHtmlProjectId}`, {
      method: "DELETE",
    });
    if (!result.ok) {
      alert(
        `Failed to send updated name to server: ${response.statusText}.` +
          ` See dev console for more info.`,
      );
    } else {
      window.location.reload();
    }
  }
});

// vi: ft=javascript et ts=2 sw=2 tw=80
