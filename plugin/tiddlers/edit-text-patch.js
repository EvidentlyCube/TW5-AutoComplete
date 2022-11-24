/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/edit-text-patch.js
type: application/javascript
module-type: library

Hooks the module
\*/

(function () {

	/*jslint node: false, browser: true */
	/*global $tw: false */
	"use strict";

	// Export name and synchronous status
	if ($tw.node) {
		return;
	}

	const editTextWidget = require('$:/core/modules/widgets/edit-text.js')['edit-text'];
	const simpleEngine = require('$:/core/modules/editor/engines/simple.js').SimpleEngine;
	const framedEngine = require('$:/core/modules/editor/engines/framed.js').FramedEngine;

	let isPatched = false;
	exports.patch = function (handleKeydown, handleKeyup, handleInput, handleBlur) {
		if (isPatched) {
			throw new Error("Simple editor cannot be patched twice");
		}

		isPatched = true;

		patchSimpleEngine(handleInput);
		patchFramedEngine(handleInput);
		patchCodeMirror(handleInput);
		patchEditTextWidget(handleKeydown, handleKeyup, handleBlur);
		patchCodeMirrorWidget(handleKeydown, handleKeyup, handleBlur);
	};

	function patchSimpleEngine(handleInput) {
		const oldHandleInputEvent = simpleEngine.prototype.handleInputEvent;
		simpleEngine.prototype.handleInputEvent = function (event) {
			if (handleInput(event) !== false) {
				oldHandleInputEvent.apply(this, arguments)
			}
		};
	}

	function patchFramedEngine(handleInput) {
		const oldHandleInputEvent = framedEngine.prototype.handleInputEvent;
		framedEngine.prototype.handleInputEvent = function (event) {
			if (handleInput(event) !== false) {
				oldHandleInputEvent.apply(this, arguments)
			}
		};
	}

	function patchCodeMirror(handleInput) {
		try {
			const codeMirrorEngine = require("$:/plugins/tiddlywiki/codemirror/engine.js").CodeMirrorEngine
			const oldHandleInputEvent = codeMirrorEngine.prototype.handleInputEvent;
			codeMirrorEngine.prototype.handleInputEvent = function (event) {
				if (handleInput(event) !== false) {
					oldHandleInputEvent.apply(this, arguments)
				}
			};
		} catch (e) {
			// Code mirror is not available so nothing to do here
		}
	}

	function patchEditTextWidget(handleKeydown, handleKeyup, handleBlur) {
		const oldRenderMethod = editTextWidget.prototype.render;
		const oldHandleKeydownEvent = editTextWidget.prototype.handleKeydownEvent;
		editTextWidget.prototype.render = function () {
			const result = oldRenderMethod.apply(this, arguments);
			this.engine.domNode.addEventListener('blur', handleBlur);
			this.engine.domNode.addEventListener('keyup', handleKeyup);
			if (!this.editShowToolbar) {
				$tw.utils.addEventListeners(this.engine.domNode, [
					{ name: 'keydown', handlerObject: this, handlerMethod: 'handleKeydownEvent' }
				]);
			}

			return result;
		};
		editTextWidget.prototype.handleKeydownEvent = function (event) {
			if (handleKeydown(event) !== false) {
				oldHandleKeydownEvent.apply(this, arguments)
			}
		};
	}

	function patchCodeMirrorWidget(handleKeydown, handleKeyup, handleBlur) {
		try {
			const codeMirrorWidget = require('$:/plugins/tiddlywiki/codemirror/edit-codemirror.js')['edit-codemirror'];
			const oldRenderMethod = codeMirrorWidget.prototype.render;
			codeMirrorWidget.prototype.render = function () {
				const result = oldRenderMethod.apply(this, arguments);

				this.engine.cm.on('keydown', function(a, b) {
					b.preventDefault();
				})

				return result;
			};
		} catch (e) {
			// Code mirror is not available so nothing to do here
		}
	}
})();
