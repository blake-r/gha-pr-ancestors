/******/ (() => { // webpackBootstrap
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
System.register(["@actions/core", "@actions/github"], function (exports_1, context_1) {
    "use strict";
    var core, github;
    var __moduleName = context_1 && context_1.id;
    async function main() {
        const owner = core.getInput("owner");
        const repository = core.getInput("repository");
        const token = core.getInput("token");
        const pull_number = core.getInput("pull_number");
        const octokit = github.getOctokit(token);
        const query = `
        {
            repository(owner: "${owner}", name: "${repository}") {
                pullRequest(number:${pull_number}) {
                    files(first:100) {
                        nodes { path }
                        pageInfo { endCursor }
                    }
                }
            }
        }
    `;
        const result = await octokit.graphql(query);
        console.log(result);
    }
    return {
        setters: [
            function (core_1) {
                core = core_1;
            },
            function (github_1) {
                github = github_1;
            }
        ],
        execute: function () {
            main().catch(error => {
                console.error(error);
                core.setFailed(error.message);
            });
        }
    };
});

module.exports = __webpack_exports__;
/******/ })()
;