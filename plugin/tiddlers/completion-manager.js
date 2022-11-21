/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/completion-manager.js
type: application/javascript
module-type: global

Keyboard handling utilities

\*/
(function () {

	const DATA_TIDDLER_NAME = "$:/temp/TiddlerCompletion/completion-data";

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var widget = require("$:/core/modules/widgets/widget.js");

	function CompletionManager() {
		var self = this;

		this.completingTemplate =  null;
		this.completingDom = null;
		this.completingPosition = -1;
		this.completingLastSelection = -1;
		this.completingIndex = -1;
		this.completingLastQuery = "";
		this.completingLastResults = [];

		this.variableWidget = new widget.widget({
			type: "widget",
			children: []
		},{
			wiki: $tw.wiki,
			document: $tw.browser ? document : $tw.fakeDocument
		});

		this.templates = [];
		this.templateTiddlers = [];
		this.getCaretCoordinates = require('$:/plugins/EvidentlyCube/TiddlerCompletion/textarea-caret-position.js').getCaretCoordinates;

		this.updateTemplateList(this.getTemplateTiddlerList());
		$tw.wiki.addEventListener("change", function (changes) {
			self.handleChangeTemplateTiddlerList(changes);
		});
	}

	CompletionManager.prototype.handleKeydownEvent = function(event) {
		if (!this.completingDom) {
			if (event.key === " " && event.ctrlKey) {
				this.tryAssigningCompletion(event.target, "");
				event.stopImmediatePropagation();
			}
			return;
		}

		if (event.key === "Escape") {
			this.cancelCompletion();
			event.stopImmediatePropagation();
			return false;
		} else if (event.key === "ArrowUp") {
			this.completingIndex--;
			if (this.completingIndex < 1) {
				this.completingIndex += this.completingLastResults.length;
			}
			$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.completingIndex);
			event.stopImmediatePropagation();
			event.preventDefault();
			return;
		} else if (event.key === "ArrowDown") {
			this.completingIndex++;
			if (this.completingIndex > this.completingLastResults.length) {
				this.completingIndex -= this.completingLastResults.length;
			}
			$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.completingIndex);
			event.stopImmediatePropagation();
			event.preventDefault();
			return;
		} else if (event.key === "Enter") {
			if (this.completingLastResults.length === 0) {
				this.cancelCompletion();
			} else {
				this.insertCompletion(this.completingLastResults[this.completingLastSelection]);
			}
			event.stopImmediatePropagation();
			event.preventDefault();
			return;
		}

		let selectionStart = this.completingDom.selectionStart;
		if (event.key === 'ArrowLeft') {
			selectionStart--;
		} else if (event.key === 'ArrowRight') {
			selectionStart++;
		}

		if (selectionStart < this.completingPosition) {
			this.cancelCompletion();
		} else {
			this.repositionCompletion(selectionStart);
		}
	};

	CompletionManager.prototype.handleInputEvent = function(event) {
		if (this.completingDom && event.target !== this.completingDom) {
			this.cancelCompletion();
		}

		if (!event.data) {
			return;
		}

		if (!this.completingDom) {
			this.tryAssigningCompletion(event.target, event.data);
		} else {
			this.repositionCompletion(this.completingDom.selectionStart);
		}
	};

	CompletionManager.prototype.handleBlurEvent = function(event) {
		if (this.completingDom) {
			// this.cancelCompletion();
		}
	}

	CompletionManager.prototype.tryAssigningCompletion = function(dom, inputData) {
		var self = this;
		$tw.utils.each(this.templates, function(template) {
			console.log(template);
			if (inputData && template.triggerLastCharacter !== inputData) {
				return;
			}

			const fragment = dom.value.substr(dom.selectionStart - template.trigger.length, template.trigger.length);
			if (fragment !== template.trigger) {
				return;
			}

			self.startCompletion(
				dom,
				template,
				dom.selectionStart
			);
			return false;
		});
	}

	CompletionManager.prototype.cancelCompletion = function() {
		this.completingTemplate =  null;
		this.completingDom = null;
		this.completingPosition = -1;
		this.completingLastSelection = -1;
		this.completingIndex = -1;
		this.completingLastQuery = "";
		this.completingLastResults = [];
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, null);
	};

	CompletionManager.prototype.startCompletion = function(dom, template, startPosition) {
		this.completingTemplate =  template;
		this.completingDom = dom;
		this.completingPosition = startPosition;
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'show', null, "1");

		this.refreshSearch("te");
		this.repositionCompletion(this.completingDom.selectionStart);
	}

	CompletionManager.prototype.insertCompletion = function(tiddler) {
		const sliceStart = this.completingLastSelection - this.completingTemplate.trigger.length;
		const sliceEnd = this.completingDom.selectionStart;
		const replacement = this.completingTemplate.insertTemplate.replace(/\${tiddler}/g, tiddler);
		const caretTokenIndex = replacement.indexOf("${caret}");
		const caretIndex = caretTokenIndex !== -1 ? caretTokenIndex : replacement.length;

		this.completingDom.value = this.completingDom.value.substr(0, sliceStart)
			+ replacement.replace(/\${caret}/g, '')
			+ this.completingDom.value.substr(sliceEnd);
		this.completingDom.selectionStart = caretIndex;
		this.completingDom.selectionEnd = caretIndex;
		this.cancelCompletion();
	}

	CompletionManager.prototype.refreshSearch = function(query) {
		if (query === this.completingLastQuery) {
			return;
		}
		this.completingLastQuery = query;
		const filter = this.completingTemplate.filter;
		this.variableWidget.setVariable('query', query);

		this.completingIndex = 1;
		this.completingLastResults = $tw.wiki.filterTiddlers(filter, {getVariable: function(name) {
			if (name === "query") {
				return query;
			}
			return "";
		}});
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'list', null, this.completingLastResults);
		$tw.wiki.setText(DATA_TIDDLER_NAME, 'index', null, this.completingIndex);
	}

	CompletionManager.prototype.repositionCompletion = function(selectionStart) {
		if (this.completingLastSelection === selectionStart) {
			return;
		}

		this.completingLastSelection = selectionStart;
		const baseCoords = this.completingDom.getBoundingClientRect();
		const coords = this.getCaretCoordinates(this.completingDom, selectionStart);
		const newStyle = [
			`left: ${(baseCoords.left + coords.left).toFixed(4)}px`,
			`top: ${(baseCoords.top + coords.top + coords.height).toFixed(4)}px`
		].join(";");

		$tw.wiki.setText(DATA_TIDDLER_NAME, 'style', null, newStyle);
	}

	CompletionManager.prototype.getTemplateTiddlerList = function () {
		return $tw.wiki.getTiddlersWithTag("$:/tags/plugin/CompletionManager");
	};

	CompletionManager.prototype.updateTemplateList = function (tiddlerList) {
		this.templates = [];
		this.templateTiddlers = tiddlerList;
		for (var i = 0; i < tiddlerList.length; i++) {
			var title = tiddlerList[i],
				tiddlerFields = $tw.wiki.getTiddler(title).fields,
				trigger = tiddlerFields.trigger,
				filter = tiddlerFields.filter,
				insertTemplate = tiddlerFields.template;

			if (!filter || !insertTemplate || !trigger) {
				continue;
			}

			this.templates.push({
				filter: tiddlerFields.filter,
				trigger: trigger,
				triggerLastCharacter: trigger.charAt(trigger.length - 1),
				insertTemplate: insertTemplate
			});
		}
	};

	CompletionManager.prototype.handleChangeTemplateTiddlerList = function (changedTiddlers) {
		this.updateTemplateList(this.getTemplateTiddlerList());
	};

	exports.EC_CompletionManager = CompletionManager;

})();
