import * as core from "@actions/core";
import * as github from "@actions/github";
import {PullRequestChangedFile, Repository} from "@octokit/graphql-schema";
import {GitHub} from "@actions/github/lib/utils";


async function main() {
    const owner = core.getInput("owner");
    const repository = core.getInput("repository");
    const token = core.getInput("token");
    const pullNumber = parseInt(core.getInput("pull_number"))
    const octokit = github.getOctokit(token);
    const params = [octokit, owner, repository, pullNumber]
    const changedFiles = await getPullRequestChangedFiles(...params)
    for (const changedFile of changedFiles) {
        await getChangedLineParents(...params, changedFile.path);
    }
}

async function getPullRequestChangedFiles(octokit: InstanceType<typeof GitHub>, owner: string, name: string, pullNumber: number): Promise<PullRequestChangedFile[]> {
    const query = `
        {
            repository(owner: "${owner}", name: "${name}") {
                pullRequest(number:${pullNumber}) {
                    files(first:100) {
                        nodes { path }
                        pageInfo { endCursor }
                    }
                }
            }
        }
    `;
    const repository = await octokit.graphql(query) as Repository;
    return repository.pullRequest.files.nodes;
}

async function getChangedLineParents(octokit: InstanceType<typeof GitHub>, owner: string, name: string, pullNumber: number, changedFilePath: string) {
    const query = `
        {    
            repository(owner: "${owner}", name: "${name}") {
                pullRequest(number:${pullNumber}) {
                    potentialMergeCommit {
                    # mergeCommit {
                        id
                        history(first:2, path:"${changedFilePath}") {
                            nodes {
                                blame(path:"${changedFilePath}") {
                                    ranges {
                                        startingLine
                                        endingLine
                                        commit {
                                            id
                                            message
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    const repository = await octokit.graphql(query) as Repository;
    const mergeCommit = repository.pullRequest.mergeCommit || repository.pullRequest.potentialMergeCommit;
    const changedLines: number[] = [];
    mergeCommit.history.nodes.forEach(commit => {
        commit.blame.ranges.forEach(blame => {
            const startingLine = blame.startingLine;
            const endingLine = blame.endingLine;
            if (blame.commit.id == mergeCommit.id) {
                changedLines.push(startingLine, endingLine);
            } else {
                for (const lineNumber of changedLines) {
                    if (lineNumber <= startingLine && lineNumber <= endingLine) {
                        console.log(`Caught: ${blame.commit.messageHeadline}`)
                    }
                }
            }
        })
    })
}

main().catch(error => {
    console.error(error);
    core.setFailed(error.message);
});
