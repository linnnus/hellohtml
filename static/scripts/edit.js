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

// OUTPUT ----------------------------------------------------------------------

// TODO: Push updates to server asynchonously but update iframe immediately with
// document.write();

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

deleteButton?.addEventListener("click", async (_) => {
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
    // Server sends '303 See other' with location of new project. Open it in a
    // new tab to make it clearer to the user that this is a new project.
    console.assert(response.status === 303);
    window.open(response.url, "_blank");
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
