import * as core from "@actions/core";
import * as github from "@actions/github";


async function main() {
    const owner = core.getInput("owner");
    const repository = core.getInput("repository");
    const token = core.getInput("token");
    const pull_number = core.getInput("pull_number")
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
    `
    const result = await octokit.graphql(query);
    console.log(result);
}

main().catch(error => {
    console.error(error);
    core.setFailed(error.message);
});
