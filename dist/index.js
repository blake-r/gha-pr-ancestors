(()=>{if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab=__dirname+"/";var n={};System.register(["@actions/core","@actions/github"],(function(n,e){"use strict";var t,o;var r=e&&e.id;async function main(){const n=t.getInput("owner");const e=t.getInput("repository");const r=t.getInput("token");const s=t.getInput("pull_number");const c=o.getOctokit(r);const i=`\n        {\n            repository(owner: "${n}", name: "${e}") {\n                pullRequest(number:${s}) {\n                    files(first:100) {\n                        nodes { path }\n                        pageInfo { endCursor }\n                    }\n                }\n            }\n        }\n    `;const u=await c.graphql(i);console.log(u)}return{setters:[function(n){t=n},function(n){o=n}],execute:function(){main().catch((n=>{console.error(n);t.setFailed(n.message)}))}}}));module.exports=n})();