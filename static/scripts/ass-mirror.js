// This script implements the shittiest CodeMirror clone known to man. It is
// used as the custom element <ass-mirror /> in the HTML.

class AssMirror extends HTMLElement {
	constructor() {
		super();
	}

	connectedCallback() {
		// In a normal <textarea>, the the initial value can be
		// specified between the brackets. We have to save this before
		// attaching the shadow DOM.
		const initialValue = this.textContent;

		const shadow = this.attachShadow({ mode: "open" });

		const styleSheet = document.createElement("style");
		styleSheet.textContent = `
			/* Take up all available space */
			:root, .container, .edit, .highlight-container {
				height: 100%;
				width: 100%;
			}

			.container {
				/* Must be position relative so editor and highlighting can be positioned relative to this */
				position: relative;
			}

			.edit,
			.highlight-container {
				/* Place the two elements directly on top of each other **/
				position: absolute;
				top: 0;
				left: 0;
			}

			/* Make sure the textarea is up front so it can be interacted with */
			.edit { z-index: 1; }
			.highlight-container { z-index: 0; }

			/* Make textarea almost completely transparent */
			.edit {
			  color: transparent;
			  /* DEBUGGING: color: rgba(255, 0, 0, 0.3); */
			  background: transparent;
			  caret-color: black; /* Or choose your favorite color */
			}

			  /* Both elements need the same text and space styling so they are directly on top of each other */
			.edit,
			.highlight-container {
			  margin: 0;
			  padding: .5rem;
			  border: 0;

			  height: calc(100% - 1rem /* padding */);
			  width: calc(100% - 1rem /* padding */);
			}

			/* Make sure fonts overlap exactly as well */
			.edit,
			.highlight-container,
			.highlight-container * { /* Also add text styles to highlighting tokens */
			  font-size: 1rem;
			  font-family: monospace;
			  line-height: 20pt;

			  tab-size: 2 !important; /* Have to overwrite Prism's styling */
			}

			/* Can be scrolled */
			.edit,
			.highlight-container {
				overflow: auto;
				white-space: nowrap; /* Allows textarea to scroll horizontally */
				resize: none; /* Don't allow textarea to change size */
			}
		`;
		shadow.appendChild(styleSheet);

		// Also need to import Prism.js stylesheet into our shadow DOM.
		// FIXME: This is super ugly!
		this.shadowRoot.innerHTML += `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/9000.0.1/themes/prism.min.css" integrity="sha512-/mZ1FHPkg6EKcxo0fKXF51ak6Cr2ocgDi5ytaTBjsQZIH/RNs6GF6+oId/vPe3eJB836T36nXwVh/WBl/cWT4w==" crossorigin="anonymous" referrerpolicy="no-referrer" />`;

		const container = document.createElement("div");
		container.classList.add("container");
		shadow.appendChild(container);

		this.edit = document.createElement("textArea");
		this.edit.autocorrect = "off";
		this.edit.spellCheck = false;
		this.edit.classList.add("edit");
		this.edit.addEventListener("keydown", this.#doSmartEditing.bind(this));
		this.edit.addEventListener("input",   this.#updateHighlight.bind(this));
		this.edit.addEventListener("input",   this.#syncScrollPosition.bind(this)); // Input can change height
		this.edit.addEventListener("scroll",  this.#syncScrollPosition.bind(this));
		container.appendChild(this.edit);

		this.highlightContainer = document.createElement("pre");
		this.highlightContainer.classList.add("highlight-container");
		this.highlightContainer.ariaHidden = true;
		container.appendChild(this.highlightContainer);

		this.highlight = document.createElement("code");
		this.highlight.classList.add("language-markup"); // For Prism.js
		this.highlightContainer.appendChild(this.highlight);

		// Now that we're is fully configured, we can set the inital value that we got at the start.
		this.edit.value = initialValue;
		this.#updateHighlight();
	}

	#doSmartEditing(event) {
	  const t = this.edit;

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
	}

	#updateHighlight() {
		let code = this.edit.value;

		// Prism.js will ignore final newlines for aesthetic reasons but
		// this makes the code area go out of sync temporarily when the user presses
		// enter. To fix this, insert a dummy space.
		if (code[code.length - 1] === "\n") {
			code += " ";
		}

		// FIXME: Don't use a global instance of Prism!
		const html = Prism.highlight(code, Prism.languages.markup, 'markup');
		this.highlight.innerHTML = html;
	}

	#syncScrollPosition() {
		this.highlightContainer.scrollTop  = this.edit.scrollTop;
		this.highlightContainer.scrollLeft = this.edit.scrollLeft;
	}

	/* Expose the value kind of like a regular textarea */
	get value() { return this.edit.value; }
	set value(newValue) {
		this.edit.value = newValue;
		this.#updateHighlight();
	}
}

customElements.define("ass-mirror", AssMirror);
