/*\
title: $:/plugins/EvidentlyCube/AutoComplete/integration-codemirror.js
type: application/javascript
module-type: library

Autocompletion integration for Simple text editor

\*/
(function () {

	exports.patch = function(completionAPI, monkeypatch) {
		var editCodeMirrorWidget = require('$:/plugins/tiddlywiki/codemirror/edit-codemirror.js')['edit-codemirror'];

		var selectionStart = -1;
		var activeCm = null;
		var triggerLength = -1;

		editCodeMirrorWidget.prototype.render = monkeypatch.sequence(editCodeMirrorWidget.prototype.render, widgetRender);

		function widgetRender() {
			this.engine.cm.on('keydown', handleKeydown);
			this.engine.cm.on('blur', handleBlur);
			this.engine.cm.on('change', handleEngineInput);
			this.engine.cm.on('cursorActivity', handleKeyup);
		}

		function handleKeydown(cm, event) {
			if (completionAPI.isActive) {
				switch(event.key) {
					case "ArrowUp":
					case "ArrowDown":
						completionAPI.changeSelection(event.key === "ArrowUp" ? -1 : 1);
						event.stopImmediatePropagation();
						event.preventDefault();
						break;

					case "Enter":
						const option = completionAPI.getSelected();

						if (option) {
							insertSelection(option);
						}

						completionAPI.finishCompletion();
						event.stopImmediatePropagation();
						event.preventDefault();
						break;
					}

			} else if (completionAPI.isManualTrigger(event)) {
				var triggerData = completionAPI.getMatchingTrigger("", "", function (length) {
					const caret = cm.getCursor();
					const start = {
						line: caret.line,
						ch: Math.max(0, caret.ch - length)
					};

					return cm.getRange(start, caret);
				});

				if (triggerData) {
					startCompletion(triggerData, cm);
				}
			}
		}

		function startCompletion(triggerData, cm) {
			activeCm = cm;
			triggerLength = triggerData.trigger.length;
			selectionStart = cm.getCursor();
			completionAPI.startCompletion(triggerData, getCaretCoordinates(cm, selectionStart), {
				onSelected: insertSelection,
				windowID: cm.getInputField().ownerDocument._ecAcWindowID
			});
		}

		function handleEngineInput(cm, operation) {
			const data = operation && operation.text && operation.text.length === 1
				? operation.text[0]
				: '';

			if (!completionAPI.isActive && data !== null && data !== "") {
				selectionStart = cm.getCursor();

				var triggerData = completionAPI.getMatchingTrigger(data, "TEXTAREA", function (length) {
					const caret = cm.getCursor();
					const start = {
						line: caret.line,
						ch: Math.max(0, caret.ch - length)
					};

					return cm.getRange(start, caret);
				});

				if (triggerData) {
					activeCm = cm;
					startCompletion(triggerData, cm);
				}
			}
		}

		function handleBlur() {
			if (completionAPI.isActive) {
				completionAPI.finishCompletion();
			}
		}

		function handleKeyup(cm) {
			if (!completionAPI.isActive) {
				return;
			}
			const cursor = cm.getCursor();

			if (cursor.line < selectionStart.line || cursor.ch < selectionStart.ch) {
				completionAPI.finishCompletion();
			} else {
				completionAPI.updateQuery(cm.getRange(selectionStart, cursor));
			}
		}

		function insertSelection(value) {
			const completed = completionAPI.getCompletedTemplate(value);
			const sliceStart = {
				line: selectionStart.line,
				ch: selectionStart.ch - triggerLength
			};
			const sliceEnd = activeCm.getCursor();

			activeCm.replaceRange(completed.text, sliceStart, sliceEnd);
			activeCm.setCursor({
				line: selectionStart.line,
				ch: selectionStart.ch - triggerLength + completed.caretIndex
			});
			completionAPI.finishCompletion();
		}

		function getCaretCoordinates(cm, caretPos) {
			const coords = cm.charCoords(caretPos);

			return {
				left: coords.left,
				top: coords.bottom + window.scrollY
			}
		}
	}
})();
