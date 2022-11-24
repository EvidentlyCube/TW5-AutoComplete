/*\
title: $:/plugins/EvidentlyCube/TiddlerCompletion/completion.js
type: application/javascript
module-type: startup

Hooks the module
\*/

(function () {

	/*jslint node: false, browser: true */
	/*global $tw: false */
	"use strict";

	// Export name and synchronous status
	exports.name = "evidentlycube-tiddlercompletion";
	exports.platforms = ["browser"];
	exports.before = ["render"];
	exports.synchronous = true;

	exports.startup = function () {
		if ($tw.node) {
			return;
		}

		const monkeypatch = {
			sequence: function(originalMethod, newMethod) {
				return function() {
					const result = originalMethod.apply(this, arguments);

					newMethod.apply(this, arguments);

					return result;
				}
			},
			preventable: function(originalMethod, newMethod) {
				return function() {
					if (newMethod.apply(this, arguments) !== false) {
						return originalMethod.apply(this, arguments);
					}

					return undefined;
				}
			}
		}

		const EC_TiddlerCompletion = require('$:/plugins/EvidentlyCube/TiddlerCompletion/completion-api.js').EC_TiddlerCompletion;
		const completionApi = new EC_TiddlerCompletion();

		require('$:/plugins/EvidentlyCube/TiddlerCompletion/integration-core.js').patch(completionApi, monkeypatch);
		require('$:/plugins/EvidentlyCube/TiddlerCompletion/integration-codemirror.js').patch(completionApi, monkeypatch);

	};

})();
