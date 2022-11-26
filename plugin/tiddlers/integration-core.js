/*\
title: $:/plugins/EvidentlyCube/AutoComplete/integration-core.js
type: application/javascript
module-type: library

Autocompletion integration for Simple text editor

\*/
(function () {

	exports.patch = function(completionAPI, monkeypatch) {
		var editTextWidget = require('$:/core/modules/widgets/edit-text.js')['edit-text'];
		var simpleEngine = require('$:/core/modules/editor/engines/simple.js').SimpleEngine;
		var framedEngine = require('$:/core/modules/editor/engines/framed.js').FramedEngine;
		var getBaseCaretCoordinates = require('$:/plugins/EvidentlyCube/AutoComplete/textarea-caret-position.js').getCaretCoordinates;

		var selectionStart = -1;
		var activeDom = null;
		var triggerLength = -1;

		editTextWidget.prototype.render = monkeypatch.sequence(editTextWidget.prototype.render, widgetRender);
		editTextWidget.prototype.handleKeydownEvent = monkeypatch.sequence(editTextWidget.prototype.handleKeydownEvent, handleWidgetKeydown);
		simpleEngine.prototype.handleInputEvent = monkeypatch.preventable(simpleEngine.prototype.handleInputEvent, handleEngineInput);
		framedEngine.prototype.handleInputEvent = monkeypatch.preventable(framedEngine.prototype.handleInputEvent, handleEngineInput);

		function widgetRender() {
			this.engine.domNode.addEventListener('blur', handleBlur);
			this.engine.domNode.addEventListener('keyup', handleKeyup);

			// We need to be able to detect this even for inputs
			if (!this.editShowToolbar) {
				$tw.utils.addEventListeners(this.engine.domNode, [
					{ name: 'keydown', handlerObject: this, handlerMethod: 'handleKeydownEvent' }
				]);
			}
		}

		function handleWidgetKeydown(event) {
			if (completionAPI.isActive) {
				switch(event.key) {
					case "ArrowUp":
					case "ArrowDown":
						completionAPI.changeSelection(event.key === "ArrowUp" ? -1 : 1);
						event.stopImmediatePropagation();
						event.preventDefault();
						break;
					}

			} else if (completionAPI.isManualTrigger(event)) {
				var triggerData = completionAPI.getMatchingTrigger("", event.target.tagName, function (length) {
					return event.target.value.substr(event.target.selectionStart - length, length);
				});

				if (triggerData) {
					startCompletion(triggerData, event.target);
				}
			}
		}

		function startCompletion(triggerData, dom) {
			// Special handling to avoid confirm to close draft when editing in framed editor
			const root = dom.getRootNode();
			if (root !== document) {
				root.addEventListener('keydown', handleFramedEscape, true);
			}

			// Streams Plugin compatibility: HHandle enter on root to circumvent new stream being created
			root.addEventListener('keydown', handleDocumentEnter, true);

			activeDom = dom;
			triggerLength = triggerData.trigger.length;
			selectionStart = dom.selectionStart;
			completionAPI.startCompletion(triggerData, getCaretCoordinates(dom, selectionStart), {
				onSelected: insertSelection,
				onFinish: handleFinishCompletion
			});
		}

		function handleFinishCompletion() {
			const root = activeDom.getRootNode();

			root.removeEventListener('keydown', handleFramedEscape, true);
			root.removeEventListener('keydown', handleDocumentEnter, true);
		}

		function handleFramedEscape(event) {
			if (completionAPI.isActive && event.key === 'Escape') {
				completionAPI.finishCompletion();
				event.stopImmediatePropagation();
				event.preventDefault()
			}
		}

		function handleDocumentEnter(event) {
			if (completionAPI.isActive && event.key === "Enter" && !event.ctrlKey && !event.shiftKey && !event.altKey) {
				const option = completionAPI.getSelected();

				if (option) {
					insertSelection(option);
				}

				completionAPI.finishCompletion();
				event.stopImmediatePropagation();
				event.preventDefault();
			}
		}

		function handleEngineInput(event) {
			if (!completionAPI.isActive && event.data !== null && event.data !== "") {
				var triggerData = completionAPI.getMatchingTrigger(event.data, event.target.tagName, function (length) {
					return event.target.value.substr(event.target.selectionStart - length, length);
				});

				if (triggerData) {
					activeDom = event.target;
					startCompletion(triggerData, event.target);
				}
			}
		}

		function handleBlur(event) {
			if (completionAPI.isActive) {
				completionAPI.finishCompletion();
			}
		}

		function handleKeyup(event) {
			if (!completionAPI.isActive) {
				return;
			}

			if (activeDom.selectionStart < selectionStart) {
				completionAPI.finishCompletion();
			} else {
				completionAPI.updateQuery(activeDom.value.substring(selectionStart, activeDom.selectionStart));
			}
		}

		function insertSelection(value) {
			const completed = completionAPI.getCompletedTemplate(value);
			const sliceStart = selectionStart - triggerLength;
			const sliceEnd = activeDom.selectionStart;

			if (activeDom.getRootNode().execCommand) {
				activeDom.selectionStart = sliceStart;
				activeDom.selectionEnd = sliceEnd;
				activeDom.getRootNode().execCommand("insertText", false, completed.text);

			} else {
				activeDom.value = activeDom.value.substr(0, sliceStart)
					+ completed.text
					+ activeDom.value.substr(sliceEnd);
			}

			activeDom.selectionStart = activeDom.selectionEnd = selectionStart - triggerLength + completed.caretIndex;
			completionAPI.finishCompletion();
		}

		function getCaretCoordinates() {
			const baseCoords = activeDom.getBoundingClientRect();
			const document = activeDom.getRootNode();
			const window = document.defaultView;
			const coords = getBaseCaretCoordinates(activeDom, selectionStart);
			const iframeCoords = getIframeOffset(activeDom);

			return {
				left: baseCoords.left + coords.left + iframeCoords.left,
				top: baseCoords.top + coords.top + coords.height + iframeCoords.top + window.scrollY
			}
		}

		function getIframeOffset(dom) {
			const root = dom.getRootNode();

			if (root !== document) {
				const parentDocument = root.defaultView.parent.document;
				const iframes = parentDocument.querySelectorAll('iframe');
				for (var i = 0; i < iframes.length; i++) {
					const iframe = iframes[i];

					if (iframe.contentDocument !== root) {
						continue;
					}

					return iframe.getBoundingClientRect();
				}
			}

			return {top: 0, left: 0};
		}
	}
})();
